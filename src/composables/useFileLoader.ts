import { decodeSourceMapDataUrl, extractInlineSourceMap } from "../core/parser";

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

  async function loadFromFiles(files: File[]): Promise<LoadedFiles> {
    let generatedCode = "";
    let sourceMapJson = "";

    for (const file of files) {
      const content = await file.text();

      const parsed = parseInputText(content);
      if (parsed) {
        if (parsed.generatedCode) {
          generatedCode = parsed.generatedCode;
        }
        sourceMapJson = parsed.sourceMapJson;
        continue;
      }

      generatedCode = content;
    }

    if (!sourceMapJson) {
      throw new Error(
        "No source map found. Upload a .map file or code with an inline sourceMappingURL.",
      );
    }

    return { generatedCode, sourceMapJson };
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

  return { loadFromFiles, loadFromText, loadFromUrl };
}
