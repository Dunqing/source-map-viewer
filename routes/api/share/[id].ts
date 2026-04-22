import { defineHandler } from "void";
import { shares, SHARE_TTL } from "../../../src/server/shares";

export const GET = defineHandler(async (c) => {
  const id = c.req.param("id");
  if (!id) {
    return c.json({ error: "Missing id" }, 400);
  }

  const data = await shares.get(id);
  if (!data || typeof data.generatedCode !== "string" || typeof data.sourceMapJson !== "string") {
    return c.json({ error: "Not found" }, 404);
  }

  // Renew TTL on access
  c.executionCtx.waitUntil(shares.put(id, data, { ttl: SHARE_TTL }));

  return c.json({ generatedCode: data.generatedCode, sourceMapJson: data.sourceMapJson });
});
