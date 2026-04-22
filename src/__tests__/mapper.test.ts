import { describe, it, expect } from "vite-plus/test";
import {
  buildMappingIndex,
  buildInverseMappingIndex,
  buildVisibleGeneratedMappingIndex,
  findMappingForGenerated,
  findMappingsForOriginal,
  clampOriginalPosition,
  getRenderedColumnRange,
} from "../core/mapper";
import type { MappingSegment } from "../core/types";

const segments: MappingSegment[] = [
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
    generatedColumn: 5,
    originalLine: 1,
    originalColumn: 2,
    sourceIndex: 0,
    nameIndex: null,
  },
  {
    generatedLine: 1,
    generatedColumn: 0,
    originalLine: 2,
    originalColumn: 0,
    sourceIndex: 1,
    nameIndex: null,
  },
  {
    generatedLine: 1,
    generatedColumn: 10,
    originalLine: 3,
    originalColumn: 4,
    sourceIndex: 1,
    nameIndex: 0,
  },
];

describe("buildMappingIndex", () => {
  it("returns segments sorted by generated line then column", () => {
    const index = buildMappingIndex(segments);
    expect(index).toHaveLength(4);
    expect(index[0].generatedLine).toBe(0);
    expect(index[0].generatedColumn).toBe(0);
    expect(index[3].generatedLine).toBe(1);
    expect(index[3].generatedColumn).toBe(10);
  });
});

describe("findMappingForGenerated", () => {
  const index = buildMappingIndex(segments);

  it("finds exact match", () => {
    const result = findMappingForGenerated(index, 0, 5);
    expect(result).not.toBeNull();
    expect(result!.originalLine).toBe(1);
    expect(result!.originalColumn).toBe(2);
  });

  it("finds preceding segment when between two mappings", () => {
    const result = findMappingForGenerated(index, 0, 3);
    expect(result).not.toBeNull();
    expect(result!.generatedColumn).toBe(0);
  });

  it("returns null for position on unmapped line", () => {
    const result = findMappingForGenerated(index, 5, 0);
    expect(result).toBeNull();
  });
});

describe("buildInverseMappingIndex", () => {
  it("groups segments by source index", () => {
    const inverse = buildInverseMappingIndex(segments);
    expect(inverse.get(0)).toHaveLength(2);
    expect(inverse.get(1)).toHaveLength(2);
  });
});

describe("findMappingsForOriginal", () => {
  const inverse = buildInverseMappingIndex(segments);

  it("finds mappings for a specific original position", () => {
    const results = findMappingsForOriginal(inverse, 0, 1, 2);
    expect(results).toHaveLength(1);
    expect(results[0].generatedColumn).toBe(5);
  });

  it("returns empty array for unmapped position", () => {
    const results = findMappingsForOriginal(inverse, 0, 99, 0);
    expect(results).toHaveLength(0);
  });
});

