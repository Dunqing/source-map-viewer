import type { MappingSegment } from "./types";

export type DiffStatus = "same" | "shifted" | "changed" | "removed" | "added";

/**
 * Direction and magnitude of a paired mapping's movement between A and B.
 * Populated on every paired entry whose positions differ at all (status
 * `"shifted"` or `"changed"`). Status `"shifted"` is a UI hint that the
 * movement fits the bilateral same-line shift pattern (e.g. uniform off-by-N
 * fix); the pattern detector groups paired entries by the values in this
 * vector regardless of status.
 */
export interface ShiftVector {
  genLine: number;
  genCol: number;
  srcLine: number;
  srcCol: number;
}

export interface DiffEntry {
  status: DiffStatus;
  a: MappingSegment | null;
  b: MappingSegment | null;
  shift?: ShiftVector;
}

export interface DiffSummary {
  same: number;
  shifted: number;
  changed: number;
  removed: number;
  added: number;
}

export interface DiffResult {
  entries: DiffEntry[];
  summary: DiffSummary;
}

export interface DiffOptions {
  sourcesA?: string[];
  sourcesB?: string[];
  namesA?: string[];
  namesB?: string[];
  ignoreSourceName?: boolean;
}

function sameSource(
  target: MappingSegment,
  targetSources: string[] | undefined,
  candidate: MappingSegment,
  candidateSources: string[] | undefined,
): boolean {
  return sourceId(target, targetSources) === sourceId(candidate, candidateSources);
}

function makeGeneratedKey(seg: MappingSegment): string {
  return `${seg.generatedLine}:${seg.generatedColumn}`;
}

export function normalizeSourceName(source: string): string {
  return source.replace(/\\/g, "/").replace(/^(\.\/)+/, "");
}

function sourceId(seg: MappingSegment, sources?: string[]): string {
  const source = sources?.[seg.sourceIndex];
  return source ? normalizeSourceName(source) : `#${seg.sourceIndex}`;
}

function nameId(seg: MappingSegment, names?: string[]): string {
  if (seg.nameIndex == null) return "";
  return names?.[seg.nameIndex] ?? `#${seg.nameIndex}`;
}

function makeOriginalKey(
  seg: MappingSegment,
  sources?: string[],
  ignoreSourceName?: boolean,
): string {
  const sourcePart = ignoreSourceName ? "" : sourceId(seg, sources);
  return `${sourcePart}:${seg.originalLine}:${seg.originalColumn}`;
}

function makeExactKey(
  seg: MappingSegment,
  sources?: string[],
  names?: string[],
  ignoreSourceName?: boolean,
): string {
  return `${makeGeneratedKey(seg)}|${makeOriginalKey(seg, sources, ignoreSourceName)}|${nameId(seg, names)}`;
}

export function findExactMappingInSameSource(
  target: MappingSegment,
  targetSources: string[] | undefined,
  candidates: MappingSegment[],
  candidateSources: string[] | undefined,
  targetNames?: string[],
  candidateNames?: string[],
): MappingSegment | null {
  return (
    candidates.find(
      (candidate) =>
        sameSource(target, targetSources, candidate, candidateSources) &&
        makeExactKey(candidate, candidateSources, candidateNames) ===
          makeExactKey(target, targetSources, targetNames),
    ) ?? null
  );
}

export function findNearestMappingInSameSource(
  target: MappingSegment,
  targetSources: string[] | undefined,
  candidates: MappingSegment[],
  candidateSources: string[] | undefined,
): MappingSegment | null {
  const sameSourceCandidates = candidates.filter((candidate) =>
    sameSource(target, targetSources, candidate, candidateSources),
  );
  if (sameSourceCandidates.length === 0) return null;

  let best: { seg: MappingSegment; score: number } | null = null;

  for (const candidate of sameSourceCandidates) {
    const originalLineDelta = Math.abs(candidate.originalLine - target.originalLine);
    const generatedLineDelta = Math.abs(candidate.generatedLine - target.generatedLine);
    const originalColumnDelta = Math.abs(candidate.originalColumn - target.originalColumn);
    const generatedColumnDelta = Math.abs(candidate.generatedColumn - target.generatedColumn);
    const score =
      originalLineDelta * 1_000_000 +
      generatedLineDelta * 10_000 +
      originalColumnDelta * 100 +
      generatedColumnDelta;

    if (!best || score < best.score) {
      best = { seg: candidate, score };
    }
  }

  return best?.seg ?? null;
}

