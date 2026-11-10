import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { flushPromises, mount } from "@vue/test-utils";
import { defineComponent } from "vue";
import VisualizationPage from "../pages/VisualizationPage.vue";
import PositionLookupPanel from "../components/PositionLookupPanel.vue";
import { useSourceMapStore } from "../stores/sourceMap";

const scrolled: { side: string; line: number; column: number }[] = [];
const CodePanelStub = defineComponent({
  props: ["code", "filename", "side", "focusPosition"],
  methods: {
    scrollToLine() {},
    scrollToLineIfNeeded() {},
    scrollToPosition(line: number, column: number) {
      scrolled.push({ side: this.side, line, column });
    },
  },
  template: '<div :data-side="side" />',
});
const EmptyStub = defineComponent({
  inheritAttrs: false,
  methods: { scrollToHovered() {} },
  template: "<div />",
});
const stubs = {
  CodePanel: CodePanelStub,
  StatusBar: EmptyStub,
  SourceTabs: EmptyStub,
  StatsPanel: EmptyStub,
  MappingsPanel: EmptyStub,
  MappingConnector: EmptyStub,
  AiDebugPanel: EmptyStub,
};

beforeEach(() => {
  scrolled.length = 0;
  window.history.replaceState(null, "", "/demo");
  localStorage.clear();
  sessionStorage.clear();
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }));
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
  const store = useSourceMapStore();
  store.reset();
  store.loadSourceMap(
    "abcdefghijklmno",
    JSON.stringify({
      version: 3,
      file: "app.min.js",
      sources: ["cart.ts"],
      sourcesContent: ["total();"],
      names: [],
      mappings: "AAAA,K,KAAA",
    }),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});

