import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { flushPromises, mount } from "@vue/test-utils";
import { defineComponent } from "vue";
import VisualizationPage from "../pages/VisualizationPage.vue";
import { useSourceMapStore } from "../stores/sourceMap";

vi.mock("../composables/useHighlighter", () => ({
  useHighlighter() {
    return {
      init: vi.fn().mockResolvedValue(undefined),
      loading: false,
    };
  },
}));

const CodePanelStub = defineComponent({
  props: {
    code: { type: String, required: true },
    filename: { type: String, required: true },
    side: { type: String, required: true },
  },
  methods: {
    scrollToLine() {},
    scrollToLineIfNeeded() {},
  },
  template: '<div :data-side="side">{{ filename }}</div>',
});

const EmptyStub = defineComponent({
  template: "<div />",
});

const MappingConnectorStub = defineComponent({
  props: {
    originalPanel: { type: Object, required: false },
    generatedPanel: { type: Object, required: false },
  },
  template: "<div />",
});

const MappingsPanelStub = defineComponent({
  methods: {
    scrollToHovered() {},
  },
  template: "<div />",
});

describe("VisualizationPage history", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    useSourceMapStore().reset();
    vi.restoreAllMocks();
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    );
    vi.stubGlobal(
      "requestAnimationFrame",
      vi.fn((callback: FrameRequestCallback) => {
        callback(0);
        return 1;
      }),
    );
  });

  it("updates the recent history entry when switching folder entrypoints", async () => {
    localStorage.setItem(
      "smv-history",
      JSON.stringify([
        {
          label: "demo · js/alpha.js (2 entries)",
          slug: "folder-multi-test",
          timestamp: 1000,
          sessionLabel: "demo",
        },
      ]),
    );

    const store = useSourceMapStore();
    store.loadSourceMapCollection(
      [
        {
          generatedCode: "console.log('alpha');",
          sourceMapJson: JSON.stringify({
            version: 3,
            file: "js/alpha.js",
            sources: ["src/alpha.ts"],
            sourcesContent: ["export const alpha = true;"],
            names: [],
            mappings: "",
          }),
          label: "alpha.js",
          entryPath: "js/alpha.js",
          generatedPath: "js/alpha.js",
          sourceMapPath: "maps/alpha.js.map",
        },
        {
          generatedCode: "console.log('beta');",
          sourceMapJson: JSON.stringify({
            version: 3,
            file: "js/beta.js",
            sources: ["src/beta.ts"],
            sourcesContent: ["export const beta = true;"],
            names: [],
            mappings: "",
          }),
          label: "beta.js",
          entryPath: "js/beta.js",
          generatedPath: "js/beta.js",
          sourceMapPath: "maps/beta.js.map",
        },
      ],
      0,
      "folder-multi-test",
      "demo",
    );

    const wrapper = mount(VisualizationPage, {
      global: {
        stubs: {
          Toolbar: EmptyStub,
          StatusBar: EmptyStub,
          SourceTabs: EmptyStub,
          StatsPanel: EmptyStub,
          MappingsPanel: MappingsPanelStub,
          SearchBar: EmptyStub,
          MappingConnector: MappingConnectorStub,
          AiDebugPanel: EmptyStub,
          CodePanel: CodePanelStub,
        },
      },
    });

    await flushPromises();

    const betaButton = wrapper
      .findAll("button")
      .find((button) => button.text().includes("js/beta.js"));
    expect(betaButton).toBeTruthy();
    await betaButton!.trigger("click");
    await flushPromises();

    const stored = JSON.parse(localStorage.getItem("smv-history") ?? "[]");
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({
      label: "demo · js/beta.js (2 entries)",
      slug: "folder-multi-test?entry=1",
      sessionLabel: "demo",
    });
  });

  it("restores seg after switching to the requested entry", async () => {
    window.history.replaceState(null, "", "/demo?entry=1&seg=0");

    const store = useSourceMapStore();
    store.loadSourceMapCollection(
      [
        {
          generatedCode: "console.log('alpha');",
          sourceMapJson: JSON.stringify({
            version: 3,
            file: "js/alpha.js",
            sources: ["src/alpha.ts"],
            sourcesContent: ["export const alpha = true;"],
            names: [],
            mappings: "",
          }),
          label: "alpha.js",
          entryPath: "js/alpha.js",
          generatedPath: "js/alpha.js",
          sourceMapPath: "maps/alpha.js.map",
        },
        {
          generatedCode: "console.log('beta');",
          sourceMapJson: JSON.stringify({
            version: 3,
            file: "js/beta.js",
            sources: ["src/beta.ts"],
            sourcesContent: ["export const beta = true;"],
            names: [],
            mappings: "AAAA",
          }),
          label: "beta.js",
          entryPath: "js/beta.js",
          generatedPath: "js/beta.js",
          sourceMapPath: "maps/beta.js.map",
        },
      ],
      0,
      "folder-multi-test",
      "demo",
    );

    mount(VisualizationPage, {
      global: {
        stubs: {
          Toolbar: EmptyStub,
          StatusBar: EmptyStub,
          SourceTabs: EmptyStub,
          StatsPanel: EmptyStub,
          MappingsPanel: MappingsPanelStub,
          SearchBar: EmptyStub,
          MappingConnector: MappingConnectorStub,
          AiDebugPanel: EmptyStub,
          CodePanel: CodePanelStub,
        },
      },
    });

    await flushPromises();

    expect(store.activeGeneratedEntryIndex).toBe(1);
    expect(store.hoveredSegment).not.toBeNull();
    expect(store.hoveredSegment).toMatchObject({
      generatedLine: 0,
      sourceIndex: 0,
    });
  });
});
