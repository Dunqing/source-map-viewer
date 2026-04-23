# Source Map Viewer

A visual tool for inspecting, comparing, and sharing JavaScript/CSS source maps. Upload, paste, fetch, or open a shared URL to trace generated positions back to original code, validate mappings, and produce AI-friendly debugging reports.

## Features

- **Flexible input loading** — upload generated code plus `.map`, paste raw source map JSON or generated code with inline `sourceMappingURL`, open `data:application/json` payloads, or fetch public HTTP(S) URLs
- **Folder-aware loading** — upload a build/output folder to preserve relative paths, auto-pair an unambiguous generated file with its source map, and hydrate missing `sourcesContent` from sibling source files
- **Interactive mapping viewer** — hover or click any mapped segment to highlight both sides, follow the SVG connector, and keep original/generated panels in sync
- **Multi-source navigation** — switch between source files with tabs when a source map contains multiple inputs
- **Search and deep links** — search visible code with `Cmd/Ctrl+F`, then share links that preserve the selected source tab, stats panel, and a specific mapping via `?tab=`, `?stats=1`, and `?seg=`
- **Mappings table and export** — inspect every mapping with filtering by position, snippet, source, or name, and copy the table as Markdown
- **Validation and quality analysis** — catch invalid mappings, out-of-bounds/clamped targets, whitespace-target mappings, low coverage, and missing `sourcesContent`
- **Coverage stats** — mapped vs unmapped bytes, total mappings, bad mapping counts, and per-file sizes
- **Source map diffing** — compare two source maps from shared links, public URLs, pasted content, or local files to see which mappings stayed the same, changed, were added, or were removed
- **Shareable short URLs** — source map data stored in KV with 8-char short IDs, auto-renewed 30-day TTL on every access
- **Recent history and built-in examples** — reopen the last 5 visualizations from local storage or load bundled examples for esbuild/Oxc comparisons
- **LLM-friendly** — AI tools get a structured markdown debug report when fetching a shared URL (content negotiation via User-Agent / `Accept` headers)
- **AI debug prompt** — generate the same report locally from the toolbar and copy it straight to your assistant
- **Theme toggle** — light, dark, and system modes

## AI-Friendly

Every shared URL works out of the box with AI coding tools like Claude Code and Codex. When an AI fetches a visualization URL, it receives a structured markdown debug report instead of HTML, so no browser or JavaScript is required.

**How it works:** The server detects AI requests via User-Agent patterns and the `Accept: text/markdown` header. Browsers get the normal interactive visualization.

Just paste a shared URL into Claude Code or Codex and it can read the full source map analysis:

```markdown
# Source Map Debug Report

## Issues

**1 invalid mapping(s)** — position data violates the spec:

- First at generated position 1:33
- 2 mapping(s) point into leading whitespace instead of actual code tokens.

## Overview

| Metric           | Value                 |
| ---------------- | --------------------- |
| Sources          | input.js              |
| Total mappings   | 9                     |
| Coverage         | 81% of generated code |
| Invalid mappings | 1                     |
| Quality warnings | 1                     |
| Names            | 4                     |
```

The report includes original/generated code with line numbers, a mapping table with bad mappings flagged, raw VLQ mappings, quality warnings, and analysis prompts. The same report powers the **AI Debug** button in the visualization toolbar; sharing a URL lets AI fetch it directly, while the button copies it to your clipboard for manual pasting.

## Compare and Share

Use **Compare** to diff two source maps from shared viewer links, public asset URLs, pasted content, or local uploads. If both sides came from shareable links, compare state is preserved in `/compare?a=<id>&b=<id>`; otherwise the compare session stays local to the current tab. The comparison view shows a summary of mappings that are unchanged, changed, removed, or added, with expandable code context for each difference.

Deep-link query params also work on viewer URLs:

- `?tab=<index>` selects the active original source file
- `?stats=1` opens the stats panel
- `?seg=<index>` focuses a specific mapping row and scrolls both code panes to it

## CLI

Use `vp dlx` in a Vite+ workspace, or `npx` elsewhere. You can pass either a file path or a folder that contains exactly one unambiguous source map entrypoint:

```bash
vp dlx source-map-viewer bundle.js                          # open visualization in browser
vp dlx source-map-viewer dist/                             # scan a folder and open the only source map pair
vp dlx source-map-viewer bundle.js --url                    # print shareable URL
vp dlx source-map-viewer bundle.js --ai                     # print AI debug report to stdout
vp dlx source-map-viewer bundle.js --copy                   # copy the shared URL
vp dlx source-map-viewer compare before.js after.js         # open compare view in browser
vp dlx source-map-viewer compare before.js after.js --url   # print compare URL
vp dlx source-map-viewer compare before.js after.js --ai    # print markdown diff report

npx source-map-viewer bundle.js
npx source-map-viewer bundle.js --url
npx source-map-viewer bundle.js --ai
npx source-map-viewer compare before.js after.js --url
```

The CLI auto-detects source maps from inline `sourceMappingURL` comments, external `.map` references, sibling `.map` files, or folder scans with preserved relative paths. You can also pass a `.map` or `.json` file directly. When the folder also contains original sources, missing `sourcesContent` entries are filled from disk before rendering. The `compare` subcommand accepts the same inputs on both sides and can emit either a browser URL or an offline markdown diff report.

Useful flags:

- `--copy` copies the generated URL or markdown report to your clipboard
- `--host <url>` points uploads at a custom deployment instead of `https://source-map-viewer.void.app`

Pipe the AI report into your coding assistant:

```bash
vp dlx source-map-viewer dist/bundle.js --ai | pbcopy
```

## Development

```bash
vp install
vp dev
vp build
vp check
vp test --run
```

## Resources

- [ECMA-426: Source Map Format](https://tc39.es/ecma426/) — the official specification, covering VLQ encoding, `mappings`, index-map `sections`, and `sourcesContent`
- [source-map-js](https://github.com/7rulnik/source-map-js) — the parser used by this tool
- [Debug with Source Maps](https://developer.chrome.com/docs/devtools/javascript/source-maps/) — Chrome DevTools guide with visual examples
- [Generating Source Maps](https://pvdz.ee/weblog/281) — deep dive into VLQ encoding and segment deltas
- [Source Map Visualization (original)](https://evanw.github.io/source-map-visualization/) — Evan Wallace's original tool that inspired this project

## Tech Stack

Vue 3, Vite+, Void SDK (SSR on Cloudflare Workers), Shiki, UnoCSS, Cloudflare KV
