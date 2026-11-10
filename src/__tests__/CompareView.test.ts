import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { defineComponent } from "vue";
import { flushPromises, mount } from "@vue/test-utils";
import CompareView from "../pages/CompareView.vue";
import MappingDiffTable from "../components/MappingDiffTable.vue";
import { reproEntryA, reproEntryB, reproMapA } from "./fixtures/duplicateMappings";

vi.mock("../composables/useTheme", async () => {
  const { ref } = await import("vue");
  return { useTheme: () => ({ theme: ref("light"), toggleTheme: vi.fn() }) };
});

async function mountCompare(entryA = reproEntryA, entryB = reproEntryB) {
  const wrapper = mount(CompareView, {
    props: { entryA, entryB },
    global: { stubs: { CompareCodePane: true } },
  });
  await flushPromises();
  return wrapper;
}

function makeEntry(mappings: string, names: string[] = []) {
  return {
    ...reproEntryA,
    sourceMapJson: JSON.stringify({ ...reproMapA, mappings, names }),
  };
}

beforeEach(() => {
  window.history.replaceState(null, "", "/compare");
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
});
afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});

describe("CompareView raw mapping comparison", () => {
  it("restores table and matching settings without ever creating code panes", async () => {
    window.history.replaceState(null, "", "/compare?tab=table&ignore-source-name=0");
    const mountedPane = vi.fn();
    const wrapper = mount(CompareView, {
      props: { entryA: reproEntryA, entryB: reproEntryB },
      global: {
        stubs: { CompareCodePane: defineComponent({ setup: mountedPane, template: "<div />" }) },
      },
    });
    try {
      await flushPromises();
      expect(mountedPane).not.toHaveBeenCalled();
      expect(wrapper.findComponent(MappingDiffTable).props("ignoreSourceName")).toBe(false);
      expect(wrapper.find(".compare-table-view").isVisible()).toBe(true);
    } finally {
      wrapper.unmount();
    }
  });

  it("defaults to the table on phones and preserves an explicit code choice across reloads", async () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    let wrapper = await mountCompare();
    try {
      expect(wrapper.findAllComponents({ name: "CompareCodePane" })).toHaveLength(0);
      await wrapper
        .findAll("button")
        .find((button) => button.text() === "Code panes")!
        .trigger("click");
      expect(new URLSearchParams(window.location.search).get("tab")).toBe("code");
      expect(wrapper.findAllComponents({ name: "CompareCodePane" })).toHaveLength(2);
      wrapper.unmount();
      wrapper = await mountCompare();
      expect(wrapper.findAllComponents({ name: "CompareCodePane" })).toHaveLength(2);
    } finally {
      wrapper.unmount();
    }
  });

  it.each([true, false])(
    "reveals the selected comparison view on a narrow viewport: %s",
    async (narrow) => {
      vi.stubGlobal("matchMedia", () => ({ matches: narrow }));
      const wrapper = await mountCompare();
      try {
        const details = wrapper.findAll("button").find((button) => button.text() === "Details")!;
        for (const label of ["Diff table", "Code panes"]) {
          if (!wrapper.find(".compare-details").isVisible()) await details.trigger("click");
          expect(wrapper.find(".compare-details").isVisible()).toBe(true);
          await wrapper
            .findAll(".compare-view-tabs button")
            .find((button) => button.text() === label)!
            .trigger("click");
          expect(wrapper.find(".compare-workspace").classes().includes("show-details")).toBe(
            !narrow,
          );
          expect(wrapper.find(".compare-details").isVisible()).toBe(!narrow);
        }
      } finally {
        wrapper.unmount();
      }
    },
  );

  it("keeps anomaly notices visible when identical maps have no differences", async () => {
    const invalid = {
      ...reproEntryA,
      sourceMapJson: JSON.stringify({ ...reproMapA, mappings: "AAAD,AAAA" }),
    };
    const wrapper = await mountCompare(invalid, invalid);
    try {
      expect(wrapper.find(".workspace-footer").text()).toContain("0 mapping differences");
      const notices = wrapper.find(".compare-context");
      expect(notices.isVisible()).toBe(true);
      expect(notices.text()).toContain("4 issues");
      expect(notices.text()).toContain("2 duplicate positions");
      expect(wrapper.find(".compare-details").isVisible()).toBe(false);
      await notices.find("button").trigger("click");
      expect(wrapper.find(".compare-details").isVisible()).toBe(true);
    } finally {
      wrapper.unmount();
    }
  });
  it("opens the landing page through browser navigation", async () => {
    const location = { href: "/compare", search: "" };
    vi.stubGlobal(
      "window",
      new Proxy(window, {
        get(target, key) {
          return key === "location" ? location : Reflect.get(target, key, target);
        },
      }),
    );
    let wrapper: Awaited<ReturnType<typeof mountCompare>> | undefined;
    try {
      wrapper = await mountCompare();
      const open = wrapper.findAll("button").find((button) => button.text() === "Open")!;
      await open.trigger("click");
      expect(location.href).toBe("/");
    } finally {
      wrapper?.unmount();
      vi.unstubAllGlobals();
    }
  });

  it("shows the removed duplicate from the repro, accurate counts and all targets", async () => {
    const wrapper = await mountCompare();
    const table = wrapper.findComponent(MappingDiffTable);
    expect(table.props("summary")).toEqual({
      same: 7,
      shifted: 0,
      changed: 0,
      removed: 1,
      added: 0,
    });
    expect(wrapper.text()).toContain("8 raw mappings");
    expect(wrapper.text()).toContain("7 raw mappings");
    expect(wrapper.text()).not.toContain("No differences");
    const row = table.find(".space-y-1 .cursor-pointer");
    expect(row.text()).toContain("only in A");
    expect(row.text()).toContain("2:2");
    expect(row.text()).toContain("2:1");
    await row.trigger("click");
    expect(table.text()).toContain("Original (A) @ 2:2");
    expect(table.text()).toContain("original 2:9 and generated 2:1");

    const inspector = wrapper.find("details");
    expect(inspector.find("summary").text()).toMatch(/Duplicate generated positions\s+A: 1\s*B: 0/);
    expect(inspector.text()).toContain("input.ts:2:2");
    expect(inspector.text()).toContain("input.ts:2:9");
    expect(inspector.findAll("li")).toHaveLength(2);

    // Gutter markers reflect the raw removal; the code panes still receive
    // the original unmodified source map for their character ownership.
    const codeButton = wrapper
      .findAll("button")
      .find((button) => button.text().includes("Code panes"))!;
    await codeButton.trigger("click");
    const panes = wrapper.findAllComponents({ name: "CompareCodePane" });
    expect(panes[0].props("sourceMapJson")).toBe(reproEntryA.sourceMapJson);
    expect(wrapper.text()).toContain("1 line · 1 removed");
    expect(wrapper.find("details").exists()).toBe(true);
    wrapper.unmount();
  });

  it("flags duplicate positions even when the maps are identical and same rows are hidden", async () => {
    const wrapper = await mountCompare(reproEntryA, { ...reproEntryA, label: "identical.js" });
    expect(wrapper.findComponent(MappingDiffTable).props("summary").same).toBe(8);
    expect(wrapper.find("details summary").text()).toMatch(/A: 1\s*B: 1/);
    expect(wrapper.find("details").findAll("li")).toHaveLength(4);
    expect(
      wrapper.findComponent(MappingDiffTable).findAll(".space-y-1 .cursor-pointer"),
    ).toHaveLength(0);
    await wrapper.find('input[type="checkbox"]').setValue(false);
    expect(wrapper.findComponent(MappingDiffTable).props("summary").same).toBe(8);
    wrapper.unmount();
  });

  it("includes duplicate names in the target inspector and detects their removal", async () => {
    const wrapper = await mountCompare(
      makeEntry("AAAAA,AAAAC", ["public", "verify"]),
      makeEntry("AAAAA", ["verify"]),
    );
    const summary = wrapper.findComponent(MappingDiffTable).props("summary");
    expect(summary).toEqual({ same: 1, shifted: 0, changed: 0, removed: 1, added: 0 });
    expect(wrapper.find("details").text()).toContain("name: public");
    expect(wrapper.find("details").text()).toContain("name: verify");
    wrapper.unmount();
  });

  it("preserves identical tuple multiplicity and expands only the clicked occurrence", async () => {
    const wrapper = await mountCompare(makeEntry("AAAA,AAAA,AAAA"), makeEntry("AAAA"));
    const table = wrapper.findComponent(MappingDiffTable);
    expect(table.props("summary")).toEqual({
      same: 1,
      shifted: 0,
      changed: 0,
      removed: 2,
      added: 0,
    });
    expect(wrapper.find("details").findAll("li")).toHaveLength(3);
    const rows = table.findAll(".space-y-1 .cursor-pointer");
    expect(rows).toHaveLength(2);
    await rows[1].trigger("click");
    expect(table.findAll(".border-t-0")).toHaveLength(1);
    expect(rows[0].text()).toContain("▸");
    expect(rows[1].text()).toContain("▾");
    expect(table.text()).toContain("fewer occurrences of this raw mapping");
    expect(table.text()).not.toContain("compare hides it");
    wrapper.unmount();
  });

  it("keeps ordinary map comparison unchanged and omits the duplicate warning", async () => {
    const wrapper = await mountCompare(reproEntryB, { ...reproEntryB, label: "identical.js" });
    expect(wrapper.findComponent(MappingDiffTable).props("summary")).toEqual({
      same: 7,
      shifted: 0,
      changed: 0,
      removed: 0,
      added: 0,
    });
    expect(wrapper.find("details").exists()).toBe(false);
    expect(wrapper.text()).toContain("7 raw mappings");
    wrapper.unmount();
  });
});
