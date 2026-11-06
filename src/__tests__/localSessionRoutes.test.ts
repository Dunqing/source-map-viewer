import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { flushPromises, mount } from "@vue/test-utils";
import { defineComponent } from "vue";
import IndexPage from "../../pages/index.vue";
import { cacheSessionCollection } from "../composables/useSessionCollectionCache";
import { useSourceMapStore } from "../stores/sourceMap";

vi.mock("../composables/useHighlighter", () => ({
  scheduleCommonHighlighterPrewarm: () => () => {},
}));

const VisualizationStub = defineComponent({
  template: '<div data-testid="visualization" />',
});
const LandingStub = defineComponent({
  template: '<div data-testid="landing" />',
});
const stubs = {
  VisualizationPage: VisualizationStub,
  LandingPage: LandingStub,
};

const GENERATED_CODE = "console.log('local');";
const SOURCE_MAP = JSON.stringify({
  version: 3,
  file: "output.js",
  sources: ["input.ts"],
  sourcesContent: ["console.log('input');"],
  names: [],
  mappings: "AAAA",
});

describe("viewer route local sessions", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    window.history.replaceState(null, "", "/");
    localStorage.clear();
    sessionStorage.clear();
    useSourceMapStore().reset();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    window.history.replaceState(null, "", "/");
  });

  it("restores a local session after reload without resolving a remote share", async () => {
    cacheSessionCollection(
      "local-reload",
      [
        {
          generatedCode: GENERATED_CODE,
          sourceMapJson: SOURCE_MAP,
          label: "output.js",
          entryPath: "output.js",
        },
      ],
      "Pasted code",
    );
    window.history.replaceState(null, "", "/local-reload");
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as typeof fetch;

    const wrapper = mount(IndexPage, { global: { stubs } });
    await flushPromises();

    const store = useSourceMapStore();
    expect(store.generatedCode).toBe(GENERATED_CODE);
    expect(store.sessionSlug).toBe("local-reload");
    expect(store.sessionLabel).toBe("Pasted code");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(wrapper.find('[data-testid="visualization"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it("continues to open existing short share links", async () => {
    window.history.replaceState(null, "", "/abc12345");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ generatedCode: GENERATED_CODE, sourceMapJson: SOURCE_MAP }),
    });
    globalThis.fetch = fetchMock as typeof fetch;

    const wrapper = mount(IndexPage, { global: { stubs } });
    await flushPromises();

    expect(fetchMock).toHaveBeenCalledWith("/api/share/abc12345");
    expect(useSourceMapStore().generatedCode).toBe(GENERATED_CODE);
    expect(wrapper.find('[data-testid="visualization"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it("does not turn an unavailable local session into a remote lookup", async () => {
    window.history.replaceState(null, "", "/local-closed-tab");
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as typeof fetch;

    const wrapper = mount(IndexPage, { global: { stubs } });
    await flushPromises();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(useSourceMapStore().parsedData).toBeNull();
    expect(wrapper.find('[data-testid="landing"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it("ignores a stale remote response after navigating to a local session", async () => {
    let resolveFetch!: (response: Partial<Response>) => void;
    const fetchMock = vi.fn().mockReturnValue(
      new Promise<Partial<Response>>((resolve) => {
        resolveFetch = resolve;
      }),
    );
    globalThis.fetch = fetchMock as typeof fetch;
    window.history.replaceState(null, "", "/abc12345");
    const wrapper = mount(IndexPage, { global: { stubs } });

    cacheSessionCollection("local-newer", [
      {
        generatedCode: GENERATED_CODE,
        sourceMapJson: SOURCE_MAP,
        label: "output.js",
        entryPath: "output.js",
      },
    ]);
    window.history.pushState(null, "", "/local-newer");
    window.dispatchEvent(new Event("popstate"));
    await flushPromises();
    expect(useSourceMapStore().sessionSlug).toBe("local-newer");

    resolveFetch({
      ok: true,
      json: () =>
        Promise.resolve({ generatedCode: "stale remote code", sourceMapJson: SOURCE_MAP }),
    });
    await flushPromises();

    expect(useSourceMapStore().generatedCode).toBe(GENERATED_CODE);
    expect(useSourceMapStore().sessionSlug).toBe("local-newer");
    wrapper.unmount();
  });

  it("clears a previous visualization when a remote slug cannot be resolved", async () => {
    const store = useSourceMapStore();
    store.loadSourceMap(GENERATED_CODE, SOURCE_MAP);
    window.history.replaceState(null, "", "/missing-share");
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false }) as typeof fetch;

    const wrapper = mount(IndexPage, { global: { stubs } });
    await flushPromises();

    expect(store.parsedData).toBeNull();
    expect(wrapper.find('[data-testid="landing"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="visualization"]').exists()).toBe(false);
    wrapper.unmount();
  });
});
