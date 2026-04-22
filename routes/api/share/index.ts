import { defineHandler } from "void";
import { shares, shareHashes, SHARE_TTL, contentHash } from "../../../src/server/shares";
import { isShareableData } from "../../../src/composables/useShareableUrl";

function generateId(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

const MAX_PAYLOAD_BYTES = 2 * 1024 * 1024; // 2 MB

export const POST = defineHandler(async (c) => {
  const body = await c.req.json();

  if (!isShareableData(body) || !body.generatedCode || !body.sourceMapJson) {
    return c.json({ error: "Missing or invalid generatedCode / sourceMapJson" }, 400);
  }

  if (body.generatedCode.length + body.sourceMapJson.length > MAX_PAYLOAD_BYTES) {
    return c.json({ error: "Payload too large" }, 413);
  }

  const origin = new URL(c.req.url).origin;
  const payload = { generatedCode: body.generatedCode, sourceMapJson: body.sourceMapJson };

  const hash = await contentHash(body.generatedCode, body.sourceMapJson);
  const existingId = await shareHashes.get(hash);
  if (existingId) {
    c.executionCtx.waitUntil(
      Promise.all([
        shareHashes.put(hash, existingId, { ttl: SHARE_TTL }),
        shares.put(existingId, payload, { ttl: SHARE_TTL }),
      ]),
    );
    return c.json({ id: existingId, url: `${origin}/${existingId}` });
  }

  const id = generateId();
  await Promise.all([
    shares.put(id, payload, { ttl: SHARE_TTL }),
    shareHashes.put(hash, id, { ttl: SHARE_TTL }),
  ]);

  return c.json({ id, url: `${origin}/${id}` });
});
