import { describe, expect, it } from "vite-plus/test";
import { detectLanguage } from "../core/language";

describe("detectLanguage", () => {
  it("detects framework and markup languages from filename extension", () => {
    expect(detectLanguage("App.vue")).toBe("vue");
    expect(detectLanguage("Card.svelte")).toBe("svelte");
    expect(detectLanguage("page.astro")).toBe("astro");
    expect(detectLanguage("template.html")).toBe("html");
    expect(detectLanguage("content.mdx")).toBe("mdx");
  });

  it("preserves jsx and tsx detection instead of collapsing them to js/ts", () => {
    expect(detectLanguage("Button.jsx")).toBe("jsx");
    expect(detectLanguage("Button.tsx")).toBe("tsx");
  });
});
