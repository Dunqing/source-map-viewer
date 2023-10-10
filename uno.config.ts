import { defineConfig, presetUno, presetIcons, presetTypography } from "unocss";

export default defineConfig({
  presets: [
    presetUno({ dark: "class" }),
    presetIcons({
      scale: 1.2,
    }),
    presetTypography(),
  ],
  theme: {
    fontFamily: {
      mono: "JetBrains Mono, Fira Code, monospace",
    },
    colors: {
      base: "var(--c-bg)",
      panel: "var(--c-bg-soft)",
      surface: "var(--c-bg-mute)",
      muted: "var(--c-bg-emphasis)",
      fg: { DEFAULT: "var(--c-text)", dim: "var(--c-text-2)", muted: "var(--c-text-3)" },
      edge: "var(--c-border)",
    },
  },
});
