# Source Map Visualization

A visual tool for inspecting and debugging JavaScript source maps. Upload or paste a source map to see how generated code positions map back to original source, with pixel-accurate highlighting and interactive mapping connections.

## Features

- **Three input modes** — file upload (`.js`/`.map`), pasted text, or URL fetch
- **Interactive mapping viewer** — hover any mapped segment to see the original-to-generated connection via hand-drawn SVG curves
- **Syntax highlighting** — powered by Shiki with segment color overlay
- **Source map validation** — detects invalid source indices, out-of-bounds positions, and suspicious mappings
- **Coverage stats** — mapped vs unmapped byte counts per file
- **Shareable short URLs** — source map data stored in KV with 8-char short IDs, auto-renewed 30-day TTL on every access
- **LLM-friendly** — AI tools get a structured markdown debug report when fetching a shared URL (content negotiation via User-Agent / Accept headers)
- **AI debug prompt** — generates structured prompts for AI-assisted debugging
- **Dark mode** — automatic system detection with manual toggle

## Development

```bash
vp dev          # Start dev server
vp build        # Production build
vp check        # Format + lint + type-check
vp test --run   # Run tests
```

## Tech Stack

Vue 3, Vite+, Void SDK (SSR on Cloudflare Workers), Shiki, UnoCSS, Cloudflare KV
