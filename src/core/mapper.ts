import type { InverseMappingIndex, MappingIndex, MappingSegment } from "./types";

export function buildMappingIndex(segments: MappingSegment[]): MappingIndex {
  return [...segments].sort((a, b) => {
    if (a.generatedLine !== b.generatedLine) return a.generatedLine - b.generatedLine;
    return a.generatedColumn - b.generatedColumn;
  });
}

export function buildInverseMappingIndex(segments: MappingSegment[]): InverseMappingIndex {
  const index: InverseMappingIndex = new Map();

  for (const seg of segments) {
    if (!index.has(seg.sourceIndex)) {
      index.set(seg.sourceIndex, []);
    }
    index.get(seg.sourceIndex)!.push(seg);
  }

  for (const [, segs] of index) {
    segs.sort((a, b) => {
      if (a.originalLine !== b.originalLine) return a.originalLine - b.originalLine;
      return a.originalColumn - b.originalColumn;
    });
  }

  return index;
}

export function findMappingForGenerated(
  index: MappingIndex,
  line: number,
  column: number,
): MappingSegment | null {
  let lo = 0;
  let hi = index.length - 1;

  // Find first segment on this line
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    if (index[mid].generatedLine < line) lo = mid + 1;
    else hi = mid - 1;
  }

  const lineStart = lo;

  // Find last segment on this line
  hi = index.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    if (index[mid].generatedLine <= line) lo = mid + 1;
    else hi = mid - 1;
  }

  const lineEnd = hi;

  if (lineStart > lineEnd || index[lineStart].generatedLine !== line) {
    return null;
  }

  // Binary search within the line for the last segment with column <= target
  lo = lineStart;
  hi = lineEnd;
  let result: MappingSegment | null = null;

  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    if (index[mid].generatedColumn <= column) {
      result = index[mid];
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  return result;
}

export function findMappingsForOriginal(
  inverse: InverseMappingIndex,
  sourceIndex: number,
  originalLine: number,
  originalColumn: number,
): MappingSegment[] {
  const sourceSegments = inverse.get(sourceIndex);
  if (!sourceSegments) return [];

  return sourceSegments.filter(
    (seg) => seg.originalLine === originalLine && seg.originalColumn === originalColumn,
  );
}
