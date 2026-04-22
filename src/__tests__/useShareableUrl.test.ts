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

  it("returns null for valid compressed JSON with wrong shape", async () => {
    // Compress a valid JSON object that doesn't match ShareableData
    await compressToHash({ generatedCode: "x", sourceMapJson: '{"version":3}' });

    // Tamper: compress a different shape through the same pipeline
    const badData = JSON.stringify({ foo: "bar", baz: 123 });
    const encoded = new TextEncoder().encode(badData);
    const cs = new CompressionStream("deflate");
    const writer = cs.writable.getWriter();
    void writer.write(encoded);
    void writer.close();

    const chunks: Uint8Array[] = [];
    const reader = cs.readable.getReader();
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
    const compressed = new Uint8Array(chunks.reduce((a, c) => a + c.length, 0));
    let offset = 0;
    for (const chunk of chunks) {
      compressed.set(chunk, offset);
      offset += chunk.length;
    }
    const binary = Array.from(compressed, (b) => String.fromCharCode(b)).join("");
    const badHash = btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

    const result = await decompressFromHash(badHash);
    expect(result).toBeNull();
  });

  it("returns only generatedCode and sourceMapJson fields", async () => {
    const data = { generatedCode: "const x = 1;", sourceMapJson: '{"version":3}' };
    const hash = await compressToHash(data);
    const result = await decompressFromHash(hash);
    expect(result).not.toBeNull();
    expect(Object.keys(result!)).toEqual(["generatedCode", "sourceMapJson"]);
  });
});
