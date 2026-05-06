import { describe, expect, it } from "vite-plus/test";
import { diffMappings } from "../core/diff";
import { detectPatterns } from "../core/patterns";
import type { MappingSegment } from "../core/types";

function seg(
  genLine: number,
  genCol: number,
  origLine: number,
  origCol: number,
  sourceIndex = 0,
): MappingSegment {
  return {
    generatedLine: genLine,
    generatedColumn: genCol,
    originalLine: origLine,
    originalColumn: origCol,
    sourceIndex,
    nameIndex: null,
  };
}

describe("detectPatterns", () => {
  it("returns no patterns for empty entries", () => {
    expect(detectPatterns([])).toEqual([]);
  });

  it("returns no patterns when every entry is `same`", () => {
    const a = [seg(0, 0, 1, 0), seg(1, 0, 2, 0)];
    const b = a;
    const result = diffMappings(a, b);
    expect(detectPatterns(result.entries)).toEqual([]);
  });

  it("clusters uniform off-by-one shifts on the same source into one shift pattern", () => {
    // Three single-axis off-by-one shifts: gen pinned, src moves -1 col.
    const a = [seg(4, 19, 4, 25), seg(7, 9, 7, 9), seg(7, 11, 7, 11)];
    const b = [seg(4, 19, 4, 24), seg(7, 9, 7, 8), seg(7, 11, 7, 10)];
    const result = diffMappings(a, b);

    const patterns = detectPatterns(result.entries, {
      sourcesA: ["input.js"],
      sourcesB: ["input.js"],
    });

    expect(patterns).toHaveLength(1);
    expect(patterns[0].kind).toBe("shift");
    expect(patterns[0].members).toHaveLength(3);
    expect(patterns[0].shift).toEqual({ genLine: 0, genCol: 0, srcLine: 0, srcCol: -1 });
    expect(patterns[0].sourceName).toBe("input.js");
    expect(patterns[0].description).toContain("3 mappings");
    expect(patterns[0].description).toContain("Δsrc(0,-1)");
    expect(patterns[0].description).toContain("input.js");
  });

  it("does not surface a singleton shift as a pattern (default minSize=2)", () => {
    const a = [seg(0, 5, 0, 5)];
    const b = [seg(0, 5, 0, 4)];
    const result = diffMappings(a, b);
    expect(detectPatterns(result.entries)).toEqual([]);
  });

  it("lowering minSize to 1 surfaces singleton shifts", () => {
    const a = [seg(0, 5, 0, 5)];
    const b = [seg(0, 5, 0, 4)];
    const result = diffMappings(a, b);
    const patterns = detectPatterns(result.entries, { minSize: 1 });
    expect(patterns).toHaveLength(1);
    expect(patterns[0].kind).toBe("shift");
    expect(patterns[0].members).toHaveLength(1);
  });

  it("clusters paired entries with zero shift but renamed source as a rename pattern", () => {
    const a = [seg(0, 0, 1, 0, 0), seg(1, 0, 2, 0, 0), seg(2, 0, 3, 0, 0)];
    const b = a;
    const result = diffMappings(a, b, {
      sourcesA: ["before.js"],
      sourcesB: ["after.js"],
    });

    const patterns = detectPatterns(result.entries, {
      sourcesA: ["before.js"],
      sourcesB: ["after.js"],
    });

    expect(patterns).toHaveLength(1);
    expect(patterns[0].kind).toBe("rename");
    expect(patterns[0].members).toHaveLength(3);
    expect(patterns[0].sourceFrom).toBe("before.js");
    expect(patterns[0].sourceTo).toBe("after.js");
    expect(patterns[0].description).toContain("before.js → after.js");
  });

  it("suppresses rename pattern detection when ignoreSourceName is set", () => {
    const a = [seg(0, 0, 1, 0, 0), seg(1, 0, 2, 0, 0), seg(2, 0, 3, 0, 0)];
    const b = a;
    const result = diffMappings(a, b, {
      sourcesA: ["before.js"],
      sourcesB: ["after.js"],
      ignoreSourceName: true,
    });

    const patterns = detectPatterns(result.entries, {
      sourcesA: ["before.js"],
      sourcesB: ["after.js"],
      ignoreSourceName: true,
    });

    // Toggle "Ignore source filename" should also suppress the rename
    // pattern card — otherwise the UI contradicts itself.
    expect(patterns).toHaveLength(0);
  });

  it("clusters adjacent added entries into an added-block", () => {
    const a = [seg(0, 0, 0, 0)];
    // Three added entries on adjacent gen lines.
    const b = [seg(0, 0, 0, 0), seg(1, 0, 1, 0), seg(2, 0, 2, 0), seg(3, 0, 3, 0)];
    const result = diffMappings(a, b);

    const patterns = detectPatterns(result.entries, {
      sourcesA: ["input.js"],
      sourcesB: ["input.js"],
    });

    const block = patterns.find((p) => p.kind === "added-block");
    expect(block).toBeDefined();
    expect(block!.members).toHaveLength(3);
    expect(block!.description).toContain("3 mappings added");
    expect(block!.description).toContain("gen lines 2–4");
  });

  it("breaks a non-adjacent added run into separate clusters", () => {
    const a = [seg(0, 0, 0, 0)];
    // Two adjacent additions, then a gap of 5 lines, then one more addition.
    const b = [seg(0, 0, 0, 0), seg(1, 0, 1, 0), seg(2, 0, 2, 0), seg(8, 0, 8, 0)];
    const result = diffMappings(a, b);

    const patterns = detectPatterns(result.entries);
    const blocks = patterns.filter((p) => p.kind === "added-block");
    // The 2 adjacent additions cluster; the lone one at gen line 8 stays
    // ungrouped because it's below minSize.
    expect(blocks).toHaveLength(1);
    expect(blocks[0].members).toHaveLength(2);
  });

  it("clusters adjacent removed entries into a removed-block", () => {
    const a = [seg(0, 0, 0, 0), seg(5, 0, 5, 0), seg(6, 0, 6, 0), seg(7, 0, 7, 0)];
    const b = [seg(0, 0, 0, 0)];
    const result = diffMappings(a, b);

    const patterns = detectPatterns(result.entries);
    const block = patterns.find((p) => p.kind === "removed-block");
    expect(block).toBeDefined();
    expect(block!.members).toHaveLength(3);
    expect(block!.description).toContain("3 mappings removed");
  });

  it("orders patterns by member count descending", () => {
    // Mixed scenario: a 3-member rename pattern + a 2-member shift pattern.
    const a = [
      seg(0, 0, 0, 0, 0),
      seg(1, 0, 1, 0, 0),
      seg(2, 0, 2, 0, 0),
      seg(3, 5, 3, 5, 0),
      seg(4, 5, 4, 5, 0),
    ];
    const b = [
      seg(0, 0, 0, 0, 0),
      seg(1, 0, 1, 0, 0),
      seg(2, 0, 2, 0, 0),
      seg(3, 5, 3, 4, 0),
      seg(4, 5, 4, 4, 0),
    ];
    const result = diffMappings(a, b, {
      sourcesA: ["before.js"],
      sourcesB: ["after.js"],
    });
    const patterns = detectPatterns(result.entries, {
      sourcesA: ["before.js"],
      sourcesB: ["after.js"],
    });

    expect(patterns).toHaveLength(2);
    // Rename has 3 members, shift has 2; rename comes first.
    expect(patterns[0].kind).toBe("rename");
    expect(patterns[0].members).toHaveLength(3);
    expect(patterns[1].kind).toBe("shift");
    expect(patterns[1].members).toHaveLength(2);
  });

  it("produces stable content-derived keys that survive recomputes", () => {
    // Two independent diff runs over the same input should produce patterns
    // with identical keys, so UI selection by key survives recompute (e.g.
    // toggling `ignoreSourceName`).
    const a = [seg(0, 0, 1, 0, 0), seg(1, 0, 2, 0, 0)];
    const b = a;
    const opts = { sourcesA: ["before.js"], sourcesB: ["after.js"] };
    const r1 = diffMappings(a, b, opts);
    const r2 = diffMappings(a, b, opts);
    const p1 = detectPatterns(r1.entries, opts);
    const p2 = detectPatterns(r2.entries, opts);
    expect(p1.map((p) => p.key)).toEqual(p2.map((p) => p.key));
  });

  it("separates shift patterns by Δ shape even on the same source", () => {
    // Two off-by-one shifts and one off-by-two shift, all on the same source.
    const a = [seg(0, 5, 0, 5), seg(1, 5, 1, 5), seg(2, 5, 2, 5)];
    const b = [seg(0, 5, 0, 4), seg(1, 5, 1, 4), seg(2, 5, 2, 3)];
    const result = diffMappings(a, b);
    const patterns = detectPatterns(result.entries);

    // Two single-axis off-by-1 → 1 pattern (size 2)
    // Single-axis off-by-2 → singleton, below minSize, no pattern
    expect(patterns).toHaveLength(1);
    expect(patterns[0].kind).toBe("shift");
    expect(patterns[0].members).toHaveLength(2);
    expect(patterns[0].shift!.srcCol).toBe(-1);
  });
});
