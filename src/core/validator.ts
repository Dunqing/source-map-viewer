import type { MappingDiagnostic, SourceMapData } from "./types";

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