const INFINITE_COST = Number.POSITIVE_INFINITY;

// Caps for pair candidacy. Beyond these, mappings are considered unrelated
// and fall through to removed/added rather than being paired.
const COL_LIMIT = 30;
const LINE_LIMIT_RELOCATION = 2;
// Single-axis movements (one of gen/src completely pinned) get a more
// generous line limit. Same-gen mappings whose source moved across many
// lines still represent "this output character now points elsewhere" and
// should pair so the table shows a single `changed` row instead of twin
// removed/added rows. Cost grows with distance to keep close pairs preferred.
const LINE_LIMIT_SINGLE_AXIS_GEN_PINNED = 100;
const LINE_LIMIT_SINGLE_AXIS_SRC_PINNED = 5;

// Shift-signature window: bilateral same-line shifts within these bounds get
// the `"shifted"` status (UI hint for "uniform off-by-N fix").
const SHIFT_SIGNATURE_COL_LIMIT = 5;

// Cost bases — calibrated so the natural greedy pairing beats cross-pairings.
// Specifically: a single-axis off-by-1 must be cheaper than a bilateral
// shift across non-adjacent pairs. See diff.test.ts for the calibration cases.
const COST_BILATERAL_SHIFT_BASE = 6;
const COST_SINGLE_AXIS_BASE = 5;
const COST_BOTH_MOVED_SAME_LINE = 30;
const COST_RELOCATION_BASE = 50;
const RELOCATION_LINE_PENALTY = 20;
const SINGLE_AXIS_LINE_PENALTY = 15;

const NAME_DELTA_PENALTY = 5;
// Source-name mismatch is treated as a renamed file rather than a hard reject:
// downstream UI surfaces the rename as a chip, but the mapping should still
// pair so reviewers see a single "before.js → after.js" entry instead of
// confusing twin removed/added rows.
const SOURCE_MISMATCH_PENALTY = 40;

interface CostResult {
  cost: number;
  shift?: ShiftVector;
  /** True when the pair fits the bilateral small same-line shift pattern. */
  hasShiftSignature?: boolean;
}

/**
 * Score how well two mappings pair up. Lower is better.
 *
 *   - 0..5    exact match (cost 0) or name-only delta (cost 5)
 *   - 5..30   single-axis movement (one of gen / src pinned, the other moved)
 *   - 6..16   bilateral small same-line shift (carries shift signature)
 *   - 30..90  both axes moved on same line (no shift signature)
 *   - 50..150 cross-line bounded relocation
 *   - INFINITE  cannot pair (distance too large)
 *
 * Calibration: a single-axis off-by-1 (cost ≈ 6) must be cheaper than a
 * bilateral cross-pairing for the same data (cost ≈ 9 when |Δgen|+|Δsrc| ≥ 3),
 * so the greedy matcher prefers natural pairings over crossed ones.
 */
