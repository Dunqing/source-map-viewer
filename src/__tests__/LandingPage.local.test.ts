import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { flushPromises, mount } from "@vue/test-utils";
import LandingPage from "../pages/LandingPage.vue";
import { getCachedSession } from "../composables/useSessionCollectionCache";
import { useSourceMapStore } from "../stores/sourceMap";

const SOURCE_MAP = JSON.stringify({
  version: 3,
  file: "output.js",
  sources: ["input.ts"],
  sourcesContent: ["export const input = 1;"],
  names: [],
  mappings: "AAAA",
});

function mountLandingPage() {
  return mount(LandingPage, {
    global: {
      stubs: {
        FileDropZone: true,
        ExamplePreview: true,
      },
    },
  });
}

describe("LandingPage local inspection", () => {
  const originalFetch = globalThis.fetch;

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
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("inspects pasted source maps without creating a remote share", async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as typeof fetch;
    const pushStateSpy = vi.spyOn(window.history, "pushState");
    const wrapper = mountLandingPage();

    const pasteButton = wrapper.findAll("button").find((button) => button.text() === "Paste");
    await pasteButton!.trigger("click");
    await wrapper.get("textarea").setValue(SOURCE_MAP);
    await wrapper.get("textarea").trigger("input");
    const visualizeButton = wrapper
      .findAll("button")
      .find((button) => button.text() === "Visualize");
    await visualizeButton!.trigger("click");
    await flushPromises();

    const store = useSourceMapStore();
    expect(store.parsedData?.sources).toEqual(["input.ts"]);
    expect(store.sessionSlug).toMatch(/^local-/);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(pushStateSpy).toHaveBeenCalledWith(null, "", `/${store.sessionSlug}`);
    expect(getCachedSession(store.sessionSlug)).toMatchObject({
      label: "Pasted code",
      entries: [{ sourceMapJson: SOURCE_MAP }],
    });
  });

  it("fetches URL input without posting the result to the share API", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(SOURCE_MAP),
    });
    globalThis.fetch = fetchMock as typeof fetch;
    const wrapper = mountLandingPage();

    const urlButton = wrapper.findAll("button").find((button) => button.text() === "URL");
    await urlButton!.trigger("click");
    await wrapper.get("input").setValue("https://cdn.example.com/output.js.map");
    const visualizeButton = wrapper
      .findAll("button")
      .find((button) => button.text() === "Fetch & Visualize");
    await visualizeButton!.trigger("click");
    await flushPromises();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("https://cdn.example.com/output.js.map");
    expect(fetchMock).not.toHaveBeenCalledWith("/api/share", expect.anything());
    expect(useSourceMapStore().parsedData?.sources).toEqual(["input.ts"]);
    expect(useSourceMapStore().sessionSlug).toMatch(/^local-/);
  });
});
