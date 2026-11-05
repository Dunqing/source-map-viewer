import { describe, expect, it, vi } from "vite-plus/test";
import { parseSourceMap } from "../core/parser";
import { parseSourceMapLite } from "../core/parser-lite";
import type { SourceMapData } from "../core/types";

function basic(overrides: Record<string, unknown> = {}) {
  return {
    version: 3,
    sources: ["input.js"],
    sourcesContent: ["const value = 1;"],
    names: [],
    mappings: "AAAA",
    ...overrides,
  };
}

function parse(map: unknown) {
  return parseSourceMapLite(JSON.stringify(map));
}

function resolvedMappings(data: SourceMapData) {
  return data.mappings.map(({ sourceIndex, nameIndex, ...mapping }) => ({
    ...mapping,
    source: data.sources[sourceIndex],
    name: nameIndex === null ? null : data.names[nameIndex],
  }));
}

describe("parseSourceMapLite", () => {
  it("matches the browser parser for a basic map with names, offsets, and sourceRoot", () => {
    const raw = JSON.stringify(
      basic({
        file: "output.js",
        sourceRoot: "https://example.com/project/src/",
        sources: ["../input.js", "other.js"],
        sourcesContent: ["const value = 1;", null],
        names: ["value", "other"],
        mappings: "CAAAA,GCAAC;AACA",
      }),
    );
    const result = parseSourceMapLite(raw);
    expect(result).toEqual(parseSourceMap(raw));
    expect(result.sources).toEqual([
      "https://example.com/project/input.js",
      "https://example.com/project/src/other.js",
    ]);
    expect(result.mappings.every((mapping) => !("generatedEndColumn" in mapping))).toBe(true);
  });

  it("pads missing or short sourcesContent without shifting later section content", () => {
    const result = parse({
      version: 3,
      sections: [
        {
          offset: { line: 0, column: 0 },
          map: basic({ sources: ["a.js", "unused.js"], sourcesContent: ["a"] }),
        },
        {
          offset: { line: 1, column: 0 },
          map: basic({ sources: ["b.js", "missing.js"], sourcesContent: undefined }),
        },
        {
          offset: { line: 2, column: 0 },
          map: basic({ sources: ["c.js"], sourcesContent: ["c", "extra"] }),
        },
      ],
    });
    expect(result.sources).toEqual(["a.js", "unused.js", "b.js", "missing.js", "c.js"]);
    expect(result.sourcesContent).toEqual(["a", null, null, null, "c"]);
    expect(result.mappings.map((mapping) => mapping.sourceIndex)).toEqual([0, 2, 4]);
  });

  it("merges all indexed sections with resolved sources, names, and top-level metadata", () => {
    const result = parse({
      version: 3,
      file: "bundle.js",
      sections: [
        {
          offset: { line: 1, column: 4 },
          map: basic({
            file: "first.js",
            sourceRoot: "/src/first",
            sources: ["a.js"],
            names: ["unused", "first"],
            mappings: "AAAAC;AACA",
          }),
        },
        {
          offset: { line: 3, column: 7 },
          map: basic({
            sourceRoot: "https://example.com/src/",
            sources: ["b.js"],
            names: ["second"],
            mappings: "AAAAA;AACA",
          }),
        },
      ],
    });
    expect(result.file).toBe("bundle.js");
    expect(result.sources).toEqual(["/src/first/a.js", "https://example.com/src/b.js"]);
    expect(result.names).toEqual(["unused", "first", "second"]);
    expect(result.mappings).toEqual([
      {
        generatedLine: 1,
        generatedColumn: 4,
        originalLine: 0,
        originalColumn: 0,
        sourceIndex: 0,
        nameIndex: 1,
      },
      {
        generatedLine: 2,
        generatedColumn: 0,
        originalLine: 1,
        originalColumn: 0,
        sourceIndex: 0,
        nameIndex: null,
      },
      {
        generatedLine: 3,
        generatedColumn: 7,
        originalLine: 0,
        originalColumn: 0,
        sourceIndex: 1,
        nameIndex: 2,
      },
      {
        generatedLine: 4,
        generatedColumn: 0,
        originalLine: 1,
        originalColumn: 0,
        sourceIndex: 1,
        nameIndex: null,
      },
    ]);
  });

  it("applies nested column offsets only while remaining on the parent's first line", () => {
    const result = parse({
      version: 3,
      sections: [
        {
          offset: { line: 2, column: 7 },
          map: {
            version: 3,
            sections: [
              { offset: { line: 0, column: 3 }, map: basic() },
              {
                offset: { line: 1, column: 4 },
                map: {
                  version: 3,
                  sections: [
                    { offset: { line: 0, column: 2 }, map: basic() },
                    { offset: { line: 1, column: 5 }, map: basic({ mappings: "AAAA;AACA" }) },
                  ],
                },
              },
            ],
          },
        },
      ],
    });
    expect(
      result.mappings.map(({ generatedLine, generatedColumn }) => [generatedLine, generatedColumn]),
    ).toEqual([
      [2, 10],
      [3, 6],
      [4, 5],
      [5, 0],
    ]);
    expect(result.mappings.map((mapping) => mapping.sourceIndex)).toEqual([0, 1, 2, 2]);
  });

  it("matches browser mapping semantics for indexed maps with duplicate tables", () => {
    const raw = JSON.stringify({
      version: 3,
      file: "bundle.js",
      sections: [
        {
          offset: { line: 0, column: 0 },
          map: basic({ sourceRoot: "/src", names: ["value"], mappings: "AAAAA" }),
        },
        {
          offset: { line: 2, column: 0 },
          map: basic({ sourceRoot: "/src", names: ["value", "second"], mappings: "AAAAC" }),
        },
      ],
    });
    const result = parseSourceMapLite(raw);
    expect(result.sources).toEqual(["/src/input.js", "/src/input.js"]);
    expect(result.names).toEqual(["value", "value", "second"]);
    expect(resolvedMappings(result)).toEqual(resolvedMappings(parseSourceMap(raw)));
  });

  it("ends mapped spans at explicit unmapped boundaries and resumes after gaps", () => {
    const result = parse(basic({ mappings: "E,CAAA,E,CAAC;AAAA,G" }));
    expect(result.mappings).toEqual([
      {
        generatedLine: 0,
        generatedColumn: 3,
        generatedEndColumn: 5,
        originalLine: 0,
        originalColumn: 0,
        sourceIndex: 0,
        nameIndex: null,
      },
      {
        generatedLine: 0,
        generatedColumn: 6,
        originalLine: 0,
        originalColumn: 1,
        sourceIndex: 0,
        nameIndex: null,
      },
      {
        generatedLine: 1,
        generatedColumn: 0,
        generatedEndColumn: 3,
        originalLine: 0,
        originalColumn: 1,
        sourceIndex: 0,
        nameIndex: null,
      },
    ]);
  });

  it("retains duplicate occurrences and ends all duplicates at the preceding position", () => {
    const result = parse(basic({ mappings: "AAAA,AAAC,G,E,CAAC" }));
    expect(
      result.mappings.map((mapping) => [
        mapping.generatedColumn,
        mapping.originalColumn,
        mapping.generatedEndColumn,
      ]),
    ).toEqual([
      [0, 0, 3],
      [0, 1, 3],
      [6, 2, undefined],
    ]);
  });

  it("marks only the preceding mapped position and never ends across lines", () => {
    const result = parse(basic({ mappings: "AAAA,CAAC,G;G;AAAA" }));
    expect(result.mappings.map((mapping) => mapping.generatedEndColumn)).toEqual([
      undefined,
      4,
      undefined,
    ]);
    expect(result.mappings[0]).not.toHaveProperty("generatedEndColumn");
    expect(result.mappings[2]).not.toHaveProperty("generatedEndColumn");
  });

  it("offsets explicit boundaries in nested maps", () => {
    const result = parse({
      version: 3,
      sections: [
        {
          offset: { line: 2, column: 7 },
          map: {
            version: 3,
            sections: [
              { offset: { line: 0, column: 3 }, map: basic({ mappings: "AAAA,G;AAAA,E" }) },
            ],
          },
        },
      ],
    });
    expect(
      result.mappings.map(({ generatedLine, generatedColumn, generatedEndColumn }) => [
        generatedLine,
        generatedColumn,
        generatedEndColumn,
      ]),
    ).toEqual([
      [2, 10, 13],
      [3, 0, 2],
    ]);
  });

  it("closes a preceding section's mapping when the next section starts unmapped", () => {
    const result = parse({
      version: 3,
      sections: [
        { offset: { line: 0, column: 2 }, map: basic() },
        { offset: { line: 0, column: 7 }, map: basic({ mappings: "A,GAAA" }) },
      ],
    });
    expect(
      result.mappings.map(({ generatedColumn, generatedEndColumn, sourceIndex }) => [
        generatedColumn,
        generatedEndColumn,
        sourceIndex,
      ]),
    ).toEqual([
      [2, 7, 0],
      [10, undefined, 1],
    ]);
  });

  it("matches the browser parser for explicit unmapped gaps", () => {
    const raw = JSON.stringify(basic({ names: ["value"], mappings: "AAAAA,AAAC,G,CAAA;AAAA,E" }));
    expect(parseSourceMapLite(raw)).toEqual(parseSourceMap(raw));
  });

  it("handles empty indexed maps", () => {
    expect(parse({ version: 3, file: "empty.js", sections: [] })).toEqual({
      version: 3,
      file: "empty.js",
      sourceRoot: undefined,
      sources: [],
      sourcesContent: [],
      names: [],
      mappings: [],
    });
  });

  it("does not require dynamic function evaluation", () => {
    vi.stubGlobal("Function", () => {
      throw new Error("Dynamic code evaluation is disabled");
    });
    try {
      expect(parse(basic()).mappings).toHaveLength(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("rejects unsupported versions in both regular and nested maps", () => {
    expect(() => parse(basic({ version: 2 }))).toThrow("Unsupported source map version: 2");
    expect(() =>
      parse({
        version: 3,
        sections: [{ offset: { line: 0, column: 0 }, map: basic({ version: 2 }) }],
      }),
    ).toThrow("Unsupported source map version: 2");
  });
});