function pairCost(a: MappingSegment, b: MappingSegment, options: DiffOptions): CostResult {
  const { sourcesA, sourcesB, namesA, namesB, ignoreSourceName } = options;

  const sourceMismatch = !ignoreSourceName && sourceId(a, sourcesA) !== sourceId(b, sourcesB);
  const sourcePenalty = sourceMismatch ? SOURCE_MISMATCH_PENALTY : 0;

  const dGenLine = b.generatedLine - a.generatedLine;
  const dGenCol = b.generatedColumn - a.generatedColumn;
  const dSrcLine = b.originalLine - a.originalLine;
  const dSrcCol = b.originalColumn - a.originalColumn;
  const nameDelta = nameId(a, namesA) !== nameId(b, namesB) ? NAME_DELTA_PENALTY : 0;
  const extraPenalty = nameDelta + sourcePenalty;

  // Vector populated whenever positions differ at all. Used by the pattern
  // detector to cluster paired entries by movement shape, regardless of which
  // status branch they ended up in.
  const hasMoved = dGenLine !== 0 || dGenCol !== 0 || dSrcLine !== 0 || dSrcCol !== 0;
  const shift: ShiftVector | undefined = hasMoved
    ? { genLine: dGenLine, genCol: dGenCol, srcLine: dSrcLine, srcCol: dSrcCol }
    : undefined;

  if (!hasMoved) {
    return { cost: extraPenalty };
  }

  const absDGenLine = Math.abs(dGenLine);
  const absDGenCol = Math.abs(dGenCol);
  const absDSrcLine = Math.abs(dSrcLine);
  const absDSrcCol = Math.abs(dSrcCol);

  // Branch 1 — single axis pinned. Common sourcemap-fix patterns: src moved
  // (the off-by-one closing-delimiter case) or gen moved (indent fix).
  // Cheap so the greedy matcher prefers the natural pair when the same A/B
  // could also be reached via a more expensive bilateral cross-pairing.
  if (dGenLine === 0 && dGenCol === 0) {
    if (absDSrcLine > LINE_LIMIT_SINGLE_AXIS_GEN_PINNED || absDSrcCol > COL_LIMIT) {
      return { cost: INFINITE_COST };
    }
    return {
      cost:
        COST_SINGLE_AXIS_BASE + absDSrcLine * SINGLE_AXIS_LINE_PENALTY + absDSrcCol + extraPenalty,
      shift,
    };
  }
  if (dSrcLine === 0 && dSrcCol === 0) {
    if (absDGenLine > LINE_LIMIT_SINGLE_AXIS_SRC_PINNED || absDGenCol > COL_LIMIT) {
      return { cost: INFINITE_COST };
    }
    return {
      cost:
        COST_SINGLE_AXIS_BASE + absDGenLine * SINGLE_AXIS_LINE_PENALTY + absDGenCol + extraPenalty,
      shift,
    };
  }

  // Branch 2 — bilateral small same-line shift (uniform-shift signature).
  // Surfaces as status `"shifted"` in the UI; only when both gen and src
  // moved by a small column count on the same line.
  if (
    dGenLine === 0 &&
    dSrcLine === 0 &&
    absDGenCol <= SHIFT_SIGNATURE_COL_LIMIT &&
    absDSrcCol <= SHIFT_SIGNATURE_COL_LIMIT
  ) {
    return {
      cost: COST_BILATERAL_SHIFT_BASE + absDGenCol + absDSrcCol + extraPenalty,
      shift,
      hasShiftSignature: true,
    };
  }

  // Branch 3 — both axes moved on the same line, larger than shift signature.
  if (dGenLine === 0 && dSrcLine === 0 && absDGenCol <= COL_LIMIT && absDSrcCol <= COL_LIMIT) {
    return {
      cost: COST_BOTH_MOVED_SAME_LINE + absDGenCol + absDSrcCol + extraPenalty,
      shift,
    };
  }

  // Branch 4 — bounded cross-line relocation. Last fallback before INFINITE.
  if (
    absDGenLine <= LINE_LIMIT_RELOCATION &&
    absDSrcLine <= LINE_LIMIT_RELOCATION &&
    absDGenCol <= COL_LIMIT &&
    absDSrcCol <= COL_LIMIT
  ) {
    return {
      cost:
        COST_RELOCATION_BASE +
        (absDGenLine + absDSrcLine) * RELOCATION_LINE_PENALTY +
        absDGenCol +
        absDSrcCol +
        extraPenalty,
      shift,
    };
  }

  return { cost: INFINITE_COST };
}

interface CandidateEdge {
  aIdx: number;
  bIdx: number;
  cost: number;
  shift?: ShiftVector;
  hasShiftSignature?: boolean;
}

/**
 * Greedy bipartite assignment by ascending cost. Each segment is matched at
 * most once. Returns the chosen pairs and the unmatched indices on each side.
 *
 * Sourcemap mappings rarely have ambiguous best matches in practice (positions
 * are spatially distinct), so greedy is usually optimal and is much cheaper
 * than full Hungarian. If pathological cases turn up we can swap solvers.
 */
