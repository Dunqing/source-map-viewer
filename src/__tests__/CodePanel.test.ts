import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import CodePanel from "../components/CodePanel.vue";
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

  it("renders explicit whitespace markers while preserving the underlying whitespace nodes", async () => {
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
    expect(wrapper.findAll(".whitespace-measure").map((node) => node.element.textContent)).toEqual([
      " ",
      " ",
      "\t",
    ]);
    expect(wrapper.findAll(".whitespace-marker").map((node) => node.element.textContent)).toEqual([
      "·",
      "·",
      "⇥",
    ]);
  });
});
