import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import CodePanel from "../components/CodePanel.vue";
import { getSharedHighlighter } from "../composables/useHighlighter";
import { useSourceMapStore } from "../stores/sourceMap";

class ResizeObserverMock {
  observe() {}
  disconnect() {}
}

describe("CodePanel", () => {
  beforeEach(() => {
    const store = useSourceMapStore();
    store.reset();

    vi.stubGlobal("ResizeObserver", ResizeObserverMock);
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    );
  });

  it("renders explicit whitespace classes while preserving the underlying whitespace nodes", async () => {
    await getSharedHighlighter({ langs: ["javascript"], themes: ["github-light"] });
    const wrapper = mount(CodePanel, {
      props: {
        code: "a  \tb",
        filename: "example.js",
        side: "generated",
      },
    });

    await nextTick();

    expect(wrapper.findAll(".explicit-space")).toHaveLength(2);
    expect(wrapper.findAll(".explicit-tab")).toHaveLength(1);
    expect(wrapper.findAll(".explicit-space").map((node) => node.element.textContent)).toEqual([
      " ",
      " ",
    ]);
    expect(wrapper.findAll(".explicit-tab").map((node) => node.element.textContent)).toEqual([
      "\t",
    ]);
  });

  it("leaves explicit unmapped gaps and trailing code without a mapping highlight", async () => {
    await getSharedHighlighter({ langs: ["javascript"], themes: ["github-light"] });
    const store = useSourceMapStore();
    store.loadSourceMap(
      "abcdefghijklmno",
      JSON.stringify({
        version: 3,
        sources: ["input.js"],
        sourcesContent: ["abcdefghijklmno"],
        names: [],
        mappings: "AAAA,K,KAAA,G",
      }),
    );
    const wrapper = mount(CodePanel, {
      props: { code: store.generatedCode, filename: "example.js", side: "generated" },
    });
    await nextTick();

    expect(wrapper.findAll("[data-code-span]").map((node) => node.element.textContent)).toEqual([
      "abcde",
      "fghij",
      "klm",
      "no",
    ]);
    expect(wrapper.findAll(".unmapped-generated").map((node) => node.element.textContent)).toEqual([
      "fghij",
      "no",
    ]);
    wrapper.unmount();
  });

  it("remeasures connector anchors when the workspace resizes a code pane", async () => {
    let notifyResize!: (entries: { contentRect: { height: number } }[]) => void;
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(callback: typeof notifyResize) {
          notifyResize = callback;
        }
        observe() {}
        disconnect() {}
      },
    );
    await getSharedHighlighter({ langs: ["javascript"], themes: ["github-light"] });
    const wrapper = mount(CodePanel, {
      props: { code: "ab", filename: "example.js", side: "generated" },
    });
    await nextTick();
    let left = 100;
    let top = 80;
    wrapper.get('[data-line="0"]').element.getBoundingClientRect = () =>
      ({ top, bottom: top + 20, height: 20 }) as DOMRect;
    const range = vi.spyOn(document, "createRange").mockReturnValue({
      setStart() {},
      setEnd() {},
      getBoundingClientRect: () => ({ left }) as DOMRect,
    } as unknown as Range);
    try {
      expect(wrapper.vm.getViewportPosition(0, 0)).toMatchObject({ x: 100, top: 80 });
      left = 60;
      top = 120;
      notifyResize([{ contentRect: { height: 600 } }]);
      expect(wrapper.vm.getViewportPosition(0, 0)).toMatchObject({ x: 60, top: 120 });
    } finally {
      range.mockRestore();
      wrapper.unmount();
    }
  });

  it("keeps single-character mappings hoverable near their rendered span", async () => {
    await getSharedHighlighter({ langs: ["javascript"], themes: ["github-light"] });
    const store = useSourceMapStore();
    store.loadSourceMap(
      "ab",
      JSON.stringify({
        version: 3,
        sources: ["input.js"],
        sourcesContent: ["ab"],
        names: [],
        mappings: "AAAA,CAAC",
      }),
    );

    const wrapper = mount(CodePanel, {
      props: {
        code: "ab",
        filename: "example.js",
        side: "generated",
      },
    });

    await nextTick();

    const codeSpans = wrapper.findAll("[data-code-span]");
    expect(codeSpans.map((node) => node.element.textContent)).toEqual(["a", "b"]);

    const rects = [
      { left: 0, right: 8, top: 10, bottom: 28 },
      { left: 8, right: 16, top: 10, bottom: 28 },
    ];

    codeSpans.forEach((node, index) => {
      node.element.getBoundingClientRect = vi.fn(
        () =>
          ({
            ...rects[index],
            x: rects[index].left,
            y: rects[index].top,
            width: rects[index].right - rects[index].left,
            height: rects[index].bottom - rects[index].top,
            toJSON: vi.fn(),
          }) as DOMRect,
      );
    });

    await wrapper.find('[data-line="0"]').trigger("mousemove", {
      clientX: 12,
      clientY: 8,
    });

    expect(store.hoveredSegment).toMatchObject({ generatedColumn: 1 });

    await wrapper.find('[data-line="0"]').trigger("mousemove", {
      clientX: 30,
      clientY: 8,
    });

    expect(store.hoveredSegment).toBeNull();
  });
});
