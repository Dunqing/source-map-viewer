import type { MappingDiagnostic, SourceMapData } from "./types";

export function validateMappings(data: SourceMapData): MappingDiagnostic[] {
  const diagnostics: MappingDiagnostic[] = [];

  const sourceLines: (string[] | null)[] = data.sourcesContent.map((content) =>
    content !== null ? content.split("\n") : null,
  );

  for (const segment of data.mappings) {
    if (segment.sourceIndex < 0 || segment.sourceIndex >= data.sources.length) {
      diagnostics.push({
        segment,
        type: "invalid-source",
        message: `Source index ${segment.sourceIndex} is out of bounds (${data.sources.length} sources available)`,
      });
      continue;
    }

    const lines = sourceLines[segment.sourceIndex];
    if (lines === null) continue;

    if (segment.originalLine < 0 || segment.originalLine >= lines.length) {
      diagnostics.push({
        segment,
        type: "out-of-bounds",
        message: `Original line ${segment.originalLine} exceeds source length (${lines.length} lines)`,
      });
      continue;
    }

    const lineContent = lines[segment.originalLine];
    if (segment.originalColumn < 0 || segment.originalColumn > lineContent.length) {
      diagnostics.push({
        segment,
        type: "out-of-bounds",
        message: `Original column ${segment.originalColumn} exceeds line length (${lineContent.length} chars)`,
      });
    }
  }

  return diagnostics;
}
