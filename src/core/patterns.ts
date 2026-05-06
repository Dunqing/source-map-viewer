import type { DiffEntry, ShiftVector } from "./diff";
import { normalizeSourceName } from "./diff";
import type { MappingSegment } from "./types";

/**
 * Pattern detection over a `diffMappings` result. Groups paired entries by
 * shift shape and unpaired entries by adjacency, so the UI can surface
 * "uniform off-by-N fix" / "indent shift" / "block add" stories instead of
 * making the reviewer pair rows by eye.
 */
export type PatternKind = "shift" | "rename" | "added-block" | "removed-block";

export interface Pattern {
  kind: PatternKind;
  members: DiffEntry[];
  /**
   * Human-readable summary like `"3 mappings shifted by Δsrc(0,-1) on input.js"`.
   * UI surfaces this directly; the typed fields below are for richer rendering.
   */
  description: string;
  /**
   * Stable content-derived identifier. Survives recomputes (e.g. toggling
   * `ignoreSourceName`) so a pattern selected in the UI keeps pointing to
   * "the same" pattern even when the underlying entries are rebuilt.
   * Format depends on kind — see `makePatternKey`.
   */
  key: string;
  /** Populated for `kind === "shift"` — the common Δ shared by all members. */
  shift?: ShiftVector;
  /** Populated for `kind === "rename"` — the resolved source-name pair. */
  sourceFrom?: string;
  sourceTo?: string;
  /** The source file context for shift patterns. */
  sourceName?: string;
}

export interface DetectPatternsOptions {
  sourcesA?: string[];
  sourcesB?: string[];
  /**
   * Minimum number of members for a cluster to surface as a pattern. Defaults
   * to 2 — singleton shifts/renames/adds are left for the table view.
   */
  minSize?: number;
  /**
   * When true, suppress rename-pattern detection. Mirrors the diff matcher's
   * `ignoreSourceName` option: the user explicitly asked to ignore source-
   * filename changes, so surfacing "12 mappings renamed" patterns under that
   * setting would contradict their toggle.
   */
  ignoreSourceName?: boolean;
}

/**
 * Detect patterns in a sorted-by-gen-position list of `DiffEntry`. Returns
 * patterns ordered by member count descending so the most impactful pattern
 * lands at the top of the summary card.
 */
export function detectPatterns(
  entries: DiffEntry[],
  options: DetectPatternsOptions = {},
): Pattern[] {
  const { sourcesA, sourcesB, minSize = 2, ignoreSourceName = false } = options;

  const patterns: Pattern[] = [];

  // 1. Bucket paired entries with non-zero shift by (Δ shape, source).
  //    Both `shifted` and `changed` statuses can carry a shift — we group on
  //    the vector, not the status, so an indent fix that registered as
  //    `changed` (single-axis) still surfaces as a pattern.
  const shiftBuckets = new Map<string, Pattern>();
  for (const entry of entries) {
    if (entry.a == null || entry.b == null || entry.shift == null) continue;
    if (isZeroShift(entry.shift)) continue;
    const sourceName = resolveSourceName(entry.a, sourcesA);
    const key = shiftKey(entry.shift, sourceName);
    let pattern = shiftBuckets.get(key);
    if (!pattern) {
      pattern = {
        kind: "shift",
        members: [],
        description: "",
        key: "",
        shift: entry.shift,
        sourceName,
      };
      shiftBuckets.set(key, pattern);
    }
    pattern.members.push(entry);
  }
  for (const pattern of shiftBuckets.values()) {
    if (pattern.members.length >= minSize) {
      pattern.description = describeShift(pattern);
      pattern.key = makePatternKey(pattern);
      patterns.push(pattern);
    }
  }

  // 2. Bucket paired entries with no movement but differing source names —
  //    pure renames. (Same source name with no movement is `status: "same"`,
  //    which we ignore.) Skipped entirely under `ignoreSourceName` because
  //    the user has asked the matcher to treat name-only changes as no-op,
  //    so surfacing the rename pattern card would contradict the toggle.
  if (!ignoreSourceName) {
    const renameBuckets = new Map<string, Pattern>();
    for (const entry of entries) {
      if (entry.a == null || entry.b == null) continue;
      if (entry.shift != null && !isZeroShift(entry.shift)) continue;
      const fromName = resolveSourceName(entry.a, sourcesA);
      const toName = resolveSourceName(entry.b, sourcesB);
      if (fromName === toName) continue;
      const key = `${fromName}=>${toName}`;
      let pattern = renameBuckets.get(key);
      if (!pattern) {
        pattern = {
          kind: "rename",
          members: [],
          description: "",
          key: "",
          sourceFrom: fromName,
          sourceTo: toName,
        };
        renameBuckets.set(key, pattern);
      }
      pattern.members.push(entry);
    }
    for (const pattern of renameBuckets.values()) {
      if (pattern.members.length >= minSize) {
        pattern.description = describeRename(pattern);
        pattern.key = makePatternKey(pattern);
        patterns.push(pattern);
      }
    }
  }

  // 3. Adjacency-cluster `added` and `removed` entries. Two entries are
  //    "adjacent" when their gen positions differ by ≤ 1 line. Entries are
  //    already sorted by gen position from `diffMappings`, so a single
  //    forward pass groups them.
  for (const status of ["added", "removed"] as const) {
    const filtered = entries.filter((entry) => entry.status === status);
    let cluster: DiffEntry[] = [];
    const flush = () => {
      if (cluster.length >= minSize) {
        const kind: PatternKind = status === "added" ? "added-block" : "removed-block";
        const sourceName =
          status === "added"
            ? resolveSourceName(cluster[0].b!, sourcesB)
            : resolveSourceName(cluster[0].a!, sourcesA);
        patterns.push({
          kind,
          members: [...cluster],
          description: describeBlock(kind, cluster, sourceName),
          key: "",
          sourceName,
        });
      }
      cluster = [];
    };
    for (const entry of filtered) {
      if (cluster.length === 0) {
        cluster.push(entry);
        continue;
      }
      const last = cluster[cluster.length - 1];
      if (areAdjacent(last, entry, status)) {
        cluster.push(entry);
      } else {
        flush();
        cluster.push(entry);
      }
    }
    flush();
  }

  // Compute keys for block patterns (shift / rename keys were set above).
  for (const pattern of patterns) {
    if (!pattern.key) pattern.key = makePatternKey(pattern);
  }

  // Sort by member count descending so the largest impact lands first.
  patterns.sort((x, y) => y.members.length - x.members.length);
  return patterns;
}

