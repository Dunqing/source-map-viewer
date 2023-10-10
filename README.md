# Source Map Visualization

A visual tool for inspecting and debugging JavaScript source maps. Upload or paste a source map to see how generated code positions map back to original source, with pixel-accurate highlighting and interactive mapping connections.

## Features

- **Three input modes** — file upload (`.js`/`.map`), pasted text, or URL fetch
- **Interactive mapping viewer** — hover any mapped segment to see the original-to-generated connection via hand-drawn SVG curves
- **Syntax highlighting** — powered by Shiki with segment color overlay
- **Source map validation** — detects invalid source indices, out-of-bounds positions, and suspicious mappings
- **Coverage stats** — mapped vs unmapped byte counts per file
- **Shareable URLs** — source map data is compressed and encoded in the URL for easy sharing
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

Vue 3, Vite+, Void SDK (SSG on Cloudflare), Shiki, UnoCSS
