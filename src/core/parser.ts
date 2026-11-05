import { SourceMapConsumer, type RawSourceMap as SMRawSourceMap } from "source-map-js";
import type { MappingSegment, SourceMapData } from "./types";
import { parseSourceMapLite } from "./parser-lite";

export function parseSourceMap(jsonString: string): SourceMapData {
  const raw = JSON.parse(jsonString);

  if (raw.version !== 3 && !raw.sections) {
    throw new Error(`Unsupported source map version: ${raw.version}`);
  }

  // Use the Worker-safe indexed parser in both runtimes so section offsets,
  // source tables, and names resolve identically in the viewer and reports.
  if (raw.sections) return parseSourceMapLite(jsonString);

  const consumer = new SourceMapConsumer(raw as SMRawSourceMap);

  const sources: string[] = [...(consumer.sources ?? raw.sources ?? [])];
  const sourcesContent: (string | null)[] = sources.map((src: string) => {
    return consumer.sourceContentFor(src, true) ?? null;
  });

  const names: string[] = raw.names ?? [];

  const sourceIndexMap = new Map(sources.map((s, i) => [s, i]));
  const nameIndexMap = new Map(names.map((n, i) => [n, i]));

  const mappings: MappingSegment[] = [];

  consumer.eachMapping((mapping) => {
    if (mapping.source == null || mapping.originalLine == null || mapping.originalColumn == null) {
      // Keep the stop boundary without treating it as a source mapping. Include
      // duplicate positions so none of their inferred ranges crosses the gap.
      const last = mappings[mappings.length - 1];
      for (let i = mappings.length - 1; i >= 0; i--) {
        const previous = mappings[i];
        if (
          previous.generatedLine !== mapping.generatedLine - 1 ||
          previous.generatedColumn !== last.generatedColumn ||
          previous.generatedEndColumn !== undefined
        )
          break;
        previous.generatedEndColumn = mapping.generatedColumn;
      }
      return;
    }

    const sourceIndex = sourceIndexMap.get(mapping.source) ?? -1;
    if (sourceIndex === -1) return;

    const nameIndex = mapping.name != null ? (nameIndexMap.get(mapping.name) ?? null) : null;

    mappings.push({
      // source-map-js uses 1-based lines, we use 0-based
      generatedLine: mapping.generatedLine - 1,
      generatedColumn: mapping.generatedColumn,
      originalLine: mapping.originalLine - 1,
      originalColumn: mapping.originalColumn,
      sourceIndex,
      nameIndex,
    });
  });

  return {
    version: 3,
    file: raw.file,
    sourceRoot: raw.sourceRoot,
    sources,
    sourcesContent,
    names,
    mappings,
  };
}

export const INLINE_SOURCE_MAP_RE =
  /(?:\/\/[#@]\s*sourceMappingURL=|\/\*[#@]\s*sourceMappingURL=)(data:[^\s*]+)\s*\*?\/?\s*$/m;
export const EXTERNAL_SOURCE_MAP_RE =
  /(?:\/\/[#@]\s*sourceMappingURL=|\/\*[#@]\s*sourceMappingURL=)\s*(\S+)\s*\*?\/?\s*$/m;
const SOURCE_MAP_COMMENT_RE =
  /(?:\/\/[#@]\s*sourceMappingURL=|\/\*[#@]\s*sourceMappingURL=).*?(?:\*\/)?[\r\n]*$/m;

export function decodeSourceMapDataUrl(input: string): string | null {
  const trimmed = input.trim();
  if (trimmed.slice(0, 5).toLowerCase() !== "data:") return null;

  const commaIndex = trimmed.indexOf(",");
  if (commaIndex === -1) return null;

  const metadata = trimmed.slice(5, commaIndex);
  const payload = trimmed.slice(commaIndex + 1);
  const parts = metadata
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean);
  const mimeType = parts.shift()?.toLowerCase() ?? "";
  if (mimeType !== "application/json") return null;

  const isBase64 = parts.some((part) => part.toLowerCase() === "base64");

  try {
    const decodedPayload = decodeURIComponent(payload);
    if (!isBase64) return decodedPayload;
    const bytes = Uint8Array.from(atob(decodedPayload.replace(/\s+/g, "")), (c) => c.charCodeAt(0));
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

export function extractInlineSourceMap(
  code: string,
): { code: string; sourceMapJson: string } | null {
  const match = code.match(INLINE_SOURCE_MAP_RE);
  if (!match) return null;

  const sourceMapJson = decodeSourceMapDataUrl(match[1]);
  if (sourceMapJson == null) return null;
  const cleanCode = code.replace(SOURCE_MAP_COMMENT_RE, "");

  return { code: cleanCode, sourceMapJson };
}
