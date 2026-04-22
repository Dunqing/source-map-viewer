import { describe, it, expect } from "vite-plus/test";
import { buildInverseMappingIndex, buildMappingIndex } from "../core/mapper";
import { findTokenSplitSegments, validateMappings } from "../core/validator";
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

  it("reports out-of-bounds for negative line", () => {
    const data = makeSourceMap({
      mappings: [
        {
          generatedLine: 0,
          generatedColumn: 0,
          originalLine: -1,
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

  it("reports out-of-bounds for negative column", () => {
    const data = makeSourceMap({
      mappings: [
        {
          generatedLine: 0,
          generatedColumn: 0,
          originalLine: 0,
          originalColumn: -1,
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

  it("allows originalLine beyond source content length", () => {
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
    expect(diagnostics).toHaveLength(0);
  });

  it("allows originalColumn beyond line length", () => {
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
    expect(diagnostics).toHaveLength(0);
  });

  it("reports invalid-source for negative sourceIndex", () => {
    const data = makeSourceMap({
      mappings: [
        {
          generatedLine: 0,
          generatedColumn: 0,
          originalLine: 0,
          originalColumn: 0,
          sourceIndex: -1,
          nameIndex: null,
        },
      ],
    });
    const diagnostics = validateMappings(data);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].type).toBe("invalid-source");
  });

  it("reports invalid-source for sourceIndex at exact boundary", () => {
    const data = makeSourceMap({
      sources: ["a.js"],
      mappings: [
        {
          generatedLine: 0,
          generatedColumn: 0,
          originalLine: 0,
          originalColumn: 0,
          sourceIndex: 1,
          nameIndex: null,
        },
      ],
    });
    const diagnostics = validateMappings(data);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].type).toBe("invalid-source");
  });

  it("collects multiple diagnostics across segments", () => {
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
        {
          generatedLine: 0,
          generatedColumn: 5,
          originalLine: -1,
          originalColumn: 0,
          sourceIndex: 0,
          nameIndex: null,
        },
        {
          generatedLine: 0,
          generatedColumn: 10,
          originalLine: 0,
          originalColumn: 0,
          sourceIndex: 0,
          nameIndex: null,
        },
      ],
    });
    const diagnostics = validateMappings(data);
    expect(diagnostics).toHaveLength(2);
  });

  it("returns empty array for empty mappings", () => {
    const data = makeSourceMap({ mappings: [] });
    const diagnostics = validateMappings(data);
    expect(diagnostics).toHaveLength(0);
  });

  it("does not check sourcesContent at all", () => {
    const data = makeSourceMap({
      sources: ["a.js"],
      sourcesContent: [null],
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

  it("skips further checks when sourceIndex is invalid", () => {
    const data = makeSourceMap({
      mappings: [
        {
          generatedLine: 0,
          generatedColumn: 0,
          originalLine: -1,
          originalColumn: -1,
          sourceIndex: 99,
          nameIndex: null,
        },
      ],
    });
    const diagnostics = validateMappings(data);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].type).toBe("invalid-source");
  });
});

describe("findTokenSplitSegments", () => {
  it("flags boundaries that split an identifier on the generated side", () => {
    const first = {
      generatedLine: 0,
      generatedColumn: 1,
      originalLine: 0,
      originalColumn: 2,
      sourceIndex: 0,
      nameIndex: null,
    };
    const second = {
      generatedLine: 0,
      generatedColumn: 16,
      originalLine: 0,
      originalColumn: 25,
      sourceIndex: 0,
      nameIndex: null,
    };
    const data = makeSourceMap({
      sourcesContent: ["  toFahrenheit(): number {"],
      mappings: [first, second],
    });

    const result = findTokenSplitSegments(
      data,
      "        toFahrenheit() {",
      buildMappingIndex(data.mappings),
      buildInverseMappingIndex(data.mappings),
    );

    expect(result.has(first)).toBe(true);
    expect(result.has(second)).toBe(true);
  });

  it("ignores boundaries that fall between tokens", () => {
    const first = {
      generatedLine: 0,
      generatedColumn: 0,
      originalLine: 0,
      originalColumn: 0,
      sourceIndex: 0,
      nameIndex: null,
    };
    const second = {
      generatedLine: 0,
      generatedColumn: 8,
      originalLine: 0,
      originalColumn: 8,
      sourceIndex: 0,
      nameIndex: null,
    };
    const data = makeSourceMap({
      sourcesContent: ["return x;"],
      mappings: [first, second],
    });

    const result = findTokenSplitSegments(
      data,
      "return x;",
      buildMappingIndex(data.mappings),
      buildInverseMappingIndex(data.mappings),
    );

    expect(result.size).toBe(0);
  });

  it("does not flag original-side adjacent columns when the generated mappings are unrelated", () => {
    const first = {
      generatedLine: 0,
      generatedColumn: 0,
      originalLine: 0,
      originalColumn: 0,
      sourceIndex: 0,
      nameIndex: null,
    };
    const second = {
      generatedLine: 10,
      generatedColumn: 0,
      originalLine: 0,
      originalColumn: 1,
      sourceIndex: 0,
      nameIndex: null,
    };
    const data = makeSourceMap({
      sourcesContent: ["ab"],
      mappings: [first, second],
    });

    const result = findTokenSplitSegments(
      data,
      Array.from({ length: 11 }, () => "x").join("\n"),
      buildMappingIndex(data.mappings),
      buildInverseMappingIndex(data.mappings),
    );

    expect(result.size).toBe(0);
  });
});