describe("viewer position lookup", () => {
  it("keeps lookup alongside code and lets shortcuts refocus an already open search", async () => {
    const wrapper = mount(VisualizationPage, { attachTo: document.body, global: { stubs } });
    try {
      await flushPromises();
      await wrapper.find("#position-lookup-toggle").trigger("click");
      const lookup = wrapper.findComponent(PositionLookupPanel);
      await lookup.find("input").setValue("1:0");
      await lookup.find("form").trigger("submit");
      await flushPromises();
      expect(lookup.element.closest("dialog")).toBeNull();
      expect(lookup.text()).toContain("Exact mapping point");
      const generated = wrapper
        .findAllComponents(CodePanelStub)
        .find((pane) => pane.props("side") === "generated")!;
      generated.vm.$emit("segmentClick", useSourceMapStore().mappingIndex[0]);
      await flushPromises();
      expect(useSourceMapStore().hoveredSegment).not.toBeNull();
      for (const key of ["f", "g", "f"]) {
        document.dispatchEvent(new KeyboardEvent("keydown", { key, ctrlKey: true, bubbles: true }));
        await flushPromises();
        expect(document.activeElement).toBe(
          wrapper.find(
            key === "g" ? "#position-lookup-panel input" : 'input[placeholder="Search..."]',
          ).element,
        );
      }
      const filesButton = wrapper.findAll("button").find((button) => button.text() === "Files")!;
      filesButton.element.focus();
      await filesButton.trigger("click");
      await flushPromises();
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "f", ctrlKey: true, bubbles: true }),
      );
      await flushPromises();
      expect(wrapper.find("dialog").attributes("open")).toBeUndefined();
      expect(document.activeElement).toBe(wrapper.find('input[placeholder="Search..."]').element);
    } finally {
      wrapper.unmount();
    }
  });

  it.each([true, false])(
    "reveals code for lookup and search on a narrow viewport: %s",
    async (narrow) => {
      vi.stubGlobal("matchMedia", () => ({
        matches: narrow,
        addEventListener() {},
        removeEventListener() {},
      }));
      const wrapper = mount(VisualizationPage, { global: { stubs } });
      try {
        await flushPromises();
        const details = wrapper.findAll("button").find((button) => button.text() === "Details")!;
        for (const key of ["g", "f"]) {
          if (!wrapper.find(".workspace-side-panel").exists()) await details.trigger("click");
          expect(wrapper.find(".workspace-side-panel").exists()).toBe(true);
          document.dispatchEvent(
            new KeyboardEvent("keydown", { key, ctrlKey: true, bubbles: true }),
          );
          await flushPromises();
          expect(wrapper.find(".workspace-panes").classes().includes("has-details")).toBe(!narrow);
        }
      } finally {
        wrapper.unmount();
      }
    },
  );

  it.each([true, false])(
    "uses file metadata and returns to the selected file on a narrow viewport: %s",
    async (narrow) => {
      vi.stubGlobal("matchMedia", () => ({
        matches: narrow,
        addEventListener() {},
        removeEventListener() {},
      }));
      const store = useSourceMapStore();
      const entry = {
        label: "Pasted code",
        entryPath: "Pasted code",
        generatedCode: "a{}",
        sourceMapJson: JSON.stringify({
          version: 3,
          file: "output.css",
          sources: ["a.scss", "b.scss"],
          sourcesContent: ["a{}", "b{}"],
          names: [],
          mappings: "AAAA",
        }),
      };
      store.loadSourceMapCollection([
        entry,
        { ...entry, label: "other.css", entryPath: "other.css", generatedPath: "dist/other.css" },
      ]);
      const wrapper = mount(VisualizationPage, {
        global: { stubs: { ...stubs, SourceTabs: false } },
      });
      try {
        await flushPromises();
        const generated = wrapper
          .findAllComponents(CodePanelStub)
          .find((pane) => pane.props("side") === "generated")!;
        expect(generated.props("filename")).toBe("output.css");
        const details = wrapper.findAll("button").find((button) => button.text() === "Details")!;
        await details.trigger("click");
        const filesButton = wrapper.findAll("button").find((button) => button.text() === "Files")!;
        await filesButton.trigger("click");
        await flushPromises();
        const files = wrapper.find("dialog");
        expect(files.text()).toContain("Source map path is not available.");
        expect(files.text()).not.toContain("Pasted code.map");
        await files.findAll(".file-list").at(-1)!.findAll("button")[1]!.trigger("click");
        await flushPromises();
        expect(store.activeSourceIndex).toBe(1);
        expect(files.attributes("open")).toBeUndefined();
        expect(wrapper.find(".workspace-panes").classes().includes("has-details")).toBe(!narrow);
        if (!wrapper.find(".workspace-side-panel").exists()) await details.trigger("click");
        await filesButton.trigger("click");
        await flushPromises();
        await files.find(".file-list").findAll("button")[1]!.trigger("click");
        await flushPromises();
        expect(store.activeGeneratedEntryIndex).toBe(1);
        expect(generated.props("filename")).toBe("dist/other.css");
        expect(files.attributes("open")).toBeUndefined();
        expect(wrapper.find(".workspace-panes").classes().includes("has-details")).toBe(!narrow);
      } finally {
        wrapper.unmount();
      }
    },
  );
  it("restores an unmapped requested position instead of the selected mapping", async () => {
    window.history.replaceState(null, "", "/demo?pos=generated%3A1%3A7&seg=0");
    const wrapper = mount(VisualizationPage, { global: { stubs } });
    await flushPromises();
    expect(wrapper.findComponent(PositionLookupPanel).text()).toContain("Unmapped position");
    expect(useSourceMapStore().hoveredSegment).toBeNull();
    expect(scrolled).toContainEqual({ side: "generated", line: 0, column: 7 });
    wrapper.unmount();
  });

  it("focuses converted stack coordinates and clears the previous target for a gap", async () => {
    const wrapper = mount(VisualizationPage, { global: { stubs } });
    await flushPromises();
    await wrapper.find('button[title="Find position (Ctrl/Cmd+G)"]').trigger("click");
    const lookup = wrapper.findComponent(PositionLookupPanel);
    await lookup.find("input").setValue("at calculateTotal (app.min.js:1:11)");
    await lookup.findAll("select").at(-1)!.setValue("1");
    await lookup.find("form").trigger("submit");
    await flushPromises();
    expect(useSourceMapStore().hoveredSegment?.generatedColumn).toBe(10);
    expect(scrolled).toContainEqual({ side: "generated", line: 0, column: 10 });
    expect(scrolled).toContainEqual({ side: "original", line: 0, column: 0 });

    await lookup.findAll("select").at(-1)!.setValue("0");
    await lookup.find("input").setValue("1:7");
    await lookup.find("form").trigger("submit");
    await flushPromises();
    expect(lookup.text()).toContain("Unmapped position");
    expect(useSourceMapStore().hoveredSegment).toBeNull();
    expect(scrolled.at(-1)).toEqual({ side: "generated", line: 0, column: 7 });
    wrapper.unmount();
  });

  it.each(["generated:1:1000000", "original:0:1:1000000"])(
    "does not pass out-of-bounds lookup %s to code pane markers",
    async (position) => {
      window.history.replaceState(null, "", `/demo?pos=${encodeURIComponent(position)}`);
      const wrapper = mount(VisualizationPage, { global: { stubs } });
      await flushPromises();
      expect(wrapper.findComponent(PositionLookupPanel).text()).toContain(
        "Position outside loaded code",
      );
      for (const pane of wrapper.findAllComponents(CodePanelStub)) {
        expect(pane.props("focusPosition")).toBeNull();
      }
      expect(scrolled).toEqual([]);
      wrapper.unmount();
    },
  );

  it("restores original one-to-many results and focuses a selected generated occurrence", async () => {
    window.history.replaceState(null, "", "/demo?pos=original%3A0%3A1%3A0&seg=1");
    const wrapper = mount(VisualizationPage, { global: { stubs } });
    await flushPromises();
    const lookup = wrapper.findComponent(PositionLookupPanel);
    expect(lookup.findAll("li button")).toHaveLength(2);
    expect(useSourceMapStore().hoveredSegment?.generatedColumn).toBe(10);
    expect(scrolled).toContainEqual({ side: "generated", line: 0, column: 10 });
    expect(scrolled).toContainEqual({ side: "original", line: 0, column: 0 });
    wrapper.unmount();
  });
});
