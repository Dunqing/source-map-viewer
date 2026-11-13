import { describe, expect, it } from "vite-plus/test";
import { extractShareSlug } from "../composables/navigation";

describe("extractShareSlug", () => {
  it("accepts a browser-only inline fragment for comparisons", () => {
    expect(extractShareSlug("https://source-map-viewer.void.app/?tab=1#data=inline-payload")).toBe(
      "inline-payload",
    );
  });

  it("preserves existing path links even when they contain a fragment", () => {
    expect(extractShareSlug("https://source-map-viewer.void.app/abc12345#data=ignored")).toBe(
      "abc12345",
    );
  });

  it("continues to accept bare slugs", () => {
    expect(extractShareSlug("abc12345")).toBe("abc12345");
  });
});
