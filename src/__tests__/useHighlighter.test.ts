import { describe, expect, it } from "vite-plus/test";
import { getSharedHighlighter } from "../composables/useHighlighter";

describe("getSharedHighlighter", () => {
  it("reuses the singleton instance and lazy-loads languages and themes", async () => {
    const base = await getSharedHighlighter();
    expect(base.getLoadedLanguages()).toEqual([]);
    expect(base.getLoadedThemes()).toEqual([]);

    const extended = await getSharedHighlighter({
      langs: ["vue", "astro"],
      themes: ["github-light"],
    });

    expect(extended).toBe(base);
    expect(extended.getLoadedLanguages()).toEqual(expect.arrayContaining(["vue", "astro", "html"]));
    expect(extended.getLoadedThemes()).toEqual(expect.arrayContaining(["github-light"]));
    expect(
      extended.codeToTokensBase(
        "---\ntitle: Demo\n---\n<div>{items.map((item) => <span>{item}</span>)}</div>",
        {
          lang: "astro",
          theme: "github-light",
        },
      ),
    ).not.toHaveLength(0);
  });
});