function isZeroShift(shift: ShiftVector): boolean {
  return shift.genLine === 0 && shift.genCol === 0 && shift.srcLine === 0 && shift.srcCol === 0;
}

/**
 * Build a content-derived key for a pattern. Stable across recomputes of the
 * diff result so UI selection survives toggles like `ignoreSourceName`.
 *
 * Uses `` as the field separator so that source names containing `@`,
 * `:`, `/`, or any other common path char can't accidentally collide with
 * another pattern's key.
 */
function makePatternKey(pattern: Pattern): string {
  const SEP = "";
  switch (pattern.kind) {
    case "shift": {
      const s = pattern.shift!;
      return [
        "shift",
        pattern.sourceName ?? "",
        `${s.genLine},${s.genCol}`,
        `${s.srcLine},${s.srcCol}`,
      ].join(SEP);
    }
    case "rename":
      return ["rename", pattern.sourceFrom ?? "", pattern.sourceTo ?? ""].join(SEP);
    case "added-block":
    case "removed-block": {
      const member = pattern.kind === "added-block" ? pattern.members[0].b : pattern.members[0].a;
      return [
        pattern.kind,
        pattern.sourceName ?? "",
        member ? `${member.generatedLine},${member.generatedColumn}` : "?",
      ].join(SEP);
    }
  }
}

function shiftKey(shift: ShiftVector, source: string): string {
  return `${shift.genLine}:${shift.genCol}|${shift.srcLine}:${shift.srcCol}@${source}`;
}

function resolveSourceName(seg: MappingSegment, sources: string[] | undefined): string {
  const raw = sources?.[seg.sourceIndex];
  return raw ? normalizeSourceName(raw) : `#${seg.sourceIndex}`;
}

function describeShift(pattern: Pattern): string {
  const shift = pattern.shift!;
  const count = pattern.members.length;
  const noun = count === 1 ? "mapping" : "mappings";
  const where = pattern.sourceName ? ` on ${pattern.sourceName}` : "";
  return `${count} ${noun} shifted by Δsrc(${shift.srcLine},${shift.srcCol}) Δgen(${shift.genLine},${shift.genCol})${where}`;
}

function describeRename(pattern: Pattern): string {
  const count = pattern.members.length;
  const noun = count === 1 ? "mapping" : "mappings";
  return `${count} ${noun} renamed (${pattern.sourceFrom} → ${pattern.sourceTo})`;
}

function describeBlock(
  kind: "added-block" | "removed-block",
  cluster: DiffEntry[],
  sourceName: string,
): string {
  const verb = kind === "added-block" ? "added" : "removed";
  const count = cluster.length;
  const first = (kind === "added-block" ? cluster[0].b : cluster[0].a)!;
  const last = (
    kind === "added-block" ? cluster[cluster.length - 1].b : cluster[cluster.length - 1].a
  )!;
  const range =
    first.generatedLine === last.generatedLine
      ? `gen line ${first.generatedLine + 1}`
      : `gen lines ${first.generatedLine + 1}–${last.generatedLine + 1}`;
  return `${count} mappings ${verb} on ${sourceName} (${range})`;
}

function areAdjacent(a: DiffEntry, b: DiffEntry, side: "added" | "removed"): boolean {
  const aSeg = side === "added" ? a.b : a.a;
  const bSeg = side === "added" ? b.b : b.a;
  if (!aSeg || !bSeg) return false;
  return Math.abs(bSeg.generatedLine - aSeg.generatedLine) <= 1;
}