function bipartiteMatch(
  a: MappingSegment[],
  b: MappingSegment[],
  options: DiffOptions,
): {
  pairs: CandidateEdge[];
  unmatchedA: number[];
  unmatchedB: number[];
} {
  const bByGenLine = new Map<number, number[]>();
  for (let bIdx = 0; bIdx < b.length; bIdx++) {
    const line = b[bIdx].generatedLine;
    const arr = bByGenLine.get(line);
    if (arr) arr.push(bIdx);
    else bByGenLine.set(line, [bIdx]);
  }

  // Build candidate edges where cost is finite. The window must cover the
  // largest gen-line distance any branch in pairCost accepts, otherwise we'd
  // silently miss pairs that the cost function would have accepted. The
  // src-pinned branch is the binding case (gen line moves up to
  // LINE_LIMIT_SINGLE_AXIS_SRC_PINNED while src stays put); the
  // gen-pinned branch always has dGenLine == 0 and the relocation branch is
  // bounded by the smaller LINE_LIMIT_RELOCATION.
  const window = Math.max(LINE_LIMIT_RELOCATION, LINE_LIMIT_SINGLE_AXIS_SRC_PINNED);
  const edges: CandidateEdge[] = [];
  for (let aIdx = 0; aIdx < a.length; aIdx++) {
    const aSeg = a[aIdx];
    for (let dLine = -window; dLine <= window; dLine++) {
      const bIndices = bByGenLine.get(aSeg.generatedLine + dLine);
      if (!bIndices) continue;
      for (const bIdx of bIndices) {
        const result = pairCost(aSeg, b[bIdx], options);
        if (result.cost < INFINITE_COST) {
          edges.push({
            aIdx,
            bIdx,
            cost: result.cost,
            shift: result.shift,
            hasShiftSignature: result.hasShiftSignature,
          });
        }
      }
    }
  }

  // Sort by cost ascending. Ties broken by aIdx then bIdx for stability.
  edges.sort((x, y) => {
    if (x.cost !== y.cost) return x.cost - y.cost;
    if (x.aIdx !== y.aIdx) return x.aIdx - y.aIdx;
    return x.bIdx - y.bIdx;
  });

  const usedA = new Set<number>();
  const usedB = new Set<number>();
  const pairs: CandidateEdge[] = [];

  for (const edge of edges) {
    if (usedA.has(edge.aIdx) || usedB.has(edge.bIdx)) continue;
    pairs.push(edge);
    usedA.add(edge.aIdx);
    usedB.add(edge.bIdx);
  }

  const unmatchedA: number[] = [];
  for (let aIdx = 0; aIdx < a.length; aIdx++) {
    if (!usedA.has(aIdx)) unmatchedA.push(aIdx);
  }
  const unmatchedB: number[] = [];
  for (let bIdx = 0; bIdx < b.length; bIdx++) {
    if (!usedB.has(bIdx)) unmatchedB.push(bIdx);
  }

  return { pairs, unmatchedA, unmatchedB };
}

function classify(cost: number, hasShiftSignature: boolean): DiffStatus {
  if (cost === 0) return "same";
  if (hasShiftSignature) return "shifted";
  return "changed";
}

export function diffMappings(
  a: MappingSegment[],
  b: MappingSegment[],
  options: DiffOptions = {},
): DiffResult {
  const { pairs, unmatchedA, unmatchedB } = bipartiteMatch(a, b, options);

  const entries: DiffEntry[] = [];
  const summary: DiffSummary = { same: 0, shifted: 0, changed: 0, removed: 0, added: 0 };

  for (const edge of pairs) {
    const status = classify(edge.cost, edge.hasShiftSignature === true);
    const entry: DiffEntry = { status, a: a[edge.aIdx], b: b[edge.bIdx] };
    if (edge.shift !== undefined) entry.shift = edge.shift;
    entries.push(entry);
    summary[status]++;
  }

  for (const aIdx of unmatchedA) {
    entries.push({ status: "removed", a: a[aIdx], b: null });
    summary.removed++;
  }
  for (const bIdx of unmatchedB) {
    entries.push({ status: "added", a: null, b: b[bIdx] });
    summary.added++;
  }

  // Sort entries by generated position so the table reads top-to-bottom in
  // output order regardless of how matching proceeded.
  entries.sort((x, y) => {
    const xSeg = x.a ?? x.b!;
    const ySeg = y.a ?? y.b!;
    if (xSeg.generatedLine !== ySeg.generatedLine) return xSeg.generatedLine - ySeg.generatedLine;
    return xSeg.generatedColumn - ySeg.generatedColumn;
  });

  return { entries, summary };
}
