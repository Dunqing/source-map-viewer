import { describe, it, expect } from "vite-plus/test";
import { parseSourceMap, extractInlineSourceMap } from "../core/parser";

describe("parseSourceMap", () => {
  it("parses a simple source map JSON", () => {
    const raw = JSON.stringify({
      version: 3,
      file: "out.js",
      sources: ["input.js"],
      sourcesContent: ["const x = 1;"],
      names: [],
      mappings: "AAAA",
    });

    const result = parseSourceMap(raw);
    expect(result.version).toBe(3);
    expect(result.sources).toEqual(["input.js"]);
    expect(result.sourcesContent).toEqual(["const x = 1;"]);
    expect(result.mappings.length).toBeGreaterThan(0);
  });

  it("handles missing sourcesContent", () => {
    const raw = JSON.stringify({
      version: 3,
      sources: ["a.js", "b.js"],
      names: [],
      mappings: "AAAA",
    });

    const result = parseSourceMap(raw);
    expect(result.sourcesContent).toEqual([null, null]);
  });

  it("handles sectioned source maps", () => {
    const raw = JSON.stringify({
      version: 3,
      sections: [
        {
          offset: { line: 0, column: 0 },
          map: {
            version: 3,
            sources: ["a.js"],
            sourcesContent: ["var a;"],
            names: [],
            mappings: "AAAA",
          },
        },
        {
          offset: { line: 1, column: 0 },
          map: {
            version: 3,
            sources: ["b.js"],
            sourcesContent: ["var b;"],
            names: [],
            mappings: "AAAA",
          },
        },
      ],
    });

    const result = parseSourceMap(raw);
    expect(result.sources.length).toBe(2);
    expect(result.mappings.length).toBe(2);
    expect(result.mappings[1].generatedLine).toBe(1);
  });

  it("throws on invalid version", () => {
    const raw = JSON.stringify({ version: 2, sources: [], mappings: "" });
    expect(() => parseSourceMap(raw)).toThrow();
  });
});

describe("extractInlineSourceMap", () => {
  it("extracts base64 inline source map from //# comment", () => {
    const sourceMap = JSON.stringify({ version: 3, sources: [], mappings: "" });
    const base64 = btoa(sourceMap);
    const code = `console.log("hi");\n//# sourceMappingURL=data:application/json;base64,${base64}\n`;

    const result = extractInlineSourceMap(code);
    expect(result).not.toBeNull();
    expect(result!.code).toBe('console.log("hi");\n');
    expect(result!.sourceMapJson).toBe(sourceMap);
  });

  it("extracts from /* */ comment style", () => {
    const sourceMap = JSON.stringify({ version: 3, sources: [], mappings: "" });
    const base64 = btoa(sourceMap);
    const code = `body{}\n/*# sourceMappingURL=data:application/json;base64,${base64} */\n`;

    const result = extractInlineSourceMap(code);
    expect(result).not.toBeNull();
    expect(result!.sourceMapJson).toBe(sourceMap);
  });

  it("returns null when no inline source map found", () => {
    const result = extractInlineSourceMap('console.log("hi");');
    expect(result).toBeNull();
  });
});