describe("clampOriginalPosition", () => {
  const sourceLines = ["function foo() {", "  return 42;", "}"];

  it("returns position unchanged when within bounds", () => {
    const result = clampOriginalPosition(1, 5, sourceLines);
    expect(result).toEqual({ line: 1, column: 5 });
  });

  it("clamps line to last line when originalLine exceeds total lines", () => {
    const result = clampOriginalPosition(100, 0, sourceLines);
    expect(result).toEqual({ line: 2, column: 0 });
  });

  it("clamps column to line length when originalColumn exceeds line content", () => {
    // line 1 is "  return 42;" (12 chars), column 50 should clamp to 12
    const result = clampOriginalPosition(1, 50, sourceLines);
    expect(result).toEqual({ line: 1, column: 12 });
  });

  it("clamps both line and column when both exceed bounds", () => {
    const result = clampOriginalPosition(999, 999, sourceLines);
    // Last line is "}" (1 char), so line=2, column=1
    expect(result).toEqual({ line: 2, column: 1 });
  });

  it("clamps negative line to 0", () => {
    const result = clampOriginalPosition(-5, 3, sourceLines);
    expect(result).toEqual({ line: 0, column: 3 });
  });

  it("clamps negative column to 0", () => {
    const result = clampOriginalPosition(0, -10, sourceLines);
    expect(result).toEqual({ line: 0, column: 0 });
  });

  it("returns (0, 0) for empty source", () => {
    const result = clampOriginalPosition(5, 10, []);
    expect(result).toEqual({ line: 0, column: 0 });
  });

  it("handles column at exact end of line (valid)", () => {
    // line 0 is "function foo() {" (16 chars), column 16 is valid (end of line)
    const result = clampOriginalPosition(0, 16, sourceLines);
    expect(result).toEqual({ line: 0, column: 16 });
  });

  it("handles single-line source", () => {
    const singleLine = ["hello"];
    expect(clampOriginalPosition(0, 3, singleLine)).toEqual({ line: 0, column: 3 });
    expect(clampOriginalPosition(5, 0, singleLine)).toEqual({ line: 0, column: 0 });
  });

  it("handles source with empty lines", () => {
    const withEmpty = ["abc", "", "def"];
    // clamping column on the empty line (line 1, col 5) → col 0
    const result = clampOriginalPosition(1, 5, withEmpty);
    expect(result).toEqual({ line: 1, column: 0 });
  });

  it("handles source with trailing newline", () => {
    const trailingNewline = ["abc", "def", ""];
    // line 2 col 0 is valid (empty last line)
    expect(clampOriginalPosition(2, 0, trailingNewline)).toEqual({ line: 2, column: 0 });
    // line 2 col 1 clamps to 0 since the line is empty
    expect(clampOriginalPosition(2, 1, trailingNewline)).toEqual({ line: 2, column: 0 });
  });
});

describe("getRenderedColumnRange", () => {
  it("skips collapsed boundaries after indentation is trimmed", () => {
    const lineText = "                        return original.call(this, value);";
    const columns = [0, 10, 19, 24, 30, 36];

    expect(getRenderedColumnRange(columns, 0, lineText, { skipIndent: true })).toEqual({
      start: 24,
      end: 30,
    });
    expect(getRenderedColumnRange(columns, 1, lineText, { skipIndent: true })).toEqual({
      start: 24,
      end: 30,
    });
    expect(getRenderedColumnRange(columns, 3, lineText, { skipIndent: true })).toEqual({
      start: 24,
      end: 30,
    });
  });

  it("keeps the next distinct raw boundary when indentation trimming is disabled", () => {
    const lineText = "  return 42;";
    const columns = [0, 2, 9];

    expect(getRenderedColumnRange(columns, 0, lineText)).toEqual({ start: 0, end: 2 });
    expect(getRenderedColumnRange(columns, 1, lineText)).toEqual({ start: 2, end: 9 });
  });
});

describe("buildVisibleGeneratedMappingIndex", () => {
  it("drops generated mappings hidden by a later mapping at the same rendered start", () => {
    const mappings = buildMappingIndex([
      {
        generatedLine: 0,
        generatedColumn: 2,
        originalLine: 53,
        originalColumn: 2,
        sourceIndex: 0,
        nameIndex: null,
      },
      {
        generatedLine: 0,
        generatedColumn: 2,
        originalLine: 54,
        originalColumn: 2,
        sourceIndex: 0,
        nameIndex: null,
      },
      {
        generatedLine: 0,
        generatedColumn: 13,
        originalLine: 54,
        originalColumn: 21,
        sourceIndex: 0,
        nameIndex: null,
      },
    ]);

    const visible = buildVisibleGeneratedMappingIndex(mappings, ["  toString() {"]);

    expect(visible).toEqual([mappings[1], mappings[2]]);
  });

  it("preserves mappings that land on blank generated lines", () => {
    const mappings = buildMappingIndex([
      {
        generatedLine: 0,
        generatedColumn: 0,
        originalLine: 0,
        originalColumn: 0,
        sourceIndex: 0,
        nameIndex: null,
      },
      {
        generatedLine: 1,
        generatedColumn: 0,
        originalLine: 1,
        originalColumn: 0,
        sourceIndex: 0,
        nameIndex: null,
      },
    ]);

    const visible = buildVisibleGeneratedMappingIndex(mappings, ["const a = 1;", ""]);

    expect(visible).toEqual(mappings);
  });
});
