# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

This project uses **Vite+** (`vp`) as the unified toolchain. Always use `vp` instead of pnpm/npm directly.

```bash
vp dev                          # Start dev server
vp build                        # Production build (SSR with Cloudflare Worker)
vp check                        # Format (Oxfmt) + lint (Oxlint) + type-check (tsgolint)
vp check --fix                  # Auto-fix formatting and lint issues
vp test                         # Run all tests in watch mode
vp test --run                   # Run tests once (CI mode)
vp test src/__tests__/parser    # Run a single test file (partial match works)
vp install                      # Install dependencies
```

**Import rules**: Use `vite-plus/test` for test utilities (`describe`, `it`, `expect`, `vi`), not `vitest`. Use `vite-plus` for config (`defineConfig`), not `vite`.

## Setup

Requires GitHub Packages auth for `@void-sdk` private packages:

- `.npmrc` maps `@void-sdk:registry=https://npm.pkg.github.com`
- `~/.npmrc` must have a GitHub PAT with `read:packages` scope: `//npm.pkg.github.com/:_authToken=YOUR_TOKEN`

## Architecture

Source map viewer tool that shows how generated code positions map back to original source. Built with Vue 3 + Void SDK (SSR on Cloudflare Workers) + Vite+.

### Data Flow

```
Input → Parse → Index → Validate → Store → Visualize
```

1. **Input** — `useFileLoader` handles three input modes: file upload (`.js`/`.map`), pasted text, or URL fetch. Detects inline `sourceMappingURL` comments and extracts embedded base64 source maps.

2. **Parse** (`core/parser.ts`) — Parses source map JSON via `source-map-js` into `SourceMapData`. Handles sectioned source maps. **Critical**: converts 1-based line numbers from source-map-js to 0-based for internal use.

3. **Index** (`core/mapper.ts`) — Builds two indexes from flat `MappingSegment[]`:
   - `MappingIndex`: segments sorted by generated position
   - `InverseMappingIndex`: `Map<sourceIndex, MappingSegment[]>` sorted by original position
   - Both use binary search for O(log n) lookups

4. **Validate** (`core/validator.ts`) — Produces `MappingDiagnostic[]` for: invalid source index, out-of-bounds line/column, negative columns

5. **Stats** (`core/stats.ts`) — Calculates coverage (mapped vs unmapped bytes), per-file sizes

6. **Store** (`stores/sourceMap.ts`) — Module-level singleton via `reactive(createSourceMapStore())`. Plain Vue reactivity (not Pinia). Uses `shallowRef` for large data (parsedData, mappingIndex) to avoid deep tracking. `useSourceMapStore()` returns the same reactive object to all callers.

7. **Visualize** — Two `CodePanel` instances (original + generated) with `MappingConnector` SVG overlay. Hovering a segment updates `store.hoveredSegment`, which all panels react to.

### Key Components

- **`CodePanel`** — Virtual-scrolled code viewer (buffer of 20 lines). Builds per-character `MappingSegment` assignment for pixel-accurate highlighting. Shiki tokens for syntax coloring overlaid with segment background colors.
- **`MappingConnector`** — SVG overlay using `requestAnimationFrame` loop while a segment is hovered. Reads DOM positions from both CodePanels via `getViewportPosition()` to draw cubic Bezier connection curves. The rAF loop (not a reactive computed) avoids recursive update loops when panels scroll.
- **`AiDebugPanel`** — Generates a structured markdown prompt for AI-assisted source map debugging. Uses shared `core/prompt.ts` via `useAiDebugPrompt` composable.

### Rendering Stack

- **Void SDK** (`@void-sdk/void` + `@void-sdk/vue`) — SSR framework on Cloudflare Workers. `pages/layout.vue` = root layout (CSS custom properties, UnoCSS imports). `pages/index.vue` = entry point (path-based routing between landing/viz). Config in `void.json` with `"output": "server"`. Server routes in `routes/`, middleware in `middleware/`.
- **Shiki** — Uses `shiki/core` with explicit lang/theme imports (JS, TS, CSS, JSON + github-light/dark) and `createJavaScriptRegexEngine`. Never import from bare `shiki` — it bundles 200+ languages.
- **UnoCSS** — Utility CSS with semantic color aliases (`bg-panel`, `text-fg`, `border-edge`, etc.) mapped to CSS custom properties in `uno.config.ts`. Dark mode via `html.dark` class toggling CSS variable values in `pages/layout.vue`.
- **unplugin-icons** — Carbon icons via `~icons/carbon/*` imports.

