import { describe, it, expect } from "vite-plus/test";
import { compressToHash, decompressFromHash } from "../composables/useShareableUrl";

describe("useShareableUrl", () => {
  it("round-trips data through compress/decompress", async () => {
    const data = { generatedCode: "const x = 1;", sourceMapJson: '{"version":3}' };
    const hash = await compressToHash(data);
    expect(hash).toBeTruthy();

    const result = await decompressFromHash(hash);
    expect(result).toEqual(data);
  });

  it("handles empty strings", async () => {
    const data = { generatedCode: "", sourceMapJson: "{}" };
    const hash = await compressToHash(data);
    const result = await decompressFromHash(hash);
    expect(result).toEqual(data);
  });

  it("returns null for invalid hash", async () => {
    const result = await decompressFromHash("not-valid-data!!!");
    expect(result).toBeNull();
  });
});
