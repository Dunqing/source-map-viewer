import type { InverseMappingIndex, MappingIndex, MappingSegment } from "./types";

export interface RenderedColumnRange {
  start: number;
  end: number;
}

/**
 * Clamp an original position to valid bounds within source content,
 * matching Chrome DevTools behavior.
 *
 * Chrome does:
 *   const line = doc.line(Math.max(1, Math.min(doc.lines, lineNumber + 1)));
 *   return Math.max(line.from, Math.min(line.to, line.from + columnNumber));
 */
export function clampOriginalPosition(
  originalLine: number,
  originalColumn: number,
  sourceLines: string[],
): { line: number; column: number } {
  if (sourceLines.length === 0) {
    return { line: 0, column: 0 };
  }

  const line = Math.max(0, Math.min(sourceLines.length - 1, originalLine));
  const lineContent = sourceLines[line];
  const column = Math.max(0, Math.min(lineContent.length, originalColumn));

  return { line, column };
}

function clampDisplayColumn(column: number, lineLength: number): number {
  return Math.max(0, Math.min(lineLength, column));
}

export function skipLeadingWhitespace(lineText: string, column: number): number {
  const clamped = clampDisplayColumn(column, lineText.length);
  const firstCode = lineText.search(/\S/);
  if (firstCode < 0) return clamped;
  return Math.max(clamped, firstCode);
}

export function getRenderedColumnRange(
  columns: readonly number[],
  index: number,
  lineText: string,
  { skipIndent = false }: { skipIndent?: boolean } = {},
): RenderedColumnRange {
  const normalize = skipIndent
    ? (column: number) => skipLeadingWhitespace(lineText, column)
    : (column: number) => clampDisplayColumn(column, lineText.length);

  const start = normalize(columns[index] ?? 0);

  for (let i = index + 1; i < columns.length; i++) {
    const next = normalize(columns[i] ?? 0);
    if (next > start) {
      return { start, end: next };
    }
  }

  return { start, end: lineText.length };
}

export function buildMappingIndex(segments: MappingSegment[]): MappingIndex {
  return [...segments].sort((a, b) => {
    if (a.generatedLine !== b.generatedLine) return a.generatedLine - b.generatedLine;
    return a.generatedColumn - b.generatedColumn;
  });
}

export function buildVisibleGeneratedMappingIndex(
  index: MappingIndex,
  generatedLines: string[],
): MappingIndex {
  const visible: MappingSegment[] = [];

  let start = 0;
  while (start < index.length) {
    const line = index[start].generatedLine;
    let end = start + 1;
    while (end < index.length && index[end].generatedLine === line) {
      end++;
    }

    const mappingsOnLine = index.slice(start, end);
    const lineText = generatedLines[line] ?? "";
    if (lineText.length === 0) {
      visible.push(...mappingsOnLine);
      start = end;
      continue;
    }

    const columns = mappingsOnLine.map((seg) => seg.generatedColumn);
    const charOwner: (MappingSegment | null)[] = Array.from(
      { length: lineText.length },
      () => null,
    );

    for (let i = 0; i < mappingsOnLine.length; i++) {
      const seg = mappingsOnLine[i];
      const { start: startCol, end: endCol } = getRenderedColumnRange(columns, i, lineText, {
        skipIndent: true,
      });
      for (let c = startCol; c < endCol && c < lineText.length; c++) {
        charOwner[c] = seg;
      }
    }

    const owners = new Set(charOwner.filter((seg): seg is MappingSegment => seg !== null));
    for (const seg of mappingsOnLine) {
      if (owners.has(seg)) visible.push(seg);
    }

    start = end;
  }

  return visible;
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
