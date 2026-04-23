import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { mount } from "@vue/test-utils";
import { nextTick } from "vue";

vi.mock("../core/diff", async () => {
  const actual = await vi.importActual<typeof import("../core/diff")>("../core/diff");
  return {
    ...actual,
    findExactMappingInSameSource: vi.fn(actual.findExactMappingInSameSource),
    findNearestMappingInSameSource: vi.fn(actual.findNearestMappingInSameSource),
  };
});

import * as diffModule from "../core/diff";
import MappingDiffTable from "../components/MappingDiffTable.vue";
import type { DiffEntry } from "../core/diff";
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

function mountTable(
  entries: DiffEntry[],
  overrides: Partial<{
    summary: { same: number; changed: number; removed: number; added: number };
    sourcesA: string[];
    sourcesB: string[];
    genLinesA: string[];
    genLinesB: string[];
    origLinesA: string[][];
    origLinesB: string[][];
    rawMappingsA: MappingSegment[];
    rawMappingsB: MappingSegment[];
  }> = {},
) {
  return mount(MappingDiffTable, {
    props: {
      entries,
      summary: { same: 0, changed: 0, removed: 0, added: 0 },
      sourcesA: ["input.ts"],
      sourcesB: ["input.ts"],
      genLinesA: ["const value = 1;"],
      genLinesB: ["const value = 1;"],
      origLinesA: [["const value = 1;"]],
      origLinesB: [["const value = 1;"]],
      rawMappingsA: [],
      rawMappingsB: [],
      ...overrides,
    },
  });
}

describe("MappingDiffTable", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("treats normalized-equivalent source names as the same original target in the UI", () => {
    const entry: DiffEntry = {
      status: "changed",
      a: seg(0, 0, 0, 0),
      b: seg(0, 6, 0, 0),
    };

    const wrapper = mountTable([entry], {
      summary: { same: 0, changed: 1, removed: 0, added: 0 },
      sourcesA: ["./input.ts"],
      sourcesB: ["input.ts"],
    });

    expect(wrapper.text()).toContain("(same original target)");
    expect(wrapper.text()).not.toContain("./input.ts");
  });

  it("does not compute counterpart lookups until a disappeared entry is expanded", async () => {
    const removed: DiffEntry = {
      status: "removed",
      a: seg(0, 0, 0, 0),
      b: null,
    };

    const wrapper = mountTable([removed], {
      summary: { same: 0, changed: 0, removed: 1, added: 0 },
      rawMappingsA: [removed.a!],
      rawMappingsB: [seg(0, 2, 0, 0)],
    });

    expect(diffModule.findExactMappingInSameSource).not.toHaveBeenCalled();
    expect(diffModule.findNearestMappingInSameSource).not.toHaveBeenCalled();

    await wrapper.find(".space-y-1 .cursor-pointer").trigger("click");
    await nextTick();

    expect(diffModule.findExactMappingInSameSource).toHaveBeenCalledTimes(1);
    expect(diffModule.findNearestMappingInSameSource).toHaveBeenCalledTimes(1);
  });
});
