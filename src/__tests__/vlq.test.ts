import { describe, it, expect } from "vite-plus/test";
import { parseSourceMap } from "../core/parser";

describe("source map decoding (via source-map-js)", () => {
  it("decodes simple 4-field mapping AAAA", () => {
    const raw = JSON.stringify({
      version: 3,
      sources: ["input.js"],
      sourcesContent: ["hello"],
      names: [],
      mappings: "AAAA",
    });
    const result = parseSourceMap(raw);
    expect(result.mappings).toHaveLength(1);
    expect(result.mappings[0]).toEqual({
      generatedLine: 0,
      generatedColumn: 0,
      originalLine: 0,
      originalColumn: 0,
      sourceIndex: 0,
      nameIndex: null,
    });
  });

  it("decodes multiple segments on same line", () => {
    const raw = JSON.stringify({
      version: 3,
      sources: ["input.js"],
      sourcesContent: ["ab"],
      names: [],
      mappings: "AAAA,CAAC",
    });
    const result = parseSourceMap(raw);
    expect(result.mappings).toHaveLength(2);
    expect(result.mappings[1].generatedColumn).toBe(1);
    expect(result.mappings[1].originalColumn).toBe(1);
  });

  it("decodes multiple lines separated by semicolon", () => {
    const raw = JSON.stringify({
      version: 3,
      sources: ["input.js"],
      sourcesContent: ["a\nb"],
      names: [],
      mappings: "AAAA;AACA",
    });
    const result = parseSourceMap(raw);
    expect(result.mappings).toHaveLength(2);
    expect(result.mappings[0].generatedLine).toBe(0);
    expect(result.mappings[1].generatedLine).toBe(1);
  });

  it("handles empty lines (consecutive semicolons)", () => {
    const raw = JSON.stringify({
      version: 3,
      sources: ["input.js"],
      sourcesContent: ["a\n\n\nb"],
      names: [],
      mappings: "AAAA;;;AAGA",
    });
    const result = parseSourceMap(raw);
    expect(result.mappings).toHaveLength(2);
    expect(result.mappings[0].generatedLine).toBe(0);
    expect(result.mappings[1].generatedLine).toBe(3);
  });

  it("decodes segment with name index", () => {
    const raw = JSON.stringify({
      version: 3,
      sources: ["input.js"],
      sourcesContent: ["foo"],
      names: ["foo"],
      mappings: "AAAAA",
    });
    const result = parseSourceMap(raw);
    expect(result.mappings).toHaveLength(1);
    expect(result.mappings[0].nameIndex).toBe(0);
  });

  it("skips 1-field segments (unmapped)", () => {
    const raw = JSON.stringify({
      version: 3,
      sources: ["input.js"],
      sourcesContent: ["a"],
      names: [],
      mappings: "A,EAAA",
    });
    const result = parseSourceMap(raw);
    // Only the 4-field segment should be included, 1-field is skipped
    expect(result.mappings).toHaveLength(1);
    expect(result.mappings[0].generatedColumn).toBe(2);
  });

  it("decodes real TypeScript source map", () => {
    const raw = JSON.stringify({
      version: 3,
      file: "example.js",
      sources: ["example.ts"],
      sourcesContent: ['const greeting: string = "hello";\nconsole.log(greeting);\n'],
      names: [],
      mappings: ";AAAA,MAAM,QAAQ,GAAW,OAAO,CAAC;AACjC,OAAO,CAAC,GAAG,CAAC,QAAQ,CAAC,CAAC",
    });
    const result = parseSourceMap(raw);
    // Gen line 0 ("use strict") should have no mappings
    const line0Mappings = result.mappings.filter((m) => m.generatedLine === 0);
    expect(line0Mappings).toHaveLength(0);
    // Gen line 1 should map to original line 0
    const line1Mappings = result.mappings.filter((m) => m.generatedLine === 1);
    expect(line1Mappings.length).toBeGreaterThan(0);
    expect(line1Mappings[0].originalLine).toBe(0);
    // Gen line 2 should map to original line 1
    const line2Mappings = result.mappings.filter((m) => m.generatedLine === 2);
    expect(line2Mappings.length).toBeGreaterThan(0);
    expect(line2Mappings[0].originalLine).toBe(1);
  });
});
