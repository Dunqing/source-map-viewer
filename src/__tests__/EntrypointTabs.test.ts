import { describe, expect, it } from "vite-plus/test";
import { mount } from "@vue/test-utils";
import EntrypointTabs from "../components/EntrypointTabs.vue";

describe("EntrypointTabs", () => {
  it("renders entrypoints and emits selection events", async () => {
    const wrapper = mount(EntrypointTabs, {
      props: {
        entries: ["js/alpha.js", "js/beta.js"],
        activeIndex: 0,
      },
    });

    const buttons = wrapper.findAll("button");
    expect(buttons.map((node) => node.text())).toEqual(["js/alpha.js", "js/beta.js"]);

    await buttons[1].trigger("click");

    expect(wrapper.emitted("select")).toEqual([[1]]);
  });
});
