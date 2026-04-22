import { kv } from "void/kv";

export interface ShareData {
  generatedCode: string;
  sourceMapJson: string;
}

export const shares = kv.map<ShareData>("share");
export const shareHashes = kv.map<string>("share-hash");

export const SHARE_TTL = 30 * 24 * 60 * 60; // 30 days

export async function contentHash(generatedCode: string, sourceMapJson: string): Promise<string> {
  const enc = new TextEncoder();
  const a = enc.encode(generatedCode);
  const b = enc.encode(sourceMapJson);
  const combined = new Uint8Array(a.byteLength + 1 + b.byteLength);
  combined.set(a);
  combined[a.byteLength] = 0;
  combined.set(b, a.byteLength + 1);
  const hash = await crypto.subtle.digest("SHA-256", combined);
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
