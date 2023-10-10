import { describe, it, expect } from "vite-plus/test";
import { validateMappings } from "../core/validator";
import type { SourceMapData } from "../core/types";

function makeSourceMap(overrides: Partial<SourceMapData> = {}): SourceMapData {
  return {
    version: 3,
    sources: ["a.js"],
    sourcesContent: ["line1\nline2\nline3"],
    names: ["foo"],
    mappings: [],
    ...overrides,
  };
}

describe("validateMappings", () => {
  it("reports invalid source index", () => {
    const data = makeSourceMap({
      mappings: [
        {
          generatedLine: 0,
          generatedColumn: 0,
          originalLine: 0,
          originalColumn: 0,
          sourceIndex: 5,
          nameIndex: null,
        },
      ],
    });
    const diagnostics = validateMappings(data);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].type).toBe("invalid-source");
  });

  it("reports out-of-bounds line", () => {
    const data = makeSourceMap({
      mappings: [
        {
          generatedLine: 0,
          generatedColumn: 0,
          originalLine: 99,
          originalColumn: 0,
          sourceIndex: 0,
          nameIndex: null,
        },
      ],
    });
    const diagnostics = validateMappings(data);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].type).toBe("out-of-bounds");
  });

  it("reports out-of-bounds column", () => {
    const data = makeSourceMap({
      sourcesContent: ["ab"],
      mappings: [
        {
          generatedLine: 0,
          generatedColumn: 0,
          originalLine: 0,
          originalColumn: 99,
          sourceIndex: 0,
          nameIndex: null,
        },
      ],
    });
    const diagnostics = validateMappings(data);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].type).toBe("out-of-bounds");
  });

  it("returns empty array for valid mappings", () => {
    const data = makeSourceMap({
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
    });
    const diagnostics = validateMappings(data);
    expect(diagnostics).toHaveLength(0);
  });

  it("skips validation when sourcesContent is null for source", () => {
    const data = makeSourceMap({
      sourcesContent: [null],
      mappings: [
        {
          generatedLine: 0,
          generatedColumn: 0,
          originalLine: 99,
          originalColumn: 0,
          sourceIndex: 0,
          nameIndex: null,
        },
      ],
    });
    const diagnostics = validateMappings(data);
    expect(diagnostics).toHaveLength(0);
  });
});
