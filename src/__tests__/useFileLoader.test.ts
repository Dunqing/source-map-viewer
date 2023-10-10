import { describe, it, expect, vi, beforeEach, afterEach } from "vite-plus/test";
import { useFileLoader } from "../composables/useFileLoader";

// A real, minimal but valid source map
const VALID_SOURCE_MAP = {
  version: 3,
  file: "out.js",
  sources: ["input.js"],
  sourcesContent: ["const x = 1;\nconsole.log(x);"],
  names: ["x"],
  mappings: "AAAA,MAAMA,IAAI;AACV,QAAQ,IAAIA,CAAC",
};

const VALID_SOURCE_MAP_JSON = JSON.stringify(VALID_SOURCE_MAP);

const GENERATED_CODE = `var x = 1;
console.log(x);`;

const GENERATED_CODE_WITH_INLINE = `var x = 1;
console.log(x);
//# sourceMappingURL=data:application/json;base64,${btoa(VALID_SOURCE_MAP_JSON)}
`;

// Helper to create a File object
function createFile(name: string, content: string): File {
  return new File([content], name, { type: "text/plain" });
}

describe("useFileLoader", () => {
  const { loadFromFiles, loadFromText, loadFromUrl } = useFileLoader();

  describe("loadFromFiles", () => {
    it("loads from separate .js and .map files", async () => {
      const jsFile = createFile("bundle.js", GENERATED_CODE);
      const mapFile = createFile("bundle.js.map", VALID_SOURCE_MAP_JSON);

      const result = await loadFromFiles([jsFile, mapFile]);

      expect(result.generatedCode).toBe(GENERATED_CODE);
      expect(result.sourceMapJson).toBe(VALID_SOURCE_MAP_JSON);
    });

    it("loads from .map file only", async () => {
      const mapFile = createFile("bundle.js.map", VALID_SOURCE_MAP_JSON);

      const result = await loadFromFiles([mapFile]);

      expect(result.generatedCode).toBe("");
      expect(result.sourceMapJson).toBe(VALID_SOURCE_MAP_JSON);
    });

    it("loads from .json source map file", async () => {
      const jsonFile = createFile("sourcemap.json", VALID_SOURCE_MAP_JSON);

      const result = await loadFromFiles([jsonFile]);

      expect(result.generatedCode).toBe("");
      expect(result.sourceMapJson).toBe(VALID_SOURCE_MAP_JSON);
    });

    it("extracts inline source map from uploaded .js file", async () => {
      const jsFile = createFile("bundle.js", GENERATED_CODE_WITH_INLINE);

      const result = await loadFromFiles([jsFile]);

      expect(result.generatedCode).toContain("var x = 1;");
      expect(result.generatedCode).not.toContain("sourceMappingURL");
      const parsed = JSON.parse(result.sourceMapJson);
      expect(parsed.version).toBe(3);
      expect(parsed.mappings).toBe(VALID_SOURCE_MAP.mappings);
    });

    it("throws when no source map is found", async () => {
      const jsFile = createFile("bundle.js", "var x = 1;");

      await expect(loadFromFiles([jsFile])).rejects.toThrow("No source map found");
    });

    it("throws when uploading only non-map files without inline sourcemap", async () => {
      const cssFile = createFile("style.css", "body { color: red; }");

      await expect(loadFromFiles([cssFile])).rejects.toThrow("No source map found");
    });

    it("ignores .json files that are not valid source maps", async () => {
      const jsonFile = createFile("package.json", JSON.stringify({ name: "test" }));
      const jsFileWithInline = createFile("bundle.js", GENERATED_CODE_WITH_INLINE);

      const result = await loadFromFiles([jsonFile, jsFileWithInline]);

      // package.json shouldn't be treated as a source map
      // The inline source map from bundle.js should be used
      const parsed = JSON.parse(result.sourceMapJson);
      expect(parsed.version).toBe(3);
    });

    it("handles .map file with invalid JSON gracefully", async () => {
      const badMapFile = createFile("bundle.js.map", "not json at all");
      const jsFileWithInline = createFile("bundle.js", GENERATED_CODE_WITH_INLINE);

      // The bad .map file fails JSON.parse silently, falls through to treating as generated code
      // Then the .js file with inline map should work
      const result = await loadFromFiles([badMapFile, jsFileWithInline]);
      const parsed = JSON.parse(result.sourceMapJson);
      expect(parsed.version).toBe(3);
    });
  });

  describe("loadFromText", () => {
    it("loads raw source map JSON", async () => {
      const result = await loadFromText(VALID_SOURCE_MAP_JSON);

      expect(result.generatedCode).toBe("");
      expect(result.sourceMapJson).toBe(VALID_SOURCE_MAP_JSON);
    });

    it("loads code with inline source map", async () => {
      const result = await loadFromText(GENERATED_CODE_WITH_INLINE);

      expect(result.generatedCode).toContain("var x = 1;");
      expect(result.generatedCode).not.toContain("sourceMappingURL");
      const parsed = JSON.parse(result.sourceMapJson);
      expect(parsed.version).toBe(3);
    });

    it("throws for plain code without source map", async () => {
      await expect(loadFromText("var x = 1;")).rejects.toThrow(
        "Could not find a source map in the provided text",
      );
    });

    it("throws for arbitrary JSON that is not a source map", async () => {
      await expect(loadFromText(JSON.stringify({ foo: "bar" }))).rejects.toThrow(
        "Could not find a source map in the provided text",
      );
    });

    it("throws for empty string", async () => {
      await expect(loadFromText("")).rejects.toThrow(
        "Could not find a source map in the provided text",
      );
    });

    it("handles source map JSON with extra whitespace", async () => {
      const prettyJson = JSON.stringify(VALID_SOURCE_MAP, null, 2);
      const result = await loadFromText(prettyJson);

      expect(result.generatedCode).toBe("");
      const parsed = JSON.parse(result.sourceMapJson);
      expect(parsed.version).toBe(3);
      expect(parsed.sources).toEqual(["input.js"]);
    });

    it("handles CSS with inline source map", async () => {
      const cssWithMap = `body { color: red; }\n/*# sourceMappingURL=data:application/json;base64,${btoa(VALID_SOURCE_MAP_JSON)} */\n`;

      const result = await loadFromText(cssWithMap);

      expect(result.generatedCode).toContain("body { color: red; }");
      const parsed = JSON.parse(result.sourceMapJson);
      expect(parsed.version).toBe(3);
    });
  });

  describe("loadFromUrl", () => {
    const originalFetch = globalThis.fetch;

    afterEach(() => {
      globalThis.fetch = originalFetch;
    });

    it("loads source map JSON directly from URL", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(VALID_SOURCE_MAP_JSON),
      });

      const result = await loadFromUrl("https://example.com/bundle.js.map");

      expect(result.generatedCode).toBe("");
      expect(result.sourceMapJson).toBe(VALID_SOURCE_MAP_JSON);
      expect(globalThis.fetch).toHaveBeenCalledWith("https://example.com/bundle.js.map");
    });

    it("loads code with inline source map from URL", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(GENERATED_CODE_WITH_INLINE),
      });

      const result = await loadFromUrl("https://example.com/bundle.js");

      expect(result.generatedCode).toContain("var x = 1;");
      const parsed = JSON.parse(result.sourceMapJson);
      expect(parsed.version).toBe(3);
    });

    it("follows sourceMappingURL comment to fetch external map", async () => {
      const codeWithExternalMap = `var x = 1;\nconsole.log(x);\n//# sourceMappingURL=bundle.js.map\n`;

      globalThis.fetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          text: () => Promise.resolve(codeWithExternalMap),
        })
        .mockResolvedValueOnce({
          ok: true,
          text: () => Promise.resolve(VALID_SOURCE_MAP_JSON),
        });

      const result = await loadFromUrl("https://cdn.example.com/js/bundle.js");

      expect(result.generatedCode).toContain("var x = 1;");
      expect(result.generatedCode).not.toContain("sourceMappingURL");
      const parsed = JSON.parse(result.sourceMapJson);
      expect(parsed.version).toBe(3);

      // Should resolve relative URL against the original URL
      expect(globalThis.fetch).toHaveBeenCalledWith("https://cdn.example.com/js/bundle.js.map");
    });

    it("handles absolute sourceMappingURL", async () => {
      const codeWithAbsoluteMap = `var x = 1;\n//# sourceMappingURL=https://maps.example.com/bundle.js.map\n`;

      globalThis.fetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          text: () => Promise.resolve(codeWithAbsoluteMap),
        })
        .mockResolvedValueOnce({
          ok: true,
          text: () => Promise.resolve(VALID_SOURCE_MAP_JSON),
        });

      const result = await loadFromUrl("https://cdn.example.com/bundle.js");

      expect(globalThis.fetch).toHaveBeenCalledWith("https://maps.example.com/bundle.js.map");
      const parsed = JSON.parse(result.sourceMapJson);
      expect(parsed.version).toBe(3);
    });

    it("throws on HTTP error", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: "Not Found",
      });

      await expect(loadFromUrl("https://example.com/missing.js")).rejects.toThrow(
        "Failed to fetch: 404 Not Found",
      );
    });

    it("throws when URL has no source map", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve("var x = 1;"),
      });

      await expect(loadFromUrl("https://example.com/plain.js")).rejects.toThrow(
        "Could not find a source map at the provided URL",
      );
    });

    it("throws when external map fetch fails", async () => {
      const codeWithExternalMap = `var x = 1;\n//# sourceMappingURL=bundle.js.map\n`;

      globalThis.fetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          text: () => Promise.resolve(codeWithExternalMap),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 404,
          statusText: "Not Found",
        });

      // When the map URL returns 404, throw with HTTP status details
      await expect(loadFromUrl("https://example.com/bundle.js")).rejects.toThrow(
        "Failed to fetch source map from https://example.com/bundle.js.map: 404 Not Found",
      );
    });
  });
});
