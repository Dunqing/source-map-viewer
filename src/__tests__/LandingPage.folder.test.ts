import { beforeEach, afterEach, describe, expect, it, vi } from "vite-plus/test";
import { flushPromises, mount } from "@vue/test-utils";
import LandingPage from "../pages/LandingPage.vue";
import { useSourceMapStore } from "../stores/sourceMap";

function createFile(name: string, content: string, relativePath: string): File {
  const file = new File([content], name, { type: "text/plain" });
  Object.defineProperty(file, "webkitRelativePath", {
    configurable: true,
    value: relativePath,
  });
  return file;
}

describe("LandingPage folder upload", () => {
  const originalFetch = globalThis.fetch;
  const originalCreateElement = document.createElement.bind(document);

  beforeEach(() => {
    localStorage.clear();
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

  it("opens a folder picker and loads folder-shaped files through the page flow", async () => {
    const createdInputs: HTMLInputElement[] = [];
    vi.spyOn(document, "createElement").mockImplementation(((tagName: string) => {
      const element = originalCreateElement(tagName);
      if (tagName === "input") {
        createdInputs.push(element as HTMLInputElement);
      }
      return element;
    }) as typeof document.createElement);

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: "folder-test" }),
    } satisfies Partial<Response>);
    const pushStateSpy = vi.spyOn(window.history, "pushState");
    const dispatchEventSpy = vi.spyOn(window, "dispatchEvent");

    const wrapper = mount(LandingPage, {
      global: {
        stubs: {
          FileDropZone: true,
          ExamplePreview: true,
        },
      },
    });

    const uploadButton = wrapper
      .findAll("button")
      .find((button) => button.text().includes("Upload"));
    expect(uploadButton).toBeTruthy();
    await uploadButton!.trigger("click");

    const folderButton = wrapper
      .findAll("button")
      .find((button) => button.text().includes("Folder"));
    expect(folderButton).toBeTruthy();
    await folderButton!.trigger("click");

    expect(createdInputs).toHaveLength(1);
    const input = createdInputs[0];
    expect(input.type).toBe("file");
    expect(input.multiple).toBe(true);
    expect(input.getAttribute("webkitdirectory")).not.toBeNull();

    const files = [
      createFile(
        "bundle.js",
        "console.log('folder');\n//# sourceMappingURL=/maps/app.js.map",
        "demo/js/bundle.js",
      ),
      createFile(
        "app.js.map",
        JSON.stringify({
          version: 3,
          file: "/js/bundle.js",
          sources: ["../src/input.ts"],
          names: [],
          mappings: "AAAA",
        }),
        "demo/maps/app.js.map",
      ),
      createFile("input.ts", "const input = 1;", "demo/src/input.ts"),
    ];

    Object.defineProperty(input, "files", {
      configurable: true,
      value: files,
    });

    input.onchange?.(new Event("change"));
    await flushPromises();

    const store = useSourceMapStore();
    expect(store.generatedCode).toContain("console.log('folder');");
    expect(store.parsedData?.sourcesContent).toEqual(["const input = 1;"]);
    expect(pushStateSpy).toHaveBeenCalledWith(null, "", "/folder-test");
    expect(dispatchEventSpy).toHaveBeenCalledWith(expect.any(CustomEvent));
  });

  it("loads multiple folder entrypoints into the store and navigates to the first bundle", async () => {
    const createdInputs: HTMLInputElement[] = [];
    vi.spyOn(document, "createElement").mockImplementation(((tagName: string) => {
      const element = originalCreateElement(tagName);
      if (tagName === "input") {
        createdInputs.push(element as HTMLInputElement);
      }
      return element;
    }) as typeof document.createElement);

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: "folder-multi-test" }),
    } satisfies Partial<Response>);
    const pushStateSpy = vi.spyOn(window.history, "pushState");
    const dispatchEventSpy = vi.spyOn(window, "dispatchEvent");

    const wrapper = mount(LandingPage, {
      global: {
        stubs: {
          FileDropZone: true,
          ExamplePreview: true,
        },
      },
    });

    const uploadButton = wrapper
      .findAll("button")
      .find((button) => button.text().includes("Upload"));
    expect(uploadButton).toBeTruthy();
    await uploadButton!.trigger("click");

    const folderButton = wrapper
      .findAll("button")
      .find((button) => button.text().includes("Folder"));
    expect(folderButton).toBeTruthy();
    await folderButton!.trigger("click");

    const input = createdInputs[0];
    Object.defineProperty(input, "files", {
      configurable: true,
      value: [
        createFile(
          "beta.js",
          "console.log('beta');\n//# sourceMappingURL=../maps/beta.js.map",
          "demo/js/beta.js",
        ),
        createFile(
          "beta.js.map",
          JSON.stringify({
            version: 3,
            file: "js/beta.js",
            sources: ["src/beta.ts"],
            sourcesContent: ["export const beta = true;"],
            names: [],
            mappings: "",
          }),
          "demo/maps/beta.js.map",
        ),
        createFile(
          "alpha.js",
          "console.log('alpha');\n//# sourceMappingURL=../maps/alpha.js.map",
          "demo/js/alpha.js",
        ),
        createFile(
          "alpha.js.map",
          JSON.stringify({
            version: 3,
            file: "js/alpha.js",
            sources: ["src/alpha.ts"],
            sourcesContent: ["export const alpha = true;"],
            names: [],
            mappings: "",
          }),
          "demo/maps/alpha.js.map",
        ),
      ],
    });

    input.onchange?.(new Event("change"));
    await flushPromises();

    const store = useSourceMapStore();
    expect(store.generatedCode).toContain("console.log('alpha');");
    expect(store.generatedEntryCount).toBe(2);
    expect(store.activeGeneratedEntryIndex).toBe(0);
    expect(store.generatedEntries.map((entry) => entry.entryPath)).toEqual([
      "js/alpha.js",
      "js/beta.js",
    ]);
    expect(store.sessionSlug).toBe("folder-multi-test");
    expect(store.sessionLabel).toBe("demo");
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(pushStateSpy).toHaveBeenCalledWith(null, "", "/folder-multi-test");
    expect(dispatchEventSpy).toHaveBeenCalledWith(expect.any(CustomEvent));
    expect(JSON.parse(localStorage.getItem("smv-history") ?? "[]")[0]).toMatchObject({
      label: "demo · js/alpha.js (2 entries)",
      slug: "folder-multi-test",
      sessionLabel: "demo",
    });
  });

  it("loads a multi-entry example into the store from the landing page", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: "example-multi-test" }),
    } satisfies Partial<Response>);
    const pushStateSpy = vi.spyOn(window.history, "pushState");
    const dispatchEventSpy = vi.spyOn(window, "dispatchEvent");

    const wrapper = mount(LandingPage, {
      global: {
        stubs: {
          FileDropZone: true,
          ExamplePreview: true,
        },
      },
    });

    await wrapper
      .get('[data-example-name="Multi-Entry Bundle"]')
      .get('[data-transformer="esbuild"]')
      .trigger("click");
    await flushPromises();

    const store = useSourceMapStore();
    expect(store.generatedCode).toContain("alphaMessage");
    expect(store.generatedEntryCount).toBe(2);
    expect(store.generatedEntries.map((entry) => entry.entryPath)).toEqual(["alpha.js", "beta.js"]);
    expect(store.sessionSlug).toBe("example-multi-test");
    expect(store.sessionLabel).toBe("Multi-Entry Bundle · esbuild");
    expect(pushStateSpy).toHaveBeenCalledWith(null, "", "/example-multi-test");
    expect(dispatchEventSpy).toHaveBeenCalledWith(expect.any(CustomEvent));
    expect(JSON.parse(localStorage.getItem("smv-history") ?? "[]")[0]).toMatchObject({
      label: "Multi-Entry Bundle · esbuild · alpha.js (2 entries)",
      slug: "example-multi-test",
      sessionLabel: "Multi-Entry Bundle · esbuild",
    });
  });

  it("loads the preferred default transformer when clicking an example card", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: "example-default-test" }),
    } satisfies Partial<Response>);
    const pushStateSpy = vi.spyOn(window.history, "pushState");
    const dispatchEventSpy = vi.spyOn(window, "dispatchEvent");

    const wrapper = mount(LandingPage, {
      global: {
        stubs: {
          FileDropZone: true,
          ExamplePreview: true,
        },
      },
    });

    const exampleCard = wrapper.get('[data-example-name="Multi-Entry Bundle"]');
    expect(exampleCard.attributes("data-default-transformer")).toBe("rolldown");

    await exampleCard.trigger("click");
    await flushPromises();

    const store = useSourceMapStore();
    expect(store.generatedCode).toContain("alphaMessage");
    expect(store.generatedEntryCount).toBe(2);
    expect(store.generatedEntries.map((entry) => entry.entryPath)).toEqual(["alpha.js", "beta.js"]);
    expect(store.sessionSlug).toBe("example-default-test");
    expect(store.sessionLabel).toBe("Multi-Entry Bundle · rolldown");
    expect(pushStateSpy).toHaveBeenCalledWith(null, "", "/example-default-test");
    expect(dispatchEventSpy).toHaveBeenCalledWith(expect.any(CustomEvent));
    expect(JSON.parse(localStorage.getItem("smv-history") ?? "[]")[0]).toMatchObject({
      label: "Multi-Entry Bundle · rolldown · alpha.js (2 entries)",
      slug: "example-default-test",
      sessionLabel: "Multi-Entry Bundle · rolldown",
    });
  });

  it("restores a cached folder session from recent history", async () => {
    sessionStorage.setItem(
      "smv-session-collection:folder-multi-test",
      JSON.stringify([
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
      ]),
    );
    localStorage.setItem(
      "smv-history",
      JSON.stringify([
        {
          label: "demo · js/beta.js (2 entries)",
          slug: "folder-multi-test?entry=1",
          timestamp: 1000,
          sessionLabel: "demo",
        },
      ]),
    );

    const pushStateSpy = vi.spyOn(window.history, "pushState");
    const dispatchEventSpy = vi.spyOn(window, "dispatchEvent");

    const wrapper = mount(LandingPage, {
      global: {
        stubs: {
          FileDropZone: true,
          ExamplePreview: true,
        },
      },
    });

    await flushPromises();

    const historyButton = wrapper
      .findAll("button")
      .find((button) => button.text().includes("beta.js"));
    expect(historyButton).toBeTruthy();
    await historyButton!.trigger("click");

    const store = useSourceMapStore();
    expect(store.generatedEntryCount).toBe(2);
    expect(store.activeGeneratedEntryIndex).toBe(1);
    expect(store.generatedCode).toContain("console.log('beta');");
    expect(store.sessionSlug).toBe("folder-multi-test");
    expect(store.sessionLabel).toBe("demo");
    expect(pushStateSpy).toHaveBeenCalledWith(null, "", "/folder-multi-test?entry=1");
    expect(dispatchEventSpy).toHaveBeenCalledWith(expect.any(CustomEvent));
  });
});
