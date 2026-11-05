import type { MappingDiagnostic, MappingSegment, SourceMapData, SourceMapStats } from "./types";

export function calculateStats(
  data: SourceMapData,
  generatedCode: string,
  diagnostics: MappingDiagnostic[],
  sortedMappings: MappingSegment[],
): SourceMapStats {
  const totalMappings = data.mappings.length;
  const lines = generatedCode.split("\n");
  const generatedLength = lines.reduce((sum, l) => sum + l.length, 0);

  const mappedBytes = calculateMappedBytes(sortedMappings, lines);
  const unmappedBytes = generatedLength - mappedBytes;
  const coveragePercent =
    generatedLength > 0 ? Math.round((mappedBytes / generatedLength) * 100) : 0;

  const fileSizes = data.sources.map((name, i) => ({
    name,
    size: data.sourcesContent[i]?.length ?? 0,
  }));

  return {
    totalMappings,
    mappedBytes,
    unmappedBytes,
    coveragePercent,
    fileSizes,
    badMappings: diagnostics.length,
  };
}

function calculateMappedBytes(sortedMappings: MappingSegment[], lines: string[]): number {
  if (sortedMappings.length === 0) return 0;

  let mappedBytes = 0;

  for (let i = 0; i < sortedMappings.length; i++) {
    const current = sortedMappings[i];
    const line = lines[current.generatedLine];
    if (line === undefined) continue;

    let endColumn: number;
    if (
      i + 1 < sortedMappings.length &&
      sortedMappings[i + 1].generatedLine === current.generatedLine
    ) {
      endColumn = sortedMappings[i + 1].generatedColumn;
    } else {
      endColumn = line.length;
    }

    endColumn = Math.min(endColumn, current.generatedEndColumn ?? line.length, line.length);
    const startColumn = Math.max(0, current.generatedColumn);
    mappedBytes += Math.max(0, endColumn - startColumn);
  }

  return mappedBytes;
}
