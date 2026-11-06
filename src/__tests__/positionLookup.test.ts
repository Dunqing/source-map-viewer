import { describe, expect, it } from "vite-plus/test";
import { lookupPosition, parsePositionInput, type PositionQuery } from "../core/positionLookup";
import { parseSourceMap } from "../core/parser";
import type { MappingSegment, SourceMapData } from "../core/types";

function segment(overrides: Partial<MappingSegment> = {}): MappingSegment {
  return {
    generatedLine: 0,
    generatedColumn: 2,
    originalLine: 0,
    originalColumn: 1,
    sourceIndex: 0,
    nameIndex: null,
    ...overrides,
  };
}

function sourceMap(mappings: MappingSegment[] = [segment()]): SourceMapData {
  return {
    version: 3,
    sources: ["first.js", "second.js"],
    sourcesContent: ["original\nnext", "second"],
    names: [],
    mappings,
  };
}

function generated(column: number, line = 0): PositionQuery {
  return { side: "generated", line, column, sourceIndex: -1 };
}

function original(column: number, line = 0, sourceIndex = 0): PositionQuery {
  return { side: "original", line, column, sourceIndex };
}

describe("parsePositionInput", () => {
  it.each([
    ["1:0", 0, { line: 0, column: 0, filename: null }],
    [" 12:43 ", 0, { line: 11, column: 43, filename: null }],
    ["12:43", 1, { line: 11, column: 42, filename: null }],
    ["app.js:2:1", 1, { line: 1, column: 0, filename: "app.js" }],
    [
      "https://host:8080/app.js:1:43",
      0,
      { line: 0, column: 43, filename: "https://host:8080/app.js" },
    ],
    ["C:\\work\\app.js:2:3", 0, { line: 1, column: 3, filename: "C:\\work\\app.js" }],
    [
      "at fn (https://host/app.js:1:43)",
      1,
      { line: 0, column: 42, filename: "https://host/app.js" },
    ],
    ["at https://host/app.js:1:43", 0, { line: 0, column: 43, filename: "https://host/app.js" }],
    ["fn@https://host/app.js:1:43", 1, { line: 0, column: 42, filename: "https://host/app.js" }],
    ["@https://host/app.js:1:43", 0, { line: 0, column: 43, filename: "https://host/app.js" }],
    ["at fn (C:\\work\\app.js:2:3)", 1, { line: 1, column: 2, filename: "C:\\work\\app.js" }],
    ["fn@C:\\work\\app.js:2:3", 0, { line: 1, column: 3, filename: "C:\\work\\app.js" }],
    [
      "https://user@host/app.js:1:43",
      0,
      { line: 0, column: 43, filename: "https://user@host/app.js" },
    ],
  ] as const)("parses %s with column base %s", (input, base, expected) => {
    expect(parsePositionInput(input, base)).toEqual(expected);
  });

  it.each([
    ["at fn (/tmp/work (copy)/app.js:2:3)", "/tmp/work (copy)/app.js"],
    ["at /tmp/work (copy)/app.js:2:3", "/tmp/work (copy)/app.js"],
    ["at fn (/tmp/work (copy (2))/app.js:2:3)", "/tmp/work (copy (2))/app.js"],
    ["at /tmp/work (copy (2))/app.js:2:3", "/tmp/work (copy (2))/app.js"],
    ["at fn (C:\\work (copy)\\app.js:2:3)", "C:\\work (copy)\\app.js"],
    ["at C:\\work (copy)\\app.js:2:3", "C:\\work (copy)\\app.js"],
    ["fn/</<@https://host/app.js:2:3", "https://host/app.js"],
    ["async*fn/</<@https://user@host/app.js:2:3", "https://user@host/app.js"],
    ["fn/</<@C:\\work\\app.js:2:3", "C:\\work\\app.js"],
    ["https://user@host/path@app.js:2:3", "https://user@host/path@app.js"],
    ["//user@host/path@app.js:2:3", "//user@host/path@app.js"],
    ["/tmp/work@app/app.js:2:3", "/tmp/work@app/app.js"],
    ["C:\\work@app\\app.js:2:3", "C:\\work@app\\app.js"],
  ])("preserves the filename in %s", (input, filename) => {
    expect(parsePositionInput(input, 1)).toEqual({ line: 1, column: 2, filename });
  });

  it.each([
    "",
    "1",
    "1:",
    ":1:2",
    "0:1",
    "-1:2",
    "1:-2",
    "1.5:2",
    "app.js:1:2.5",
    "1:NaN",
    "1:Infinity",
    "1:1e3",
    "9007199254740992:1",
    "1:9007199254740992",
    "at fn (https://host/app.js:1:43",
    "at fn (https://host/app.js:1:43) trailing",
    "at fn (/tmp/work (copy)/app.js:2:3",
    "at fn (/tmp/work (copy)/app.js:2:3))",
    "at /tmp/work (copy/app.js:2:3",
    "at one (app.js:1:2)\nat two (app.js:2:3)",
  ])("rejects malformed or unsafe input %j", (input) => {
    expect(() => parsePositionInput(input, 0)).toThrow(Error);
  });

  it("keeps an explicit column base for every frame syntax", () => {
    for (const input of ["1:0", "file.js:1:0", "at fn (file.js:1:0)", "fn@file.js:1:0"]) {
      expect(parsePositionInput(input, 0).column).toBe(0);
      expect(() => parsePositionInput(input, 1)).toThrow(/Column.*at least 1/u);
    }
    expect(parsePositionInput("9007199254740991:9007199254740991", 1)).toEqual({
      line: Number.MAX_SAFE_INTEGER - 1,
      column: Number.MAX_SAFE_INTEGER - 1,
      filename: null,
    });
  });
});

