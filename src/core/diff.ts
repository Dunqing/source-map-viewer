import type { MappingSegment } from "./types";

export type DiffStatus = "same" | "changed" | "removed" | "added";

export interface DiffEntry {
  status: DiffStatus;
  a: MappingSegment | null;
  b: MappingSegment | null;
}

export interface DiffSummary {
  same: number;
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

function makeOriginalKey(seg: MappingSegment, sources?: string[]): string {
  return `${sourceId(seg, sources)}:${seg.originalLine}:${seg.originalColumn}`;
}

function makeExactKey(seg: MappingSegment, sources?: string[]): string {
  return `${makeGeneratedKey(seg)}|${makeOriginalKey(seg, sources)}`;
}

function buildQueueMap(
  segments: MappingSegment[],
  keyFn: (seg: MappingSegment) => string,
): Map<string, number[]> {
  const map = new Map<string, number[]>();
  segments.forEach((seg, index) => {
    const key = keyFn(seg);
    const queue = map.get(key);
    if (queue) queue.push(index);
    else map.set(key, [index]);
  });
  return map;
}

function popNextUnmatched(
  queueMap: Map<string, number[]>,
  key: string,
  used: Set<number>,
): number | null {
  const queue = queueMap.get(key);
  if (!queue) return null;

  while (queue.length > 0) {
    const index = queue.shift()!;
    if (!used.has(index)) {
      return index;
    }
  }

  return null;
}

export function findExactMappingInSameSource(
  target: MappingSegment,
  targetSources: string[] | undefined,
  candidates: MappingSegment[],
  candidateSources: string[] | undefined,
): MappingSegment | null {
  return (
    candidates.find(
      (candidate) =>
        sameSource(target, targetSources, candidate, candidateSources) &&
        makeExactKey(candidate, candidateSources) === makeExactKey(target, targetSources),
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

export function diffMappings(
  a: MappingSegment[],
  b: MappingSegment[],
  options: DiffOptions = {},
): DiffResult {
  const { sourcesA, sourcesB } = options;
  const bByExact = buildQueueMap(b, (seg) => makeExactKey(seg, sourcesB));
  const bByGenerated = buildQueueMap(b, makeGeneratedKey);
  const bByOriginal = buildQueueMap(b, (seg) => makeOriginalKey(seg, sourcesB));

  const usedA = new Set<number>();
  const usedB = new Set<number>();
  const entries: DiffEntry[] = [];
  const summary: DiffSummary = { same: 0, changed: 0, removed: 0, added: 0 };

  // First, match exact mappings: same generated and same original/source location.
  a.forEach((aSeg, index) => {
    const bIndex = popNextUnmatched(bByExact, makeExactKey(aSeg, sourcesA), usedB);
    if (bIndex == null) return;

    usedA.add(index);
    usedB.add(bIndex);
    entries.push({ status: "same", a: aSeg, b: b[bIndex] });
    summary.same++;
  });

  // Then, match remaining mappings that still share the same generated point.
  a.forEach((aSeg, index) => {
    if (usedA.has(index)) return;

    const bIndex = popNextUnmatched(bByGenerated, makeGeneratedKey(aSeg), usedB);
    if (bIndex == null) return;

    usedA.add(index);
    usedB.add(bIndex);
    entries.push({ status: "changed", a: aSeg, b: b[bIndex] });
    summary.changed++;
  });

  // Finally, match remaining mappings that kept the same original point but moved on the generated side.
  a.forEach((aSeg, index) => {
    if (usedA.has(index)) return;

    const bIndex = popNextUnmatched(bByOriginal, makeOriginalKey(aSeg, sourcesA), usedB);
    if (bIndex == null) return;

    usedA.add(index);
    usedB.add(bIndex);
    entries.push({ status: "changed", a: aSeg, b: b[bIndex] });
    summary.changed++;
  });

  // Any unmatched A mappings were removed.
  a.forEach((aSeg, index) => {
    if (!usedA.has(index)) {
      entries.push({ status: "removed", a: aSeg, b: null });
      summary.removed++;
    }
  });

  // Any unmatched B mappings were added.
  b.forEach((bSeg, index) => {
    if (!usedB.has(index)) {
      entries.push({ status: "added", a: null, b: bSeg });
      summary.added++;
    }
  });

  // Sort by generated position
  entries.sort((x, y) => {
    const xSeg = x.a ?? x.b!;
    const ySeg = y.a ?? y.b!;
    if (xSeg.generatedLine !== ySeg.generatedLine) return xSeg.generatedLine - ySeg.generatedLine;
    return xSeg.generatedColumn - ySeg.generatedColumn;
  });

  return { entries, summary };
}
