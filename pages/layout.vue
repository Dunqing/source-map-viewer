<script setup lang="ts">
import "@unocss/reset/tailwind.css";
import "virtual:uno.css";

const jsonLd = JSON.stringify({
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "Source Map Visualization",
  description:
    "Interactive tool to visualize and debug JavaScript/CSS source map mappings. Upload, paste, or fetch source maps to see how generated code positions map back to original source.",
  url: "https://source-map-visualization.voidzero.dev",
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
});
</script>

<template>
  <component :is="'script'" type="application/ld+json" v-html="jsonLd" />
  <slot />
  <noscript>
    <div
      style="max-width: 600px; margin: 2rem auto; padding: 1rem; font-family: system-ui, sans-serif"
    >
      <h1>Source Map Visualization</h1>
      <p>
        This is an interactive tool for visualizing and debugging JavaScript/CSS source map
        mappings. It shows how generated code positions map back to original source with color-coded
        segment highlighting and connector lines.
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
        <li>Three input modes: file upload (.js/.map/.css), paste, or URL fetch</li>
        <li>Shareable URLs with compressed source map data in the hash</li>
      </ul>
      <p>This tool requires JavaScript to run. Please enable JavaScript in your browser.</p>
      <p>
        <a href="https://github.com/Dunqing/source-map-visualization">View source on GitHub</a>
      </p>
    </div>
  </noscript>
</template>

<style>
body {
  margin: 0;
  background: var(--c-bg);
  color: var(--c-text);
}
/* Hide SSG-prerendered landing page when URL has a hash (shared link).
   The head script adds .has-hash before paint. Vue removes it after mount. */
html.has-hash #app {
  visibility: hidden;
}

/* ── Theme tokens ──
   Single source of truth for all colors.
   Components use semantic UnoCSS classes (bg-base, text-fg, etc.)
   that reference these variables — no dark: prefixes needed. */
:root {
  --c-bg: #f8fafc;
  --c-bg-soft: #f1f5f9;
  --c-bg-mute: #e8eef4;
  --c-bg-emphasis: #dce4ee;
  --c-text: #0f172a;
  --c-text-2: #334155;
  --c-text-3: #64748b;
  --c-border: #d8e0ea;

  --seg-0: #dbe4f0;
  --seg-1: #f0ddd2;
  --seg-2: #d2e8d8;
  --seg-3: #efd3d8;
  --seg-4: #ece4c8;
  --seg-5: #cce4e6;
  --seg-6: #dbd4e8;
  --seg-hover: rgba(0, 0, 0, 0.06);
  --connector-stroke: rgba(0, 0, 0, 0.4);
  --connector-curve: rgba(0, 0, 0, 0.3);
}
html.dark {
  --c-bg: #1a1a1e;
  --c-bg-soft: #1e1e22;
  --c-bg-mute: #2a2a2e;
  --c-bg-emphasis: #36363a;
  --c-text: #fafafa;
  --c-text-2: #a1a1aa;
  --c-text-3: #a0a0ab;
  --c-border: #36363a;

  --seg-0: #30425a;
  --seg-1: #544038;
  --seg-2: #304e40;
  --seg-3: #543648;
  --seg-4: #4e4a32;
  --seg-5: #304e4e;
  --seg-6: #443654;
  --seg-hover: rgba(255, 255, 255, 0.08);
  --connector-stroke: rgba(255, 255, 255, 0.5);
  --connector-curve: rgba(255, 255, 255, 0.4);
}
</style>
