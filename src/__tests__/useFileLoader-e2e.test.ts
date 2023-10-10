import { describe, it, expect, vi, afterEach } from "vite-plus/test";
import { useFileLoader } from "../composables/useFileLoader";
import { compressToHash, decompressFromHash } from "../composables/useShareableUrl";
import { parseSourceMap } from "../core/parser";

// Real source map from the React Todo App example (esbuild output)
const REAL_SOURCE_MAP = {
  version: 3,
  sources: ["input.js"],
  sourcesContent: ["const x = 1;\nconsole.log(x);"],
  names: ["x"],
  mappings: "AAAA,MAAMA,IAAI;AACV,QAAQ,IAAIA,CAAC",
};

const REAL_SOURCE_MAP_JSON = JSON.stringify(REAL_SOURCE_MAP);
const REAL_GENERATED_CODE = "var x = 1;\nconsole.log(x);";

function createFile(name: string, content: string): File {
  return new File([content], name, { type: "text/plain" });
}

describe("useFileLoader end-to-end: load → parse → compress → decompress", () => {
  const { loadFromFiles, loadFromText, loadFromUrl } = useFileLoader();
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("file upload → parseSourceMap → compressToHash round-trip", async () => {
    const jsFile = createFile("bundle.js", REAL_GENERATED_CODE);
    const mapFile = createFile("bundle.js.map", REAL_SOURCE_MAP_JSON);

    // Step 1: Load
    const loaded = await loadFromFiles([jsFile, mapFile]);
    expect(loaded.sourceMapJson).toBeTruthy();

    // Step 2: Parse (this is what the store does)
    const parsed = parseSourceMap(loaded.sourceMapJson);
    expect(parsed.mappings.length).toBeGreaterThan(0);
    expect(parsed.sources).toEqual(["input.js"]);

    // Step 3: Compress to hash
    const hash = await compressToHash({
      generatedCode: loaded.generatedCode,
      sourceMapJson: loaded.sourceMapJson,
    });
    expect(hash).toBeTruthy();
    expect(hash.length).toBeGreaterThan(0);

    // Step 4: Decompress from hash
    const decompressed = await decompressFromHash(hash);
    expect(decompressed).not.toBeNull();
    expect(decompressed!.generatedCode).toBe(loaded.generatedCode);
    expect(decompressed!.sourceMapJson).toBe(loaded.sourceMapJson);
  });

  it("paste text → parseSourceMap → compress round-trip", async () => {
    // Paste raw source map JSON
    const loaded = await loadFromText(REAL_SOURCE_MAP_JSON);

    const parsed = parseSourceMap(loaded.sourceMapJson);
    expect(parsed.mappings.length).toBeGreaterThan(0);

    const hash = await compressToHash({
      generatedCode: loaded.generatedCode,
      sourceMapJson: loaded.sourceMapJson,
    });
    const decompressed = await decompressFromHash(hash);
    expect(decompressed).not.toBeNull();
    expect(decompressed!.sourceMapJson).toBe(loaded.sourceMapJson);
  });

  it("paste inline source map → full pipeline", async () => {
    const inlineCode = `${REAL_GENERATED_CODE}\n//# sourceMappingURL=data:application/json;base64,${btoa(REAL_SOURCE_MAP_JSON)}\n`;

    const loaded = await loadFromText(inlineCode);

    expect(loaded.generatedCode).toContain("var x = 1;");
    expect(loaded.generatedCode).not.toContain("sourceMappingURL");

    const parsed = parseSourceMap(loaded.sourceMapJson);
    expect(parsed.mappings.length).toBeGreaterThan(0);

    const hash = await compressToHash({
      generatedCode: loaded.generatedCode,
      sourceMapJson: loaded.sourceMapJson,
    });
    const decompressed = await decompressFromHash(hash);
    expect(decompressed).not.toBeNull();
    expect(decompressed!.generatedCode).toBe(loaded.generatedCode);
  });

  it("URL fetch (direct .map) → full pipeline", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(REAL_SOURCE_MAP_JSON),
    });

    const loaded = await loadFromUrl("https://cdn.example.com/bundle.js.map");

    const parsed = parseSourceMap(loaded.sourceMapJson);
    expect(parsed.mappings.length).toBeGreaterThan(0);

    const hash = await compressToHash({
      generatedCode: loaded.generatedCode,
      sourceMapJson: loaded.sourceMapJson,
    });
    const decompressed = await decompressFromHash(hash);
    expect(decompressed).not.toBeNull();
  });

  it("URL fetch (code + external .map) → full pipeline", async () => {
    const codeWithMapRef = `${REAL_GENERATED_CODE}\n//# sourceMappingURL=bundle.js.map\n`;

    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(codeWithMapRef),
      })
      .mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(REAL_SOURCE_MAP_JSON),
      });

    const loaded = await loadFromUrl("https://cdn.example.com/js/bundle.js");

    expect(loaded.generatedCode).toContain("var x = 1;");

    const parsed = parseSourceMap(loaded.sourceMapJson);
    expect(parsed.mappings.length).toBeGreaterThan(0);

    const hash = await compressToHash({
      generatedCode: loaded.generatedCode,
      sourceMapJson: loaded.sourceMapJson,
    });
    const decompressed = await decompressFromHash(hash);
    expect(decompressed).not.toBeNull();
    expect(decompressed!.generatedCode).toBe(loaded.generatedCode);

    // Verify the map URL was resolved correctly
    expect(globalThis.fetch).toHaveBeenCalledWith("https://cdn.example.com/js/bundle.js.map");
  });
});
