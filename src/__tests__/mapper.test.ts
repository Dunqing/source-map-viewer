import { describe, it, expect } from "vite-plus/test";
import {
  buildMappingIndex,
  buildInverseMappingIndex,
  findMappingForGenerated,
  findMappingsForOriginal,
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
