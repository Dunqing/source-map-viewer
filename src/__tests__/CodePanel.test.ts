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
