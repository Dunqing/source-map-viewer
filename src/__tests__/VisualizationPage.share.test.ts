import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { flushPromises, mount } from "@vue/test-utils";
import { defineComponent } from "vue";
import VisualizationPage from "../pages/VisualizationPage.vue";
import { useSourceMapStore } from "../stores/sourceMap";

vi.mock("../composables/useHighlighter", () => ({
  useHighlighter: () => ({ init: vi.fn().mockResolvedValue(undefined), loading: false }),
}));

const EmptyStub = defineComponent({
  inheritAttrs: false,
  methods: { scrollToHovered() {} },
  template: "<div />",
});
const stubs = {
  StatusBar: EmptyStub,
  SourceTabs: EmptyStub,
  StatsPanel: EmptyStub,
  MappingsPanel: EmptyStub,
  SearchBar: EmptyStub,
  MappingConnector: EmptyStub,
  AiDebugPanel: EmptyStub,
  CodePanel: defineComponent({
    inheritAttrs: false,
    props: ["code", "filename", "side"],
    methods: {
      scrollToLine() {},
      scrollToLineIfNeeded() {},
      scrollToPosition() {},
    },
    template: "<div />",
  }),
};

const DATA = {
  generatedCode: "console.log('share');",
  sourceMapJson: JSON.stringify({
    version: 3,
    sources: ["input.ts"],
    sourcesContent: ["console.log('input');"],
    names: [],
    mappings: "AAAA",
  }),
};

describe("VisualizationPage explicit sharing", () => {
  const originalFetch = globalThis.fetch;
  const originalClipboard = navigator.clipboard;

  beforeEach(() => {
    window.history.replaceState(null, "", "/local-test?stats=1&seg=0");
    localStorage.clear();
    sessionStorage.clear();
    useSourceMapStore().reset();
    useSourceMapStore().loadSourceMapCollection(
      [{ ...DATA, label: "output.js", entryPath: "output.js" }],
      0,
      "local-test",
      "Pasted code",
    );
    vi.restoreAllMocks();
    vi.stubGlobal("matchMedia", () => ({
      matches: false,
      addEventListener() {},
      removeEventListener() {},
    }));
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: originalClipboard,
    });
    window.history.replaceState(null, "", "/");
  });

  it("posts to the share API only after Share is clicked", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: "abc12345", url: "https://viewer.test/abc12345" }),
    });
    globalThis.fetch = fetchMock as typeof fetch;
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    const replaceStateSpy = vi.spyOn(window.history, "replaceState");
    const wrapper = mount(VisualizationPage, { global: { stubs } });
    await flushPromises();

    expect(fetchMock).not.toHaveBeenCalled();
    const shareButton = wrapper.findAll("button").find((button) => button.text() === "Share");
    expect(shareButton).toBeDefined();
    await shareButton!.trigger("click");
    await flushPromises();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, request] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/share");
    expect(request).toMatchObject({ method: "POST" });
    expect(JSON.parse(request.body)).toEqual(DATA);
    expect(writeText).toHaveBeenCalledWith("https://viewer.test/abc12345?stats=1&seg=0");
    expect(replaceStateSpy).toHaveBeenCalledWith(null, "", "/abc12345?stats=1&seg=0");
    expect(wrapper.text()).toContain("Short URL copied to clipboard");
    wrapper.unmount();
  });
});