### URL & Sharing

Shared URLs use short IDs stored in Cloudflare KV (e.g., `/{shortId}`). The share flow: `POST /api/share` stores `{ generatedCode, sourceMapJson }` in KV with a 30-day TTL (renewed on each access), returns an 8-char ID. Inline compressed slugs (`/{compressedSlug}`) are supported as fallback. UI state (active tab, panel toggles) is in query params.

**LLM-friendly endpoint**: Middleware (`middleware/01.ai-markdown.ts`) intercepts `/{slug}` requests. AI bots (detected via User-Agent patterns or `Accept: text/markdown`) get a structured markdown debug report generated by `core/prompt.ts` with `core/parser-lite.ts` (a lightweight VLQ parser that works in Cloudflare Workers where `source-map-js`'s `new Function()` is blocked). The report now includes the raw VLQ mappings string in addition to the summarized table. Browsers get the normal SSR page via `next()`.

**Flash prevention**: When a user opens a shared URL, a blocking `<script>` in `void.json` adds `has-share-slug` to `<html>` before paint. CSS rule `html.has-share-slug #app { visibility: hidden }` hides the SSR-rendered page. The `resolved` ref in `pages/index.vue` gates rendering — nothing shows until the slug is resolved. After resolution, `classList.remove("has-share-slug")` reveals the page.

### SSR CSS Injection (Dev Only)

The `unocssDevSSRInject()` plugin in `vite.config.ts` solves UnoCSS not being included in Vite's dev SSR HTML. It intercepts Cloudflare's streamed SSR response (`writeHead` → `write` chunks → `end`), buffers HTML responses, generates UnoCSS styles via the `unocss:api` plugin context, and injects them as a `<style>` tag before `</head>`. Also injects the Tailwind reset CSS and the shared-link hiding rule. Production extracts CSS to files during build.

### Server Routes & Middleware

- **`middleware/01.ai-markdown.ts`** — Global middleware. Intercepts `/{slug}` requests from AI bots (User-Agent detection + `Accept: text/markdown`). Resolves slug from KV (short IDs) or inline decompression (long hashes). Returns structured markdown debug report. Browser requests pass through via `next()`.
- **`routes/api/share/index.ts`** — `POST /api/share`: stores source map data in KV, returns 8-char short ID. 30-day TTL, auto-renewed on every access.
- **`routes/api/share/[id].ts`** — `GET /api/share/:id`: retrieves data from KV, renews 30-day TTL via `waitUntil`. Middleware also renews TTL when AI bots fetch a short URL.
- **`src/server/shares.ts`** — Shared KV map definition and TTL constant used by routes and middleware.

## Core Types

```typescript
MappingSegment {
  generatedLine, generatedColumn,    // position in generated code (0-based)
  originalLine, originalColumn,       // position in original source (0-based)
  sourceIndex,                        // index into sources[] array
  nameIndex: number | null            // index into names[] or null
}
```

`MappingDiagnostic.type`: `"invalid-source"` | `"out-of-bounds"` | `"unmapped"` | `"suspicious"`

## Key Conventions

- All line/column numbers are **0-based** internally. The parser is the only place that converts from source-map-js's 1-based output.
- Segment highlight colors cycle through 7 values (`--seg-0` to `--seg-6` CSS vars in `pages/layout.vue`, count defined as `SEGMENT_COLOR_COUNT` in `src/constants/index.ts`).
- Theme colors use CSS custom properties (`:root` / `html.dark` in `pages/layout.vue`) mapped to semantic UnoCSS classes (`bg-panel`, `text-fg`, `text-fg-dim`, `text-fg-muted`, `bg-surface`, `bg-muted`, `border-edge`) in `uno.config.ts`. Components use these semantic classes — no `dark:` prefixes needed.
- Cloudflare/Void plugins are excluded during tests (guarded by `process.env.VITEST`) to avoid `resolve.external` conflicts with Vitest.
- Pre-commit hook runs `vp check --fix` on staged files (configured in `vite.config.ts` `staged` block).
- Browser-only APIs (`localStorage`, `window`, `matchMedia`) must be deferred to `onMounted` — never read during setup/render — to avoid SSR hydration mismatches.
- VisualizationPage uses a `ready` ref (set via `requestAnimationFrame` after mount) to defer heavy rendering and avoid recursive update loops with Void's page system.
- The `syncUrlParams` watcher is debounced and disabled during mount to prevent `replaceState` from triggering Void's router and causing infinite loops.

## Deployment

Deploy to Void via `vp exec void deploy --project source-map-viewer`.
