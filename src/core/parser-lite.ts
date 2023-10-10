/**
 * Lightweight source map parser that doesn't use `source-map-js`.
 * Works in restricted environments like Cloudflare Workers where
 * `new Function()` is forbidden.
 */
import type { MappingSegment, SourceMapData } from "./types";

const VLQ_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const VLQ_LOOKUP = new Uint8Array(128).fill(255);
for (let i = 0; i < VLQ_CHARS.length; i++) {
  VLQ_LOOKUP[VLQ_CHARS.charCodeAt(i)] = i;
}

function decodeVlq(encoded: string, index: number): [value: number, nextIndex: number] {
  let shift = 0;
  let result = 0;
  let i = index;

  while (i < encoded.length) {
    const digit = VLQ_LOOKUP[encoded.charCodeAt(i)];
    if (digit === 255) throw new Error(`Invalid VLQ character: ${encoded[i]}`);
    i++;

    const hasContinuation = digit & 32;
    result += (digit & 31) << shift;
    shift += 5;

    if (!hasContinuation) {
      const isNegative = result & 1;
      const value = result >> 1;
      return [isNegative ? -value : value, i];
    }
  }

  throw new Error("Unterminated VLQ sequence");
}

function decodeMappings(mappingsStr: string): MappingSegment[] {
  const segments: MappingSegment[] = [];
  if (!mappingsStr) return segments;

  let generatedLine = 0;
  let generatedColumn = 0;
  let sourceIndex = 0;
  let originalLine = 0;
  let originalColumn = 0;
  let nameIndex = 0;

  const lines = mappingsStr.split(";");

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    generatedLine = lineIdx;
    generatedColumn = 0;

    const line = lines[lineIdx];
    if (!line) continue;

    const segs = line.split(",");

    for (const seg of segs) {
      if (!seg) continue;

      let i = 0;
      let value: number;

      // Field 1: generatedColumn (relative)
      [value, i] = decodeVlq(seg, i);
      generatedColumn += value;

      if (i >= seg.length) {
        // 1-field segment: unmapped generated position
        continue;
      }

      // Field 2: sourceIndex (relative)
      [value, i] = decodeVlq(seg, i);
      sourceIndex += value;

      // Field 3: originalLine (relative)
      [value, i] = decodeVlq(seg, i);
      originalLine += value;

      // Field 4: originalColumn (relative)
      [value, i] = decodeVlq(seg, i);
      originalColumn += value;

      let segNameIndex: number | null = null;
      if (i < seg.length) {
        // Field 5: nameIndex (relative)
        [value, i] = decodeVlq(seg, i);
        nameIndex += value;
        segNameIndex = nameIndex;
      }

      segments.push({
        generatedLine,
        generatedColumn,
        originalLine,
        originalColumn,
        sourceIndex,
        nameIndex: segNameIndex,
      });
    }
  }

  return segments;
}

export function parseSourceMapLite(jsonString: string): SourceMapData {
  const raw = JSON.parse(jsonString);

  if (raw.version !== 3 && !raw.sections) {
    throw new Error(`Unsupported source map version: ${raw.version}`);
  }

  // Handle sectioned source maps by only taking the first section
  const map = raw.sections ? (raw.sections[0]?.map ?? raw) : raw;

  const sources: string[] = map.sources ?? [];
  const sourcesContent: (string | null)[] = (map.sourcesContent ?? []).map(
    (c: string | null | undefined) => c ?? null,
  );
  // Pad sourcesContent to match sources length
  while (sourcesContent.length < sources.length) {
    sourcesContent.push(null);
  }

  const names: string[] = map.names ?? [];
  const mappings = decodeMappings(map.mappings ?? "");

  return {
    version: 3,
    file: map.file,
    sourceRoot: map.sourceRoot,
    sources,
    sourcesContent,
    names,
    mappings,
  };
}
