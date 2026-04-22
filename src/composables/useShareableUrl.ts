export interface ShareableData {
  generatedCode: string;
  sourceMapJson: string;
}

export function isShareableData(v: unknown): v is ShareableData {
  return (
    typeof v === "object" &&
    v !== null &&
    typeof (v as Record<string, unknown>).generatedCode === "string" &&
    typeof (v as Record<string, unknown>).sourceMapJson === "string"
  );
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
  void writer.write(encoded);
  void writer.close();

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
    const writePromise = writer.write(compressed).then(() => writer.close());

    const decompressed = await readStream(ds.readable);
    await writePromise;
    const json = new TextDecoder().decode(decompressed);
    const parsed = JSON.parse(json);
    if (!isShareableData(parsed)) return null;
    return { generatedCode: parsed.generatedCode, sourceMapJson: parsed.sourceMapJson };
  } catch {
    return null;
  }
}

const CACHE_PREFIX = "smv-share:";
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function getCached(slug: string): ShareableData | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + slug);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed.t === "number" && Date.now() - parsed.t > CACHE_TTL_MS) {
      localStorage.removeItem(CACHE_PREFIX + slug);
      return null;
    }
    if (!isShareableData(parsed)) return null;
    return { generatedCode: parsed.generatedCode, sourceMapJson: parsed.sourceMapJson };
  } catch {}
  return null;
}

function setCache(slug: string, data: ShareableData): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(CACHE_PREFIX + slug, JSON.stringify({ ...data, t: Date.now() }));
  } catch {}
}

function isShortId(slug: string): boolean {
  return /^[A-Za-z0-9]{8}$/.test(slug);
}

/** Resolve a slug (short ID or inline hash) to source map data, with localStorage caching. */
export async function resolveSlug(slug: string): Promise<ShareableData | null> {
  const cached = getCached(slug);
  if (cached) return cached;

  if (!isShortId(slug)) {
    const inline = await decompressFromHash(slug);
    if (inline) return inline;
  }

  try {
    const res = await fetch(`/api/share/${slug}`);
    if (res.ok) {
      const data: ShareableData = await res.json();
      setCache(slug, data);
      return data;
    }
  } catch {}
  return null;
}
