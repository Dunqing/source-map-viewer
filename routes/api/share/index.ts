import { defineHandler } from "void";
import { shares, SHARE_TTL } from "../../../src/server/shares";

function generateId(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let id = "";
  for (let i = 0; i < 8; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

export const POST = defineHandler(async (c) => {
  const body = await c.req.json<{ generatedCode: string; sourceMapJson: string }>();

  if (!body.generatedCode || !body.sourceMapJson) {
    return c.json({ error: "Missing generatedCode or sourceMapJson" }, 400);
  }

  const id = generateId();
  await shares.put(id, body, { ttl: SHARE_TTL });

  const origin = new URL(c.req.url).origin;
  return c.json({ id, url: `${origin}/${id}` });
});
