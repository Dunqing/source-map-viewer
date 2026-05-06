import { describe, it, expect } from "vite-plus/test";
import {
  diffMappings,
  findExactMappingInSameSource,
  findNearestMappingInSameSource,
} from "../core/diff";
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

const EMPTY_SUMMARY = { same: 0, shifted: 0, changed: 0, removed: 0, added: 0 };

describe("diffMappings", () => {
  it("reports all same when mappings are identical", () => {
    const mappings = [seg(0, 0, 1, 0), seg(0, 5, 2, 3), seg(1, 0, 3, 0)];
    const result = diffMappings(mappings, mappings);

    expect(result.summary).toEqual({ ...EMPTY_SUMMARY, same: 3 });
    for (const entry of result.entries) {
      expect(entry.status).toBe("same");
      expect(entry.a).not.toBeNull();
      expect(entry.b).not.toBeNull();
    }
  });

  it("classifies as changed when only original position differs (gen pinned)", () => {
    const a = [seg(0, 0, 1, 0)];
    const b = [seg(0, 0, 5, 10)];
    const result = diffMappings(a, b);

    expect(result.summary).toEqual({ ...EMPTY_SUMMARY, changed: 1 });
    expect(result.entries[0].status).toBe("changed");
    expect(result.entries[0].a).toEqual(a[0]);
    expect(result.entries[0].b).toEqual(b[0]);
    // Even non-shifted paired entries carry the Δ vector so the pattern
    // detector can group by movement shape regardless of status.
    expect(result.entries[0].shift).toEqual({ genLine: 0, genCol: 0, srcLine: 4, srcCol: 10 });
  });

  it("classifies as changed when only generated position differs (src pinned)", () => {
    const a = [seg(0, 0, 1, 0), seg(1, 0, 2, 0)];
    const b = [seg(0, 2, 1, 0), seg(1, 4, 2, 0)];
    const result = diffMappings(a, b);

    expect(result.summary).toEqual({ ...EMPTY_SUMMARY, changed: 2 });
    expect(result.entries.map((entry) => entry.status)).toEqual(["changed", "changed"]);
  });

  it("matches source identities by source name instead of source index when compare sources are reordered", () => {
    const a = [seg(0, 0, 1, 0, 0)];
    const b = [seg(0, 2, 1, 0, 1)];
    const result = diffMappings(a, b, {
      sourcesA: ["a.ts", "b.ts"],
      sourcesB: ["b.ts", "a.ts"],
    });

    expect(result.summary).toEqual({ ...EMPTY_SUMMARY, changed: 1 });
    expect(result.entries[0].status).toBe("changed");
  });

  it("treats equivalent normalized source paths as the same file", () => {
    const a = [seg(0, 0, 1, 0, 0)];
    const b = [seg(0, 0, 1, 0, 0)];
    const result = diffMappings(a, b, {
      sourcesA: ["./input.ts"],
      sourcesB: ["input.ts"],
    });

    expect(result.summary).toEqual({ ...EMPTY_SUMMARY, same: 1 });
    expect(result.entries[0].status).toBe("same");
  });

  it("detects removed mapping present in A but not B", () => {
    const a = [seg(0, 0, 1, 0), seg(0, 5, 2, 3)];
    const b = [seg(0, 0, 1, 0)];
    const result = diffMappings(a, b);

    expect(result.summary).toEqual({ ...EMPTY_SUMMARY, same: 1, removed: 1 });
    const removed = result.entries.find((e) => e.status === "removed");
    expect(removed).toBeDefined();
    expect(removed!.a).toEqual(seg(0, 5, 2, 3));
    expect(removed!.b).toBeNull();
  });

  it("detects added mapping present in B but not A", () => {
    const a = [seg(0, 0, 1, 0)];
    const b = [seg(0, 0, 1, 0), seg(1, 0, 3, 0)];
    const result = diffMappings(a, b);

    expect(result.summary).toEqual({ ...EMPTY_SUMMARY, same: 1, added: 1 });
    const added = result.entries.find((e) => e.status === "added");
    expect(added).toBeDefined();
    expect(added!.a).toBeNull();
    expect(added!.b).toEqual(seg(1, 0, 3, 0));
  });

  it("flags name-only differences as changed when names arrays are provided", () => {
    // Same generated and original positions, but the resolved name token differs.
    const a = [{ ...seg(0, 0, 1, 0), nameIndex: 0 }];
    const b = [{ ...seg(0, 0, 1, 0), nameIndex: 0 }];
    const result = diffMappings(a, b, { namesA: ["foo"], namesB: ["bar"] });

    expect(result.summary).toEqual({ ...EMPTY_SUMMARY, changed: 1 });
  });

  it("treats name-equivalent mappings as same even when nameIndex differs (different names arrays)", () => {
    // Same name string but at different indices in the two names arrays.
    const a = [{ ...seg(0, 0, 1, 0), nameIndex: 0 }];
    const b = [{ ...seg(0, 0, 1, 0), nameIndex: 1 }];
    const result = diffMappings(a, b, {
      namesA: ["foo", "bar"],
      namesB: ["bar", "foo"],
    });

    expect(result.summary).toEqual({ ...EMPTY_SUMMARY, same: 1 });
  });

  it("handles empty inputs", () => {
    expect(diffMappings([], []).summary).toEqual(EMPTY_SUMMARY);
    expect(diffMappings([seg(0, 0, 1, 0)], []).summary).toEqual({
      ...EMPTY_SUMMARY,
      removed: 1,
    });
    expect(diffMappings([], [seg(0, 0, 1, 0)]).summary).toEqual({
      ...EMPTY_SUMMARY,
      added: 1,
    });
  });

  it("handles mixed diff with same, changed, removed, and added", () => {
    const a = [
      seg(0, 0, 1, 0), // same in both
      seg(0, 5, 2, 3), // will change (gen pinned, src jumps lines)
      seg(1, 0, 3, 0), // removed — far enough from any B mapping that no pair fits
    ];
    const b = [
      seg(0, 0, 1, 0), // same in both
      seg(0, 5, 9, 9), // changed original position
      seg(20, 0, 50, 0), // added — far from A's gen lines so it can't pair
    ];
    const result = diffMappings(a, b);

    expect(result.summary).toEqual({ ...EMPTY_SUMMARY, same: 1, changed: 1, removed: 1, added: 1 });
    expect(result.entries).toHaveLength(4);

    // Verify sort order: entries sorted by generated position
    expect(result.entries[0].status).toBe("same"); // 0:0
    expect(result.entries[1].status).toBe("changed"); // 0:5
    expect(result.entries[2].status).toBe("removed"); // 1:0
    expect(result.entries[3].status).toBe("added"); // 20:0
  });

  it("pairs generated shifts before reporting removed and added mappings", () => {
    const a = [seg(2, 0, 2, 2), seg(3, 0, 3, 4), seg(38, 1, 48, 2)];
    const b = [seg(2, 2, 2, 2), seg(3, 4, 3, 4)];

    const result = diffMappings(a, b);

    expect(result.summary).toEqual({ ...EMPTY_SUMMARY, changed: 2, removed: 1 });
  });

  it("finds an exact raw counterpart even when compare-visible mappings might hide it", () => {
    const target = seg(33, 2, 39, 2);
    const rawCandidates = [target, seg(33, 6, 39, 6)];

    expect(findExactMappingInSameSource(target, ["test.ts"], rawCandidates, ["test.ts"])).toEqual(
      target,
    );
  });

  it("does not pick a nearest mapping from another source file", () => {
    const target = seg(33, 2, 39, 2, 0);
    const otherSourceCandidate = seg(33, 2, 39, 2, 1);

    expect(
      findNearestMappingInSameSource(target, ["a.ts"], [otherSourceCandidate], ["b.ts", "c.ts"]),
    ).toBeNull();
  });

  describe("ignoreSourceName option", () => {
    it("classifies as same when only source filename differs and ignoreSourceName is true", () => {
      const a = [seg(0, 0, 1, 0, 0)];
      const b = [seg(0, 0, 1, 0, 0)];
      const result = diffMappings(a, b, {
        sourcesA: ["before.js"],
        sourcesB: ["after.js"],
        ignoreSourceName: true,
      });

      expect(result.summary).toEqual({ ...EMPTY_SUMMARY, same: 1 });
      expect(result.entries[0].status).toBe("same");
    });

    it("still classifies as changed when ignoreSourceName is false (default)", () => {
      const a = [seg(0, 0, 1, 0, 0)];
      const b = [seg(0, 0, 1, 0, 0)];
      const result = diffMappings(a, b, {
        sourcesA: ["before.js"],
        sourcesB: ["after.js"],
      });

      // Source mismatch is treated as a rename, not a hard reject — pairs
      // anyway with status "changed" so the UI can render the rename inline
      // instead of showing twin removed/added rows.
      expect(result.summary).toEqual({ ...EMPTY_SUMMARY, changed: 1 });
      expect(result.entries[0].status).toBe("changed");
    });

    it("still classifies as changed when filename and original position both differ, even with ignoreSourceName true", () => {
      const a = [seg(0, 0, 1, 0, 0)];
      const b = [seg(0, 0, 5, 10, 0)];
      const result = diffMappings(a, b, {
        sourcesA: ["before.js"],
        sourcesB: ["after.js"],
        ignoreSourceName: true,
      });

      expect(result.summary).toEqual({ ...EMPTY_SUMMARY, changed: 1 });
      expect(result.entries[0].status).toBe("changed");
    });

    it("does not match an A-only mapping just because ignoreSourceName is true", () => {
      const a = [seg(0, 0, 1, 0, 0), seg(1, 0, 2, 0, 0)];
      const b = [seg(0, 0, 1, 0, 0)];
      const result = diffMappings(a, b, {
        sourcesA: ["before.js"],
        sourcesB: ["after.js"],
        ignoreSourceName: true,
      });

      expect(result.summary).toEqual({ ...EMPTY_SUMMARY, same: 1, removed: 1 });
    });
  });

  describe("shifted classification", () => {
    it("classifies a uniform off-by-one shift on three mappings", () => {
      // Models the oxc PR #22001 case: three end-tokens whose source AND
      // generated positions both moved left by exactly 1 column.
      const a = [seg(4, 19, 4, 25), seg(7, 9, 7, 9), seg(7, 11, 7, 11)];
      const b = [seg(4, 18, 4, 24), seg(7, 8, 7, 8), seg(7, 10, 7, 10)];

      const result = diffMappings(a, b);

      expect(result.summary).toEqual({ ...EMPTY_SUMMARY, shifted: 3 });
      for (const entry of result.entries) {
        expect(entry.status).toBe("shifted");
        expect(entry.shift).toEqual({ genLine: 0, genCol: -1, srcLine: 0, srcCol: -1 });
      }
    });

    it("classifies as shifted when both gen and src move by small amounts on the same line", () => {
      const a = [seg(0, 5, 1, 10)];
      const b = [seg(0, 7, 1, 12)];
      const result = diffMappings(a, b);

      expect(result.summary).toEqual({ ...EMPTY_SUMMARY, shifted: 1 });
      expect(result.entries[0].status).toBe("shifted");
      expect(result.entries[0].shift).toEqual({ genLine: 0, genCol: 2, srcLine: 0, srcCol: 2 });
    });

    it("does not classify as shifted when only one side moves (other axis pinned)", () => {
      const a = [seg(0, 5, 1, 10)];
      const b = [seg(0, 5, 1, 12)];
      const result = diffMappings(a, b);

      expect(result.summary).toEqual({ ...EMPTY_SUMMARY, changed: 1 });
      expect(result.entries[0].status).toBe("changed");
      // Δ vector still recorded for downstream pattern detection — only the
      // status differs from "shifted".
      expect(result.entries[0].shift).toEqual({ genLine: 0, genCol: 0, srcLine: 0, srcCol: 2 });
    });

    it("does not classify as shifted when the shift exceeds the small-shift column threshold", () => {
      // 6 cols on either side — beyond SHIFT_COL_LIMIT (=5).
      const a = [seg(0, 5, 1, 10)];
      const b = [seg(0, 11, 1, 16)];
      const result = diffMappings(a, b);

      // Falls through to the bounded-movement-on-both-axes branch (cost ~100+),
      // so it pairs as `changed`.
      expect(result.summary).toEqual({ ...EMPTY_SUMMARY, changed: 1 });
    });

    it("uses removed+added when a paired distance is too large to bridge", () => {
      // Same gen line but src jumped by >1 line AND gen also moved by >1 line
      // — neither the same-axis nor the bounded-relocation branches accept it.
      const a = [seg(0, 0, 1, 0)];
      const b = [seg(5, 50, 50, 100)];
      const result = diffMappings(a, b);

      expect(result.summary).toEqual({ ...EMPTY_SUMMARY, removed: 1, added: 1 });
    });

    it("calibration: prefers natural single-axis pairs over bilateral cross-pairs", () => {
      // The off-by-one closing-delimiter scenario: A has end-tokens at gen
      // cols 9 and 11 with src cols 9 and 11; B has the same gen cols but
      // src cols shifted by -1. Greedy by ascending cost MUST pair A1↔B1
      // and A2↔B2 (single-axis, Δsrc=(0,-1)) instead of crossing to
      // A1↔B2 / A2↔B1 (bilateral with larger Δs).
      //
      // This test guards the cost-base calibration: if anyone tweaks
      // COST_BILATERAL_SHIFT_BASE or COST_SINGLE_AXIS_BASE such that
      // bilateral becomes cheaper than single-axis for adjacent pairs,
      // the matcher would silently pick the wrong pairing.
      const a = [seg(7, 0, 7, 0), seg(7, 9, 7, 9), seg(7, 11, 7, 11)];
      const b = [seg(7, 0, 7, 0), seg(7, 9, 7, 8), seg(7, 11, 7, 10)];
      const result = diffMappings(a, b);

      const offByOne = result.entries.filter(
        (entry) =>
          entry.shift?.genLine === 0 &&
          entry.shift?.genCol === 0 &&
          entry.shift?.srcLine === 0 &&
          entry.shift?.srcCol === -1,
      );
      // Both off-by-one mappings should be paired with their natural
      // counterparts (A.gen 9 ↔ B.gen 9, A.gen 11 ↔ B.gen 11), not crossed.
      expect(offByOne).toHaveLength(2);
      // The exact-position mapping at 7:0 stays `same`.
      expect(result.summary.same).toBe(1);
      // No bilateral-shift cross-pairs sneaked in.
      expect(result.summary.shifted).toBe(0);
    });
  });
});
