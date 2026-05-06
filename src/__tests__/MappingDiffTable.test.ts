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
    ignoreSourceName: boolean;
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
      ignoreSourceName: false,
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

  it("renders the Ignore source filename checkbox bound to ignoreSourceName prop", () => {
    const wrapper = mountTable([], {
      summary: { same: 0, changed: 0, removed: 0, added: 0 },
      ignoreSourceName: true,
    });

    const checkboxes = wrapper.findAll("input[type='checkbox']");
    const ignoreCheckbox = checkboxes.find((c) =>
      c.element.parentElement?.textContent?.includes("Ignore source filename"),
    );
    expect(ignoreCheckbox).toBeDefined();
    expect((ignoreCheckbox!.element as HTMLInputElement).checked).toBe(true);
  });

  it("emits update:ignoreSourceName when the checkbox is toggled", async () => {
    const wrapper = mountTable([], {
      summary: { same: 0, changed: 0, removed: 0, added: 0 },
      ignoreSourceName: false,
    });

    const checkboxes = wrapper.findAll("input[type='checkbox']");
    const ignoreCheckbox = checkboxes.find((c) =>
      c.element.parentElement?.textContent?.includes("Ignore source filename"),
    );
    expect(ignoreCheckbox).toBeDefined();

    await ignoreCheckbox!.setValue(true);

    expect(wrapper.emitted("update:ignoreSourceName")).toBeTruthy();
    expect(wrapper.emitted("update:ignoreSourceName")![0]).toEqual([true]);
  });

  it("renders a single row and a rename chip when only the source filename differs", () => {
    const entry: DiffEntry = {
      status: "changed",
      a: seg(0, 0, 0, 0),
      b: seg(0, 0, 0, 0),
    };

    const wrapper = mountTable([entry], {
      summary: { same: 0, changed: 1, removed: 0, added: 0 },
      sourcesA: ["before.js"],
      sourcesB: ["after.js"],
      origLinesA: [["const value = 1;"]],
      origLinesB: [["const value = 1;"]],
    });

    const rowText = wrapper.text();
    expect(rowText).toContain("before.js → after.js");

    const rowHtml = wrapper.find(".space-y-1 .cursor-pointer").html();
    // No strikethrough A line should be rendered for case B.
    expect(rowHtml).not.toMatch(/line-through/);
  });

  it("prefixes the source filename in dual A/B rows when filename and position both differ", () => {
    const entry: DiffEntry = {
      status: "changed",
      a: seg(0, 0, 0, 0),
      b: seg(0, 0, 5, 10),
    };

    const wrapper = mountTable([entry], {
      summary: { same: 0, changed: 1, removed: 0, added: 0 },
      sourcesA: ["before.js"],
      sourcesB: ["after.js"],
      origLinesA: [["const value = 1;"]],
      origLinesB: [["// 1", "// 2", "// 3", "// 4", "// 5", "          let other = 2;"]],
    });

    const dualRow = wrapper.find(".space-y-1 .cursor-pointer");
    const rowHtml = dualRow.html();

    const sourcePrefixes = dualRow.findAll("span.text-fg-muted.text-\\[10px\\]");
    expect(sourcePrefixes).toHaveLength(2);
    expect(sourcePrefixes[0].text()).toBe("before.js");
    expect(sourcePrefixes[1].text()).toBe("after.js");
    // Must be the dual A/B strikethrough view, not the case-B chip.
    expect(rowHtml).toMatch(/line-through/);
    expect(rowHtml).not.toContain("bg-amber-500/10");
  });

  it("does not prefix the source filename when sources match", () => {
    const entry: DiffEntry = {
      status: "changed",
      a: seg(0, 0, 0, 0),
      b: seg(0, 0, 1, 4),
    };

    const wrapper = mountTable([entry], {
      summary: { same: 0, changed: 1, removed: 0, added: 0 },
      sourcesA: ["input.ts"],
      sourcesB: ["input.ts"],
      origLinesA: [["const value = 1;", "    let other = 2;"]],
      origLinesB: [["const value = 1;", "    let other = 2;"]],
    });

    const rowHtml = wrapper.find(".space-y-1 .cursor-pointer").html();
    expect(rowHtml).not.toContain("input.ts");
    expect(rowHtml).toMatch(/line-through/);
  });

  it("explains the empty state when ignoreSourceName re-classifies all entries as same", () => {
    const wrapper = mountTable([], {
      summary: { same: 5, changed: 0, removed: 0, added: 0 },
      ignoreSourceName: true,
    });

    expect(wrapper.text()).toContain("No differences found after ignoring source filenames");
    expect(wrapper.text()).not.toContain("Source maps are identical");
  });

  it("uses the default empty-state copy when no entries exist and ignoreSourceName is off", () => {
    const wrapper = mountTable([], {
      summary: { same: 0, changed: 0, removed: 0, added: 0 },
      ignoreSourceName: false,
    });

    expect(wrapper.text()).toContain("No differences found. Source maps are identical");
  });
});
