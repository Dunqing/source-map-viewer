import { beforeEach, describe, expect, it } from "vite-plus/test";
import { flushPromises, mount } from "@vue/test-utils";
import PositionLookupPanel from "../components/PositionLookupPanel.vue";
import { useSourceMapStore } from "../stores/sourceMap";
import type { PositionQuery } from "../core/positionLookup";

function panel(query: PositionQuery | null = null) {
  return mount(PositionLookupPanel, { props: { query, selectedSegment: null } });
}

beforeEach(() => {
  const store = useSourceMapStore();
  store.reset();
  store.loadSourceMap(
    "abcdefghijklmno",
    JSON.stringify({
      version: 3,
      file: "app.min.js",
      sources: ["src/cart.ts", "src/other.ts"],
      sourcesContent: ["total();", "other();"],
      names: [],
      mappings: "AAAA,K,KAAA",
    }),
  );
});

describe("PositionLookupPanel", () => {
  it("converts a pasted stack frame using the selected column format", async () => {
    const wrapper = panel();
    await wrapper.find("input").setValue("at calculateTotal (https://example.com/app.min.js:1:11)");
    await wrapper.findAll("select").at(-1)!.setValue("1");
    await wrapper.find("form").trigger("submit");
    expect(wrapper.emitted("lookup")?.[0]).toEqual([
      { side: "generated", line: 0, column: 10, sourceIndex: 0 },
    ]);
    wrapper.unmount();
  });

  it("keeps the selected column format for repeated stack frames", async () => {
    const wrapper = panel();
    const frame = "at calculateTotal (app.min.js:1:11)";
    await wrapper.find("input").setValue(frame);
    await wrapper.findAll("select").at(-1)!.setValue("1");
    await wrapper.find("form").trigger("submit");
    const query = wrapper.emitted("lookup")![0][0] as PositionQuery;
    await wrapper.setProps({ query });
    expect((wrapper.find("input").element as HTMLInputElement).value).toBe(frame);
    expect((wrapper.findAll("select").at(-1)!.element as HTMLSelectElement).value).toBe("1");
    await wrapper.find("input").setValue("at calculateTotal (app.min.js:1:1)");
    await wrapper.find("form").trigger("submit");
    expect(wrapper.emitted("lookup")?.[1]).toEqual([
      { side: "generated", line: 0, column: 0, sourceIndex: 0 },
    ]);
    wrapper.unmount();
  });

  it("rejects frames for a different generated file instead of mapping their coordinates", async () => {
    const wrapper = panel();
    await wrapper.find("input").setValue("at calculateTotal (other.js:1:11)");
    await wrapper.find("form").trigger("submit");
    expect(wrapper.find('[role="alert"]').text()).toContain("This frame is for other.js");
    expect(wrapper.emitted("lookup")).toBeUndefined();
    wrapper.unmount();
  });

  it("shows explicit gaps without inventing an original location", async () => {
    const wrapper = panel({ side: "generated", line: 0, column: 7, sourceIndex: 0 });
    await flushPromises();
    expect(wrapper.find("[data-lookup-kind]").text()).toBe("Unmapped position");
    expect(wrapper.text()).toContain("unmapped gap");
    expect(wrapper.find("ul").exists()).toBe(false);
    wrapper.unmount();
  });

  it("distinguishes range lookups from exact mapping points", async () => {
    const wrapper = panel({ side: "generated", line: 0, column: 3, sourceIndex: 0 });
    expect(wrapper.find("[data-lookup-kind]").text()).toBe("Inside a mapped range");
    expect(wrapper.text()).toContain("character offsets are not interpolated");
    await wrapper.setProps({ query: { side: "generated", line: 0, column: 10, sourceIndex: 0 } });
    expect(wrapper.find("[data-lookup-kind]").text()).toBe("Exact mapping point");
    wrapper.unmount();
  });

  it("lists every generated match for an original point and lets the user select one", async () => {
    const store = useSourceMapStore();
    const wrapper = panel({ side: "original", line: 0, column: 0, sourceIndex: 0 });
    const results = wrapper.findAll("li button");
    expect(results).toHaveLength(2);
    expect(results[0].text()).toContain("app.min.js 1:0");
    expect(results[1].text()).toContain("app.min.js 1:10");
    await results[1].trigger("click");
    expect(wrapper.emitted("select")?.[0]).toEqual([store.mappingIndex[1]]);
    wrapper.unmount();
  });

  it("selects the matching original source from a filename", async () => {
    const wrapper = panel();
    await wrapper.findAll("select")[0].setValue("original");
    await wrapper.find("input").setValue("other.ts:1:0");
    await wrapper.find("form").trigger("submit");
    expect(wrapper.emitted("lookup")?.[0]).toEqual([
      { side: "original", line: 0, column: 0, sourceIndex: 1 },
    ]);
    wrapper.unmount();
  });

  it("shows bounds errors and input errors distinctly", async () => {
    const wrapper = panel({ side: "generated", line: 0, column: 99, sourceIndex: 0 });
    expect(wrapper.find("[data-lookup-kind]").text()).toBe("Position outside loaded code");
    await wrapper.find("input").setValue("not a position");
    await wrapper.find("form").trigger("submit");
    expect(wrapper.find('[role="alert"]').text()).toContain("Enter a single");
    expect(wrapper.emitted("lookup")).toBeUndefined();
    wrapper.unmount();
  });
});
