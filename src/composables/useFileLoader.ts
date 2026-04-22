import { extractInlineSourceMap } from "../core/parser";

export interface LoadedFiles {
  generatedCode: string;
  sourceMapJson: string;
}

export function useFileLoader() {
  async function loadFromFiles(files: File[]): Promise<LoadedFiles> {
    let generatedCode = "";
    let sourceMapJson = "";

    for (const file of files) {
      const content = await file.text();

      if (file.name.endsWith(".map") || file.name.endsWith(".json")) {
        try {
          const parsed = JSON.parse(content);
          if (parsed.version && parsed.mappings !== undefined) {
            sourceMapJson = content;
            continue;
          }
        } catch {
          /* not JSON */
        }
      }

      generatedCode = content;
    }

    if (generatedCode && !sourceMapJson) {
      const extracted = extractInlineSourceMap(generatedCode);
      if (extracted) {
        generatedCode = extracted.code;
        sourceMapJson = extracted.sourceMapJson;
      }
    }

    if (!sourceMapJson) {
      throw new Error(
        "No source map found. Upload a .map file or code with an inline sourceMappingURL.",
      );
    }

    return { generatedCode, sourceMapJson };
  }

  async function loadFromText(text: string): Promise<LoadedFiles> {
    try {
      const parsed = JSON.parse(text);
      if (parsed.version && parsed.mappings !== undefined) {
        return { generatedCode: "", sourceMapJson: text };
      }
    } catch {
      /* not JSON */
    }

    const extracted = extractInlineSourceMap(text);
    if (extracted) {
      return { generatedCode: extracted.code, sourceMapJson: extracted.sourceMapJson };
    }

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
    assertSafeUrl(url);
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch: ${response.status} ${response.statusText}`);
    }

    const text = await response.text();

    try {
      const parsed = JSON.parse(text);
      if (parsed.version && parsed.mappings !== undefined) {
        return { generatedCode: "", sourceMapJson: text };
      }
    } catch {
      /* not JSON */
    }

    const extracted = extractInlineSourceMap(text);
    if (extracted) {
      return { generatedCode: extracted.code, sourceMapJson: extracted.sourceMapJson };
    }

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