describe("lookupPosition generated positions", () => {
  const code = "abcdefghijklmnop";

  it("distinguishes exact points from preceding ranges and stops at the next point", () => {
    const first = segment();
    const second = segment({ generatedColumn: 8, originalColumn: 4 });
    const data = sourceMap([second, first]);
    expect(lookupPosition(data, code, generated(2))).toMatchObject({
      kind: "exact",
      matches: [first],
      endColumn: 8,
    });
    expect(lookupPosition(data, code, generated(7))).toMatchObject({
      kind: "range",
      matches: [first],
      endColumn: 8,
    });
    expect(lookupPosition(data, code, generated(8))).toMatchObject({
      kind: "exact",
      matches: [second],
      endColumn: code.length,
    });
    expect(lookupPosition(data, code, generated(15))).toMatchObject({
      kind: "range",
      matches: [second],
      endColumn: code.length,
    });
  });

  it("reports leading gaps and lines without mappings without borrowing across lines", () => {
    const data = sourceMap([segment(), segment({ generatedLine: 2, generatedColumn: 3 })]);
    expect(lookupPosition(data, "abcdef\nabcdef\nabcdef", generated(1))).toMatchObject({
      kind: "unmapped",
      matches: [],
      endColumn: 2,
    });
    expect(lookupPosition(data, "abcdef\nabcdef\nabcdef", generated(5, 1))).toMatchObject({
      kind: "unmapped",
      matches: [],
      endColumn: 6,
    });
    expect(lookupPosition(data, "abcdef\nabcdef\nabcdef", generated(0, 2))).toMatchObject({
      kind: "unmapped",
      matches: [],
      endColumn: 3,
    });
  });

  it("honors parsed explicit gaps including their exclusive starts and trailing gaps", () => {
    const data = parseSourceMap(
      JSON.stringify({
        version: 3,
        sources: ["input.js"],
        names: [],
        mappings: "AAAA,K,KAAA,G",
      }),
    );
    expect(lookupPosition(data, code, generated(4))).toMatchObject({ kind: "range", endColumn: 5 });
    for (const column of [5, 9]) {
      expect(lookupPosition(data, code, generated(column))).toMatchObject({
        kind: "unmapped",
        matches: [],
        endColumn: 10,
      });
    }
    expect(lookupPosition(data, code, generated(10))).toMatchObject({
      kind: "exact",
      endColumn: 13,
    });
    expect(lookupPosition(data, code, generated(12))).toMatchObject({
      kind: "range",
      endColumn: 13,
    });
    expect(lookupPosition(data, code, generated(13))).toMatchObject({
      kind: "unmapped",
      endColumn: code.length,
      message: expect.stringContaining("gap"),
    });
  });

  it("preserves every duplicate and takes the earliest distinct or explicit end", () => {
    const first = segment({ generatedEndColumn: 6 });
    const duplicate = segment({ originalLine: 1, generatedEndColumn: 6 });
    const next = segment({ generatedColumn: 10 });
    const data = sourceMap([first, duplicate, next]);
    for (const column of [2, 5]) {
      const result = lookupPosition(data, code, generated(column));
      expect(result).toMatchObject({
        kind: column === 2 ? "exact" : "range",
        matches: [first, duplicate],
        endColumn: 6,
      });
      expect(result.matches[0]).toBe(first);
      expect(result.matches[1]).toBe(duplicate);
    }
    expect(lookupPosition(data, code, generated(6))).toMatchObject({
      kind: "unmapped",
      endColumn: 10,
    });
    expect(
      lookupPosition(sourceMap([first, segment({ generatedColumn: 4 })]), code, generated(3))
        .endColumn,
    ).toBe(4);
    expect(
      lookupPosition(sourceMap([segment({ generatedEndColumn: 30 })]), code, generated(3))
        .endColumn,
    ).toBe(code.length);
  });

  it("permits exact points and bounded inferred ranges without generated code", () => {
    const data = sourceMap([
      segment({ generatedColumn: 20, generatedEndColumn: 25 }),
      segment({ generatedColumn: 3 }),
      segment({ generatedColumn: 30 }),
    ]);
    expect(lookupPosition(data, "", generated(3))).toMatchObject({ kind: "exact", endColumn: 20 });
    expect(lookupPosition(data, "", generated(19))).toMatchObject({ kind: "range", endColumn: 20 });
    expect(lookupPosition(data, "", generated(24))).toMatchObject({ kind: "range", endColumn: 25 });
    expect(lookupPosition(data, "", generated(25))).toMatchObject({
      kind: "unmapped",
      endColumn: 30,
    });
    expect(lookupPosition(data, "", generated(30))).toMatchObject({
      kind: "exact",
      endColumn: null,
    });
    expect(lookupPosition(data, "", generated(31))).toMatchObject({
      kind: "unmapped",
      endColumn: null,
    });
    expect(lookupPosition(data, "", generated(0, 8))).toMatchObject({
      kind: "unmapped",
      endColumn: null,
    });
  });

  it("validates known content bounds but permits exact points at line end", () => {
    const data = sourceMap([
      segment({ generatedColumn: 3 }),
      segment({ generatedLine: 1, generatedColumn: 0 }),
    ]);
    expect(lookupPosition(data, "abc\n", generated(3))).toMatchObject({
      kind: "exact",
      endColumn: 3,
    });
    expect(lookupPosition(data, "abc\n", generated(0, 1)).kind).toBe("exact");
    for (const query of [generated(4), generated(1, 1), generated(0, 2)]) {
      expect(lookupPosition(data, "abc\n", query).kind).toBe("out-of-bounds");
    }
    // A line-end position is valid, even when no mapping owns that exclusive endpoint.
    expect(lookupPosition(sourceMap(), "abc", generated(3)).kind).toBe("unmapped");
    expect(lookupPosition(sourceMap(), "abc", generated(2)).kind).toBe("exact");
    expect(lookupPosition(sourceMap(), "abc", { ...generated(2), sourceIndex: NaN }).kind).toBe(
      "exact",
    );
  });
});

