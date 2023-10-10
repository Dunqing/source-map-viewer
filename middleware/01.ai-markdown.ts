import { defineMiddleware } from "void";
import { parseSourceMapLite } from "../src/core/parser-lite";
import { buildMappingIndex } from "../src/core/mapper";
import { validateMappings } from "../src/core/validator";
import { generateDebugPrompt } from "../src/core/prompt";
import { decompressFromHash } from "../src/composables/useShareableUrl";

const AI_BOT_PATTERNS = [
  "GPTBot",
  "ChatGPT-User",
  "OAI-SearchBot",
  "ClaudeBot",
  "claude-web",
  "anthropic-ai",
  "PerplexityBot",
  "Perplexity-User",
  "Google-Extended",
];

function shouldServeMarkdown(req: { header(name: string): string | undefined }): boolean {
  const accept = req.header("accept") || "";
  if (accept.includes("text/markdown")) return true;

  const ua = req.header("user-agent") || "";
  if (AI_BOT_PATTERNS.some((p) => ua.includes(p))) return true;

  if (!accept.includes("text/html")) return true;

  return false;
}

export default defineMiddleware(async (c, next) => {
  const url = new URL(c.req.url);
  const path = url.pathname;

  // Skip root, static assets, and Void internals
  if (path === "/" || path.includes(".") || path.startsWith("/__")) {
    return next();
  }

  const match = path.match(/^\/(.+)$/);
  if (!match) {
    return next();
  }

  // Browser requests — serve the index page (SPA handles /s/<hash> client-side)
  if (!shouldServeMarkdown(c.req)) {
    const indexUrl = new URL("/", c.req.url);
    const resp = await fetch(indexUrl.toString());
    return new Response(resp.body, {
      status: resp.status,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }

  const hash = match[1];
  const data = await decompressFromHash(hash);
  if (!data) {
    return c.text("Failed to decode source map data", 400);
  }

  const { generatedCode, sourceMapJson } = data;

  let parsedData;
  try {
    parsedData = parseSourceMapLite(sourceMapJson);
  } catch {
    return c.text("Failed to parse source map", 400);
  }

  const mappingIndex = buildMappingIndex(parsedData.mappings);
  const diagnostics = validateMappings(parsedData);
  const badSegmentSet = new Set(diagnostics.map((d) => d.segment));

  const visualizationUrl = `${url.origin}/${hash}`;

  const markdown = generateDebugPrompt({
    generatedCode,
    sourceMapJson,
    parsedData,
    mappingIndex,
    diagnostics,
    badSegmentSet,
    visualizationUrl,
  });

  return c.text(markdown, 200, {
    "Content-Type": "text/markdown; charset=utf-8",
    Vary: "Accept, User-Agent",
  });
});
