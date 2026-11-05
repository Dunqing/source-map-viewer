import { describe, it, expect } from "vite-plus/test";
import { calculateStats } from "../core/stats";
import { buildMappingIndex } from "../core/mapper";
import { validateMappings } from "../core/validator";
import type { MappingDiagnostic, SourceMapData } from "../core/types";
import { parseSourceMap } from "../core/parser";
import { parseSourceMapLite } from "../core/parser-lite";

describe.each([
  ["browser", parseSourceMap],
  ["server", parseSourceMapLite],
] as const)("%s parser coverage", (_name, parse) => {
  it.each([
    ["middle gap", "AAAA,K,KAAA", "abcdefghijklmno", 10, 5, 67],
    ["trailing gap", "AAAA,K", "abcdefghijklmno", 5, 10, 33],
    ["leading gap", "A,KAAA", "abcdefghijklmno", 10, 5, 67],
    ["duplicate mappings", "AAAA,AAAA,K,KAAA", "abcdefghijklmno", 10, 5, 67],
    ["consecutive unmapped boundaries", "AAAA,K,E,EAAA", "abcdefghijklmno", 11, 4, 73],
    ["next line resets the gap", "AAAA,K;AAAA", "abcdefghijklmno\nabcdefghijklmno", 20, 10, 67],
    ["columns beyond code are clamped", "AAAA,oBAAA", "abcdefghijklmno", 15, 0, 100],
  ])("respects %s", (_label, mappings, code, mapped, unmapped, percent) => {
    const data = parse(
      JSON.stringify({
        version: 3,
        sources: ["input.js"],
        sourcesContent: [code],
        names: [],
        mappings,
      }),
    );
    expect(calculateStats(data, code, [], buildMappingIndex(data.mappings))).toMatchObject({
      mappedBytes: mapped,
      unmappedBytes: unmapped,
      coveragePercent: percent,
    });
  });
});

describe("calculateStats", () => {
  it("calculates basic stats", () => {
    const data: SourceMapData = {
      version: 3,
      sources: ["a.js", "b.js"],
      sourcesContent: ["const a = 1;", "const b = 2;"],
      names: [],
      mappings: [
        {
          generatedLine: 0,
          generatedColumn: 0,
          originalLine: 0,
          originalColumn: 0,
          sourceIndex: 0,
          nameIndex: null,
        },
        {
          generatedLine: 0,
          generatedColumn: 6,
          originalLine: 0,
          originalColumn: 6,
          sourceIndex: 1,
          nameIndex: null,
        },
      ],
    };
    const generatedCode = "const a = 1; const b = 2;";
    const diagnostics: MappingDiagnostic[] = [];

    const stats = calculateStats(
      data,
      generatedCode,
      diagnostics,
      buildMappingIndex(data.mappings),
    );
    expect(stats.totalMappings).toBe(2);
    expect(stats.fileSizes).toHaveLength(2);
    expect(stats.fileSizes[0]).toEqual({ name: "a.js", size: 12 });
    expect(stats.badMappings).toBe(0);
  });

  it("counts bad mappings from diagnostics", () => {
    const data: SourceMapData = {
      version: 3,
      sources: ["a.js"],
      sourcesContent: ["x"],
      names: [],
      mappings: [
        {
          generatedLine: 0,
          generatedColumn: 0,
          originalLine: 0,
          originalColumn: 0,
          sourceIndex: 0,
          nameIndex: null,
        },
      ],
    };
    const diagnostics: MappingDiagnostic[] = [
      { segment: data.mappings[0], type: "out-of-bounds", message: "test" },
    ];

    const stats = calculateStats(data, "x", diagnostics, buildMappingIndex(data.mappings));
    expect(stats.badMappings).toBe(1);
  });

  it("reports zero badMappings when out-of-bounds positions are in source map", () => {
    const data: SourceMapData = {
      version: 3,
      sources: ["a.js"],
      sourcesContent: ["line1\nline2"],
      names: [],
      mappings: [
        {
          generatedLine: 0,
          generatedColumn: 0,
          originalLine: 999,
          originalColumn: 0,
          sourceIndex: 0,
          nameIndex: null,
        },
      ],
    };
    const generatedCode = "var x = 1;";
    const diagnostics = validateMappings(data);
    expect(diagnostics).toHaveLength(0);

    const stats = calculateStats(
      data,
      generatedCode,
      diagnostics,
      buildMappingIndex(data.mappings),
    );
    expect(stats.badMappings).toBe(0);
  });
});