describe("lookupPosition original positions", () => {
  it("returns all exact matches for the selected source only", () => {
    const first = segment();
    const second = segment({ generatedLine: 1, generatedColumn: 5 });
    const otherSource = segment({ sourceIndex: 1 });
    const data = sourceMap([first, otherSource, second]);
    expect(lookupPosition(data, "", original(1))).toMatchObject({
      kind: "exact",
      matches: [first, second],
      endColumn: null,
    });
    expect(lookupPosition(data, "", original(1, 0, 1))).toMatchObject({
      kind: "exact",
      matches: [otherSource],
      endColumn: null,
    });
    for (const query of [original(0), original(2), original(1, 1)]) {
      expect(lookupPosition(data, "", query)).toMatchObject({
        kind: "unmapped",
        matches: [],
        endColumn: null,
      });
    }
  });

  it("supports exact mapping points with missing original content", () => {
    const mapping = segment({ originalLine: 99, originalColumn: 300 });
    const data = sourceMap([mapping]);
    data.sourcesContent = [null];
    expect(lookupPosition(data, "", original(300, 99))).toMatchObject({
      kind: "exact",
      matches: [mapping],
    });
    expect(lookupPosition(data, "", original(301, 99)).kind).toBe("unmapped");
    const second = segment({ sourceIndex: 1 });
    data.mappings.push(second);
    expect(lookupPosition(data, "", original(1, 0, 1))).toMatchObject({
      kind: "exact",
      matches: [second],
    });
  });

  it("checks known source bounds and treats empty content as known", () => {
    const data = sourceMap([segment({ originalColumn: 8 })]);
    expect(lookupPosition(data, "", original(8)).kind).toBe("exact");
    for (const query of [original(9), original(0, 2), original(5, 1)]) {
      expect(lookupPosition(data, "", query).kind).toBe("out-of-bounds");
    }
    data.sourcesContent[0] = "";
    expect(lookupPosition(data, "", original(1)).kind).toBe("out-of-bounds");
    expect(lookupPosition(data, "", original(0)).kind).toBe("unmapped");
  });

  it.each([-1, 2, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
    "rejects invalid source index %s",
    (index) => {
      expect(lookupPosition(sourceMap(), "", original(1, 0, index)).kind).toBe("out-of-bounds");
    },
  );
});

describe("lookupPosition shared behavior", () => {
  it.each([-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
    "rejects invalid coordinates %s",
    (coordinate) => {
      for (const side of ["generated", "original"] as const) {
        expect(
          lookupPosition(sourceMap(), "abc", { side, sourceIndex: 0, line: coordinate, column: 0 })
            .kind,
        ).toBe("out-of-bounds");
        expect(
          lookupPosition(sourceMap(), "abc", { side, sourceIndex: 0, line: 0, column: coordinate })
            .kind,
        ).toBe("out-of-bounds");
      }
    },
  );

  it("returns unmapped for empty maps", () => {
    const data = sourceMap([]);
    expect(lookupPosition(data, "abc", generated(0))).toMatchObject({
      kind: "unmapped",
      matches: [],
      endColumn: 3,
    });
    expect(lookupPosition(data, "", generated(0))).toMatchObject({
      kind: "unmapped",
      matches: [],
      endColumn: null,
    });
    expect(lookupPosition(data, "", original(0))).toMatchObject({
      kind: "unmapped",
      matches: [],
      endColumn: null,
    });
  });

  it("uses human line numbers and zero-based columns in messages", () => {
    const data = sourceMap([
      segment({ generatedLine: 1, generatedColumn: 2, originalLine: 1, originalColumn: 2 }),
    ]);
    expect(lookupPosition(data, "abc\ndef", generated(2, 1)).message).toContain("2:2");
    expect(lookupPosition(data, "abc\ndef", generated(3, 1)).message).toContain("2:3");
    expect(lookupPosition(data, "", original(2, 1)).message).toContain("2:2");
  });

  it("does not mutate source map data or collapse duplicate occurrences", () => {
    const mapping = segment();
    const data = sourceMap([segment({ generatedColumn: 5 }), mapping, mapping]);
    const snapshot = structuredClone(data);
    for (const item of data.mappings) Object.freeze(item);
    Object.freeze(data.mappings);
    Object.freeze(data.sources);
    Object.freeze(data.sourcesContent);
    Object.freeze(data);
    expect(lookupPosition(data, "abcdef", generated(2)).matches).toEqual([mapping, mapping]);
    expect(lookupPosition(data, "abcdef", original(1)).matches).toHaveLength(3);
    expect(data).toEqual(snapshot);
  });
});
