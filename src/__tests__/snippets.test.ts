import { describe, expect, it } from "vite-plus/test";
import { extractGeneratedSnippet, extractOriginalSnippet } from "../core/snippets";

describe("extractGeneratedSnippet", () => {
  it("skips leading indentation before slicing", () => {
    expect(extractGeneratedSnippet(["    return value;"], 0, 0)).toBe("return value;");
  });

  it("can append an ellipsis for truncated table snippets", () => {
    expect(
      extractGeneratedSnippet(["    return original.call(this, value);"], 0, 0, {
        length: 6,
        appendEllipsis: true,
      }),
    ).toBe("return...");
  });
});

describe("extractOriginalSnippet", () => {
  it("clamps out-of-bounds original positions before slicing", () => {
    expect(extractOriginalSnippet(["abc", "return value;"], 99, 99)).toBe("(empty)");
    expect(extractOriginalSnippet(["abc", "return value;"], 1, 99)).toBe("(empty)");
  });
});
