import { describe, it, expect } from "vite-plus/test";
import { calculateStats } from "../core/stats";
import { buildMappingIndex } from "../core/mapper";
import type { MappingDiagnostic, SourceMapData } from "../core/types";

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
});
