/**
 * Source map parser for restricted environments like Cloudflare Workers,
 * where source-map-js's use of `new Function()` is forbidden.
 */
import {
  decodedMappings,
  TraceMap,
  type EncodedSourceMap,
  type SectionedSourceMap,
} from "@jridgewell/trace-mapping";
import type { MappingSegment, SourceMapData } from "./types";

type RawMap = EncodedSourceMap | SectionedSourceMap;
type GeneratedPosition = { generatedLine: number; generatedColumn: number };

function comparePositions(a: GeneratedPosition, b: GeneratedPosition): number {
  return a.generatedLine - b.generatedLine || a.generatedColumn - b.generatedColumn;
}

export function parseSourceMapLite(jsonString: string): SourceMapData {
  const raw: RawMap = JSON.parse(jsonString);
  const sources: string[] = [];
  const sourcesContent: (string | null)[] = [];
  const names: string[] = [];
  const positions: (MappingSegment | GeneratedPosition)[] = [];

  function appendMap(
    input: RawMap,
    generatedLine = 0,
    generatedColumn = 0,
    end?: GeneratedPosition,
  ): void {
    if (input.version !== 3) {
      throw new Error(`Unsupported source map version: ${String(input.version)}`);
    }

    if ("sections" in input) {
      const sectionPosition = (offset: { line: number; column: number }): GeneratedPosition => ({
        generatedLine: generatedLine + offset.line,
        // A parent column offset affects only its first generated line.
        generatedColumn: offset.column + (offset.line === 0 ? generatedColumn : 0),
      });

      for (let i = 0; i < input.sections.length; i++) {
        const section = input.sections[i];
        if (!section.map) throw new Error("Source map sections must contain an embedded map");
        const start = sectionPosition(section.offset);
        const nextSection = input.sections[i + 1];
        const next = nextSection ? sectionPosition(nextSection.offset) : undefined;
        const sectionEnd = next && (!end || comparePositions(next, end) < 0) ? next : end;
        appendMap(section.map as RawMap, start.generatedLine, start.generatedColumn, sectionEnd);
      }
      return;
    }

    const map = new TraceMap(input);
    const sourceOffset = sources.length;
    const nameOffset = names.length;
    for (let i = 0; i < map.resolvedSources.length; i++) {
      sources.push(map.resolvedSources[i]);
      sourcesContent.push(map.sourcesContent?.[i] ?? null);
    }
    for (const name of map.names) names.push(name);

    const decoded = decodedMappings(map);
    for (let line = 0; line < decoded.length; line++) {
      for (const segment of decoded[line]) {
        const position = {
          generatedLine: generatedLine + line,
          generatedColumn: segment[0] + (line === 0 ? generatedColumn : 0),
        };
        // Later sections own their generated range, including nested sections.
        if (end && comparePositions(position, end) >= 0) return;
        if (segment.length === 1) {
          positions.push(position);
        } else {
          positions.push({
            ...position,
            sourceIndex: sourceOffset + segment[1],
            originalLine: segment[2],
            originalColumn: segment[3],
            nameIndex: segment.length === 5 ? nameOffset + segment[4] : null,
          });
        }
      }
    }
  }

  appendMap(raw);
  // Stable sorting retains every occurrence and its order at duplicate positions.
  positions.sort(comparePositions);
  const mappings: MappingSegment[] = [];
  let preceding: MappingSegment[] = [];
  for (const position of positions) {
    const previous = preceding[0];
    if (previous && previous.generatedLine !== position.generatedLine) preceding = [];

    if ("sourceIndex" in position) {
      if (!previous || comparePositions(previous, position) !== 0) preceding = [];
      preceding.push(position);
      mappings.push(position);
    } else {
      // Only explicit unmapped segments add an end. Apply it to all duplicates
      // at the preceding mapped position, so none can extend across the gap.
      for (const mapping of preceding) mapping.generatedEndColumn = position.generatedColumn;
      preceding = [];
    }
  }

  return {
    version: 3,
    file: raw.file ?? undefined,
    sourceRoot: "sourceRoot" in raw ? raw.sourceRoot : undefined,
    sources,
    sourcesContent,
    names,
    mappings,
  };
}
