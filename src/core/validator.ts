import type {
  InverseMappingIndex,
  MappingDiagnostic,
  MappingIndex,
  MappingSegment,
  SourceMapData,
} from "./types";

function isIdentifierChar(char: string | undefined): boolean {
  return char !== undefined && /[A-Za-z0-9_$]/.test(char);
}

function splitsIdentifierAt(lineText: string | undefined, column: number): boolean {
  if (!lineText || column <= 0 || column >= lineText.length) return false;
  return isIdentifierChar(lineText[column - 1]) && isIdentifierChar(lineText[column]);
}

function markTokenSplitSegments(
  segments: MappingSegment[],
  getLine: (segment: MappingSegment) => number,
  getColumn: (segment: MappingSegment) => number,
  getLineText: (segment: MappingSegment, line: number) => string | undefined,
  result: Set<MappingSegment>,
  areGroupsAdjacent: (
    previousGroup: MappingSegment[],
    currentGroup: MappingSegment[],
  ) => boolean = () => true,
) {
  let previousLine = -1;
  let previousGroup: MappingSegment[] | null = null;

  for (let i = 0; i < segments.length; ) {
    const segment = segments[i];
    const line = getLine(segment);
    const column = getColumn(segment);
    const group: MappingSegment[] = [];

    while (
      i < segments.length &&
      getLine(segments[i]) === line &&
      getColumn(segments[i]) === column
    ) {
      group.push(segments[i]);
      i++;
    }

    if (
      previousGroup &&
      previousLine === line &&
      areGroupsAdjacent(previousGroup, group) &&
      splitsIdentifierAt(getLineText(segment, line), column)
    ) {
      for (const previous of previousGroup) result.add(previous);
      for (const current of group) result.add(current);
    }

    previousLine = line;
    previousGroup = group;
  }
}

export function validateMappings(data: SourceMapData): MappingDiagnostic[] {
  const diagnostics: MappingDiagnostic[] = [];

  for (const segment of data.mappings) {
    if (segment.sourceIndex < 0 || segment.sourceIndex >= data.sources.length) {
      diagnostics.push({
        segment,
        type: "invalid-source",
        message: `Source index ${segment.sourceIndex} is out of bounds (${data.sources.length} sources available)`,
      });
      continue;
    }

    if (segment.originalLine < 0) {
      diagnostics.push({
        segment,
        type: "out-of-bounds",
        message: `Original line ${segment.originalLine} is negative`,
      });
      continue;
    }

    if (segment.originalColumn < 0) {
      diagnostics.push({
        segment,
        type: "out-of-bounds",
        message: `Original column ${segment.originalColumn} is negative`,
      });
    }
  }

  return diagnostics;
}

export function findTokenSplitSegments(
  data: SourceMapData,
  generatedCode: string,
  mappingIndex: MappingIndex,
  inverseMappingIndex: InverseMappingIndex,
): Set<MappingSegment> {
  const result = new Set<MappingSegment>();
  const generatedLines = generatedCode.split("\n");
  const sourceLines = data.sourcesContent.map((content) => content?.split("\n") ?? null);
  const generatedOrder = new Map<MappingSegment, number>();

  mappingIndex.forEach((segment, index) => {
    generatedOrder.set(segment, index);
  });

  function areAdjacentInGeneratedOrder(
    previousGroup: MappingSegment[],
    currentGroup: MappingSegment[],
  ): boolean {
    return previousGroup.some((previous) =>
      currentGroup.some((current) => {
        const previousIndex = generatedOrder.get(previous);
        const currentIndex = generatedOrder.get(current);
        return (
          previousIndex !== undefined &&
          currentIndex !== undefined &&
          current.generatedLine === previous.generatedLine &&
          current.generatedColumn !== previous.generatedColumn &&
          currentIndex === previousIndex + 1
        );
      }),
    );
  }

  markTokenSplitSegments(
    mappingIndex,
    (segment) => segment.generatedLine,
    (segment) => segment.generatedColumn,
    (_segment, line) => generatedLines[line],
    result,
  );

  for (const [sourceIndex, segments] of inverseMappingIndex) {
    const lines = sourceLines[sourceIndex];
    if (!lines) continue;
    markTokenSplitSegments(
      segments,
      (segment) => segment.originalLine,
      (segment) => segment.originalColumn,
      (_segment, line) => lines[line],
      result,
      areAdjacentInGeneratedOrder,
    );
  }

  return result;
}
