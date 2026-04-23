import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { copyShareUrl, createComparePath, createSharePath } from "../composables/shareLinks";
import { decompressFromHash } from "../composables/useShareableUrl";

const DATA = {
  generatedCode: "console.log('share');",
  sourceMapJson: '{"version":3,"sources":[],"names":[],"mappings":""}',
};

describe("shareLinks", () => {
  const originalFetch = globalThis.fetch;
  const originalClipboard = navigator.clipboard;
  const originalLocation = window.location;
  let writeText: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.restoreAllMocks();
    writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: originalClipboard,
    });
    Object.defineProperty(window, "location", {
      configurable: true,
      value: originalLocation,
    });
  });

  it("creates short share paths when the share API succeeds", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: "abc12345", url: "https://viewer.test/abc12345" }),
    } satisfies Partial<Response>) as typeof fetch;

    await expect(createSharePath(DATA)).resolves.toBe("/abc12345");
    await expect(createComparePath(DATA)).resolves.toBe("/compare?a=abc12345");
  });

  it("falls back to inline hashes when the share API is unavailable", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("offline")) as typeof fetch;

    const path = await createSharePath(DATA);
    const slug = path.slice(1);
    expect(await decompressFromHash(slug)).toEqual(DATA);
    await expect(createComparePath(DATA)).resolves.toMatch(/^\/compare\?a=/);
  });

  it("copies short URLs and replaces the current pathname", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: "abc12345", url: "https://viewer.test/abc12345" }),
    } satisfies Partial<Response>) as typeof fetch;

    const replaceStateSpy = vi.spyOn(window.history, "replaceState");

    await expect(copyShareUrl(DATA)).resolves.toBe("short");
    expect(writeText).toHaveBeenCalledWith("https://viewer.test/abc12345");
    expect(replaceStateSpy).toHaveBeenCalledWith(null, "", "/abc12345");
  });
});
