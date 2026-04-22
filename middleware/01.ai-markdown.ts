import { defineMiddleware } from "void";
import { shares, SHARE_TTL } from "../src/server/shares";
import { parseSourceMapLite } from "../src/core/parser-lite";
import { buildMappingIndex } from "../src/core/mapper";
import { validateMappings } from "../src/core/validator";
import { generateDebugPrompt, analyzeQuality } from "../src/core/prompt";
import { calculateStats } from "../src/core/stats";
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

  return false;
}

/** Short IDs are 8 alphanumeric chars. Long hashes are base64url compressed data. */
function isShortId(slug: string): boolean {
  return /^[A-Za-z0-9]{8}$/.test(slug);
}

async function resolveData(
  slug: string,
  ctx?: { waitUntil(promise: Promise<unknown>): void },
): Promise<{ generatedCode: string; sourceMapJson: string } | null> {
  // Try KV lookup for short IDs first
  if (isShortId(slug)) {
    const stored = await shares.get(slug);
    if (stored) {
      // Renew TTL on access
      ctx?.waitUntil(shares.put(slug, stored, { ttl: SHARE_TTL }));
      return stored;
    }
  }
  // Fall back to inline decompression for long hashes
  return decompressFromHash(slug);
}

export default defineMiddleware(async (c, next) => {
  const url = new URL(c.req.url);
  const path = url.pathname;

  // Skip root, static assets, API routes, pages, and Void internals
  if (
    path === "/" ||
    path.includes(".") ||
    path.startsWith("/__") ||
    path.startsWith("/api/") ||
    path === "/compare"
  ) {
    return next();
  }

  const match = path.match(/^\/(.+)$/);
  if (!match) {
    return next();
  }

  // Browser requests — pass through to Void's page handler
  if (!shouldServeMarkdown(c.req)) {
    return next();
  }

  const slug = match[1];
  const data = await resolveData(slug, c.executionCtx);
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

  const visualizationUrl = `${url.origin}/${slug}`;

  const stats = calculateStats(parsedData, generatedCode, diagnostics, mappingIndex);
  const qualityWarnings = analyzeQuality(parsedData, generatedCode, stats.coveragePercent);

  const markdown = generateDebugPrompt({
    generatedCode,
    sourceMapJson,
    parsedData,
    mappingIndex,
    diagnostics,
    badSegmentSet,
    qualityWarnings,
    coveragePercent: stats.coveragePercent,
    visualizationUrl,
  });

  return c.text(markdown, 200, {
    "Content-Type": "text/markdown; charset=utf-8",
    Vary: "Accept, User-Agent",
  });
});
