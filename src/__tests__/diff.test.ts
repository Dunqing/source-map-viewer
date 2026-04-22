import { describe, it, expect } from "vite-plus/test";
import { diffMappings } from "../core/diff";
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

describe("diffMappings", () => {
  it("reports all same when mappings are identical", () => {
    const mappings = [seg(0, 0, 1, 0), seg(0, 5, 2, 3), seg(1, 0, 3, 0)];
    const result = diffMappings(mappings, mappings);

    expect(result.summary).toEqual({
      same: 3,
      changed: 0,
      removed: 0,
      added: 0,
    });
    for (const entry of result.entries) {
      expect(entry.status).toBe("same");
      expect(entry.a).not.toBeNull();
      expect(entry.b).not.toBeNull();
    }
  });

  it("detects changed mapping when original position differs", () => {
    const a = [seg(0, 0, 1, 0)];
    const b = [seg(0, 0, 5, 10)];
    const result = diffMappings(a, b);

    expect(result.summary).toEqual({
      same: 0,
      changed: 1,
      removed: 0,
      added: 0,
    });
    expect(result.entries[0].status).toBe("changed");
    expect(result.entries[0].a).toEqual(a[0]);
    expect(result.entries[0].b).toEqual(b[0]);
  });

  it("detects removed mapping present in A but not B", () => {
    const a = [seg(0, 0, 1, 0), seg(0, 5, 2, 3)];
    const b = [seg(0, 0, 1, 0)];
    const result = diffMappings(a, b);

    expect(result.summary).toEqual({
      same: 1,
      changed: 0,
      removed: 1,
      added: 0,
    });
    const removed = result.entries.find((e) => e.status === "removed");
    expect(removed).toBeDefined();
    expect(removed!.a).toEqual(seg(0, 5, 2, 3));
    expect(removed!.b).toBeNull();
  });

  it("detects added mapping present in B but not A", () => {
    const a = [seg(0, 0, 1, 0)];
    const b = [seg(0, 0, 1, 0), seg(1, 0, 3, 0)];
    const result = diffMappings(a, b);

    expect(result.summary).toEqual({
      same: 1,
      changed: 0,
      removed: 0,
      added: 1,
    });
    const added = result.entries.find((e) => e.status === "added");
    expect(added).toBeDefined();
    expect(added!.a).toBeNull();
    expect(added!.b).toEqual(seg(1, 0, 3, 0));
  });

  it("handles empty inputs", () => {
    expect(diffMappings([], []).summary).toEqual({
      same: 0,
      changed: 0,
      removed: 0,
      added: 0,
    });
    expect(diffMappings([seg(0, 0, 1, 0)], []).summary).toEqual({
      same: 0,
      changed: 0,
      removed: 1,
      added: 0,
    });
    expect(diffMappings([], [seg(0, 0, 1, 0)]).summary).toEqual({
      same: 0,
      changed: 0,
      removed: 0,
      added: 1,
    });
  });

  it("handles mixed diff with same, changed, removed, and added", () => {
    const a = [
      seg(0, 0, 1, 0), // same in both
      seg(0, 5, 2, 3), // will change
      seg(1, 0, 3, 0), // removed (not in B)
    ];
    const b = [
      seg(0, 0, 1, 0), // same in both
      seg(0, 5, 9, 9), // changed original position
      seg(2, 0, 4, 0), // added (not in A)
    ];
    const result = diffMappings(a, b);

    expect(result.summary).toEqual({
      same: 1,
      changed: 1,
      removed: 1,
      added: 1,
    });
    expect(result.entries).toHaveLength(4);

    // Verify sort order: entries sorted by generated position
    expect(result.entries[0].status).toBe("same"); // 0:0
    expect(result.entries[1].status).toBe("changed"); // 0:5
    expect(result.entries[2].status).toBe("removed"); // 1:0
    expect(result.entries[3].status).toBe("added"); // 2:0
  });
});
