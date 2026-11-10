<script setup lang="ts">
import "@unocss/reset/tailwind.css";
import "virtual:uno.css";
import "../src/styles/workspace.css";

const jsonLd = JSON.stringify({
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "Source Map Viewer",
  description:
    "Interactive tool to visualize and debug source map mappings across JavaScript, TypeScript, CSS, Vue, Svelte, Astro, and related generated code. Upload, paste, or fetch source maps to see how generated code positions map back to original source.",
  url: "https://source-map-viewer.void.app",
  applicationCategory: "DeveloperApplication",
  operatingSystem: "Any",
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  featureList: [
    "Side-by-side generated and original code view",
    "Interactive segment highlighting with connector lines",
    "Source map validation and diagnostics",
    "Coverage statistics (mapped vs unmapped bytes)",
    "File upload, paste, and URL fetch input modes",
    "Shareable URLs with embedded source map data",
  ],
}).replace(/<\//g, "<\\/");
</script>

<template>
  <component :is="'script'" type="application/ld+json" v-html="jsonLd" />
  <slot />
  <noscript>
    <div
      style="max-width: 600px; margin: 2rem auto; padding: 1rem; font-family: system-ui, sans-serif"
    >
      <h1>Source Map Viewer</h1>
      <p>
        This is an interactive tool for visualizing and debugging source map mappings. It shows how
        generated code positions map back to original source with color-coded segment highlighting
        and connector lines.
      </p>
      <h2>Features</h2>
      <ul>
        <li>Side-by-side view of generated code and original source</li>
        <li>Color-highlighted mapping segments with hover-to-trace connectors</li>
        <li>
          Source map validation: detects invalid source indices, out-of-bounds lines/columns, and
          unmapped regions
        </li>
        <li>Coverage statistics showing mapped vs unmapped bytes per file</li>
        <li>
          Three input modes: file upload (.js/.ts/.vue/.svelte/.astro/.css/.map/.json), paste, or
          URL fetch
        </li>
        <li>Shareable URLs with short IDs or inline compressed URL slugs</li>
      </ul>
      <p>This tool requires JavaScript to run. Please enable JavaScript in your browser.</p>
      <p>
        <a href="https://github.com/Dunqing/source-map-viewer">View source on GitHub</a>
      </p>
    </div>
  </noscript>
</template>

<style>
body {
  margin: 0;
  background: var(--c-bg);
  color: var(--c-text);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}
/* Hide the landing page before a shared-link slug resolves on the client.
   The head script adds .has-share-slug before paint. Vue removes it after mount. */
html.has-share-slug #app {
  visibility: hidden;
}

/* ── Theme tokens ──
   Single source of truth for all colors.
   Components use semantic UnoCSS classes (bg-base, text-fg, etc.)
   that reference these variables — no dark: prefixes needed. */
:root {
  --c-bg: #ffffff;
  --c-bg-soft: #fafbfc;
  --c-bg-mute: #f2f4f7;
  --c-bg-emphasis: #e7edf4;
  --c-text: #242b36;
  --c-text-2: #4e5969;
  --c-text-3: #626e7f;
  --c-border: #e6e9ee;

  --seg-0: #dbe4f0;
  --seg-1: #f0ddd2;
  --seg-2: #d2e8d8;
  --seg-3: #efd3d8;
  --seg-4: #ece4c8;
  --seg-5: #cce4e6;
  --seg-6: #dbd4e8;
  --seg-hover: rgba(0, 0, 0, 0.1);
  --seg-hover-ring: rgba(0, 0, 0, 0.35);
  --connector-stroke: rgba(0, 0, 0, 0.4);
  --connector-curve: rgba(0, 0, 0, 0.3);
  --connector-clamped: #ef4444;
  --connector-suspicious: #f59e0b;
  --connector-suspicious-bg: rgba(245, 158, 11, 0.12);
}
html.dark {
  --c-bg: #202630;
  --c-bg-soft: #252d39;
  --c-bg-mute: #2c3542;
  --c-bg-emphasis: #354253;
  --c-text: #e3e9f2;
  --c-text-2: #c0cad8;
  --c-text-3: #acb9cb;
  --c-border: #384352;

  --seg-0: #30425a;
  --seg-1: #544038;
  --seg-2: #304e40;
  --seg-3: #543648;
  --seg-4: #4e4a32;
  --seg-5: #304e4e;
  --seg-6: #443654;
  --seg-hover: rgba(255, 255, 255, 0.14);
  --seg-hover-ring: rgba(255, 255, 255, 0.45);
  --connector-stroke: rgba(255, 255, 255, 0.5);
  --connector-curve: rgba(255, 255, 255, 0.4);
  --connector-clamped: #f87171;
  --connector-suspicious: #fbbf24;
  --connector-suspicious-bg: rgba(251, 191, 36, 0.14);
}
</style>
