export interface ShareableData {
  generatedCode: string;
  sourceMapJson: string;
}

async function readStream(readable: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  const reader = readable.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  const result = new Uint8Array(chunks.reduce((acc, c) => acc + c.length, 0));
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

export async function compressToHash(data: ShareableData): Promise<string> {
  const json = JSON.stringify(data);
  const encoded = new TextEncoder().encode(json);

  const cs = new CompressionStream("deflate");
  const writer = cs.writable.getWriter();
  writer.write(encoded);
  writer.close();

  const compressed = await readStream(cs.readable);

  const binary = Array.from(compressed, (b) => String.fromCharCode(b)).join("");
  const base64 = btoa(binary);
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function decompressFromHash(hash: string): Promise<ShareableData | null> {
  try {
    let base64 = hash.replace(/-/g, "+").replace(/_/g, "/");
    while (base64.length % 4) base64 += "=";

    const binary = atob(base64);
    const compressed = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      compressed[i] = binary.charCodeAt(i);
    }

    const ds = new DecompressionStream("deflate");
    const writer = ds.writable.getWriter();
    writer.write(compressed);
    writer.close();

    const decompressed = await readStream(ds.readable);
    const json = new TextDecoder().decode(decompressed);
    return JSON.parse(json);
  } catch {
    return null;
  }
}
