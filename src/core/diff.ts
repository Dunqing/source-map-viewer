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

function makeKey(seg: MappingSegment): string {
  return `${seg.generatedLine}:${seg.generatedColumn}`;
}

export function diffMappings(a: MappingSegment[], b: MappingSegment[]): DiffResult {
  // Build map of B by generated position
  const bByKey = new Map<string, MappingSegment>();
  for (const seg of b) bByKey.set(makeKey(seg), seg);

  const matched = new Set<string>();
  const entries: DiffEntry[] = [];
  const summary: DiffSummary = { same: 0, changed: 0, removed: 0, added: 0 };

  // Walk A, match against B
  for (const aSeg of a) {
    const key = makeKey(aSeg);
    const bSeg = bByKey.get(key);
    if (!bSeg) {
      entries.push({ status: "removed", a: aSeg, b: null });
      summary.removed++;
    } else {
      matched.add(key);
      if (
        aSeg.originalLine === bSeg.originalLine &&
        aSeg.originalColumn === bSeg.originalColumn &&
        aSeg.sourceIndex === bSeg.sourceIndex
      ) {
        entries.push({ status: "same", a: aSeg, b: bSeg });
        summary.same++;
      } else {
        entries.push({ status: "changed", a: aSeg, b: bSeg });
        summary.changed++;
      }
    }
  }

  // Remaining in B not matched
  for (const bSeg of b) {
    if (!matched.has(makeKey(bSeg))) {
      entries.push({ status: "added", a: null, b: bSeg });
      summary.added++;
    }
  }

  // Sort by generated position
  entries.sort((x, y) => {
    const xSeg = x.a ?? x.b!;
    const ySeg = y.a ?? y.b!;
    if (xSeg.generatedLine !== ySeg.generatedLine) return xSeg.generatedLine - ySeg.generatedLine;
    return xSeg.generatedColumn - ySeg.generatedColumn;
  });

  return { entries, summary };
}
