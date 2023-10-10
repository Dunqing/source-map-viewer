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

  async function loadFromUrl(url: string): Promise<LoadedFiles> {
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
