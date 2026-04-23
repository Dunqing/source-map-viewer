import { decodeSourceMapDataUrl, extractInlineSourceMap } from "../core/parser";
import {
  resolveSourceMapFromFileCollection,
  resolveSourceMapsFromFileCollection,
  type ResolvedFileCollection,
} from "../core/inputResolver";

export interface LoadedFiles {
  generatedCode: string;
  sourceMapJson: string;
}

export function useFileLoader() {
  function isSourceMapObject(value: unknown): value is { version: unknown; mappings: unknown } {
    return typeof value === "object" && value !== null && "version" in value && "mappings" in value;
  }

  function parseInputText(text: string): LoadedFiles | null {
    try {
      const parsed = JSON.parse(text);
      if (isSourceMapObject(parsed)) {
        return { generatedCode: "", sourceMapJson: text };
      }
    } catch {
      /* not JSON */
    }

    const dataUrl = decodeSourceMapDataUrl(text);
    if (dataUrl != null) {
      return { generatedCode: "", sourceMapJson: dataUrl };
    }

    const extracted = extractInlineSourceMap(text);
    if (extracted) {
      return { generatedCode: extracted.code, sourceMapJson: extracted.sourceMapJson };
    }

    return null;
  }

  async function readFileEntries(files: File[]) {
    return Promise.all(
      files.map(async (file) => {
        const content = await file.text();
        const relativePath =
          "webkitRelativePath" in file && typeof file.webkitRelativePath === "string"
            ? file.webkitRelativePath
            : "";
        return {
          path: relativePath || file.name,
          content,
        };
      }),
    );
  }

  async function resolveFiles<T>(
    files: File[],
    resolver: (entries: Awaited<ReturnType<typeof readFileEntries>>) => T,
  ): Promise<T> {
    const entries = await readFileEntries(files);
    return resolver(entries);
  }

  async function loadFileEntries(files: File[]): Promise<ResolvedFileCollection[]> {
    return resolveFiles(files, resolveSourceMapsFromFileCollection);
  }

  async function loadFromFiles(files: File[]): Promise<ResolvedFileCollection> {
    return resolveFiles(files, resolveSourceMapFromFileCollection);
  }

  async function loadFromText(text: string): Promise<LoadedFiles> {
    const parsed = parseInputText(text);
    if (parsed) return parsed;

    throw new Error("Could not find a source map in the provided text.");
  }

  function assertSafeUrl(input: string): void {
    const parsed = new URL(input);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      throw new Error("Only HTTP(S) URLs are allowed");
    }
    const hostname = parsed.hostname.replace(/^\[|\]$/g, "");
    if (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "0.0.0.0" ||
      hostname === "::1" ||
      hostname.startsWith("10.") ||
      hostname.startsWith("192.168.") ||
      hostname.startsWith("169.254.") ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(hostname) ||
      hostname.startsWith("fc") ||
      hostname.startsWith("fd") ||
      hostname.startsWith("fe80") ||
      hostname.startsWith("::ffff:127.") ||
      hostname.startsWith("::ffff:10.") ||
      hostname.startsWith("::ffff:192.168.") ||
      hostname.startsWith("::ffff:169.254.")
    ) {
      throw new Error("Fetching private/internal addresses is not allowed");
    }
  }

  async function loadFromUrl(url: string): Promise<LoadedFiles> {
    const inlineDataUrl = decodeSourceMapDataUrl(url);
    if (inlineDataUrl != null) {
      return { generatedCode: "", sourceMapJson: inlineDataUrl };
    }

    assertSafeUrl(url);
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch: ${response.status} ${response.statusText}`);
    }

    const text = await response.text();
    const parsed = parseInputText(text);
    if (parsed) return parsed;

    const sourceMapUrlMatch = text.match(/\/\/[#@]\s*sourceMappingURL=(\S+)/);
    if (sourceMapUrlMatch) {
      const mapUrl = new URL(sourceMapUrlMatch[1], url).href;
      assertSafeUrl(mapUrl);
      const mapResponse = await fetch(mapUrl);
      if (mapResponse.ok) {
        const mapText = await mapResponse.text();
        return {
          generatedCode: text.replace(/\/\/[#@]\s*sourceMappingURL=\S+\s*$/, ""),
          sourceMapJson: mapText,
        };
      }
      throw new Error(
        `Failed to fetch source map from ${mapUrl}: ${mapResponse.status} ${mapResponse.statusText}`,
      );
    }

    throw new Error("Could not find a source map at the provided URL.");
  }

  return { loadFileEntries, loadFromFiles, loadFromText, loadFromUrl };
}
