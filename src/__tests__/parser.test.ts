import { describe, it, expect } from "vite-plus/test";
import { decodeSourceMapDataUrl, parseSourceMap, extractInlineSourceMap } from "../core/parser";

const JS_SOURCE_MAP_DIRECTIVE = "//# source" + "MappingURL=";
const CSS_SOURCE_MAP_DIRECTIVE = "/*# source" + "MappingURL=";

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
    const code = `console.log("hi");\n${JS_SOURCE_MAP_DIRECTIVE}data:application/json;base64,${base64}\n`;

    const result = extractInlineSourceMap(code);
    expect(result).not.toBeNull();
    expect(result!.code).toBe('console.log("hi");\n');
    expect(result!.sourceMapJson).toBe(sourceMap);
  });

  it("extracts from /* */ comment style", () => {
    const sourceMap = JSON.stringify({ version: 3, sources: [], mappings: "" });
    const base64 = btoa(sourceMap);
    const code = `body{}\n${CSS_SOURCE_MAP_DIRECTIVE}data:application/json;base64,${base64} */\n`;

    const result = extractInlineSourceMap(code);
    expect(result).not.toBeNull();
    expect(result!.sourceMapJson).toBe(sourceMap);
  });

  it("extracts inline source map when the data URL includes charset metadata", () => {
    const sourceMap = JSON.stringify({ version: 3, sources: [], mappings: "" });
    const base64 = btoa(sourceMap);
    const code = `console.log("hi");\n${JS_SOURCE_MAP_DIRECTIVE}data:application/json;charset=utf-8;base64,${base64}\n`;

    const result = extractInlineSourceMap(code);
    expect(result).not.toBeNull();
    expect(result!.sourceMapJson).toBe(sourceMap);
  });

  it("returns null when no inline source map found", () => {
    const result = extractInlineSourceMap('console.log("hi");');
    expect(result).toBeNull();
  });
});

describe("decodeSourceMapDataUrl", () => {
  it("decodes standalone base64 data URLs with charset metadata", () => {
    const sourceMap = JSON.stringify({ version: 3, sources: [], mappings: "" });
    const base64 = btoa(sourceMap);

    expect(decodeSourceMapDataUrl(`data:application/json;charset=utf-8;base64,${base64}`)).toBe(
      sourceMap,
    );
  });

  it("decodes UTF-8 filenames, source content, and names from inline maps", () => {
    const sourceMap = JSON.stringify({
      version: 3,
      sources: ["中文.ts"],
      sourcesContent: ['const 问候 = "你好 🌍";'],
      names: ["问候"],
      mappings: "AAAAA",
    });
    const bytes = new TextEncoder().encode(sourceMap);
    const base64 = btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(""));
    const dataUrl = `data:application/json;charset=utf-8;base64,${base64}`;

    expect(decodeSourceMapDataUrl(dataUrl)).toBe(sourceMap);
    const inline = extractInlineSourceMap(`output();\n${JS_SOURCE_MAP_DIRECTIVE}${dataUrl}`);
    expect(inline?.sourceMapJson).toBe(sourceMap);
    expect(parseSourceMap(inline!.sourceMapJson)).toMatchObject({
      sources: ["中文.ts"],
      sourcesContent: ['const 问候 = "你好 🌍";'],
      names: ["问候"],
    });
  });

  it("decodes percent-encoded JSON without treating it as binary", () => {
    const sourceMap = JSON.stringify({ version: 3, sources: ["中文.ts"], mappings: "" });
    expect(decodeSourceMapDataUrl(`data:application/json,${encodeURIComponent(sourceMap)}`)).toBe(
      sourceMap,
    );
  });

  it("returns null for malformed base64 and invalid UTF-8", () => {
    expect(decodeSourceMapDataUrl("data:application/json;base64,!")).toBeNull();
    expect(decodeSourceMapDataUrl("data:application/json;base64,/w==")).toBeNull();
  });

  it("returns null for non-JSON data URLs", () => {
    expect(decodeSourceMapDataUrl("data:text/plain;base64,SGVsbG8=")).toBeNull();
  });
});
