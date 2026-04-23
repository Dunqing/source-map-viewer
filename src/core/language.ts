export const supportedShikiLanguages = [
  "javascript",
  "typescript",
  "jsx",
  "tsx",
  "css",
  "scss",
  "sass",
  "json",
  "html",
  "vue",
  "svelte",
  "astro",
  "yaml",
  "toml",
  "markdown",
  "mdx",
] as const;

export type SupportedShikiLanguage = (typeof supportedShikiLanguages)[number];

const extensionToLanguage: ReadonlyArray<readonly [string, SupportedShikiLanguage]> = [
  [".tsx", "tsx"],
  [".jsx", "jsx"],
  [".mts", "typescript"],
  [".cts", "typescript"],
  [".ts", "typescript"],
  [".mjs", "javascript"],
  [".cjs", "javascript"],
  [".js", "javascript"],
  [".scss", "scss"],
  [".sass", "sass"],
  [".css", "css"],
  [".json", "json"],
  [".map", "json"],
  [".htm", "html"],
  [".html", "html"],
  [".vue", "vue"],
  [".svelte", "svelte"],
  [".astro", "astro"],
  [".yaml", "yaml"],
  [".yml", "yaml"],
  [".toml", "toml"],
  [".mdx", "mdx"],
  [".markdown", "markdown"],
  [".md", "markdown"],
];

export function isSupportedShikiLanguage(value: string): value is SupportedShikiLanguage {
  return supportedShikiLanguages.includes(value as SupportedShikiLanguage);
}

export function detectLanguage(filename: string): SupportedShikiLanguage {
  const normalized = filename.toLowerCase();

  for (const [extension, language] of extensionToLanguage) {
    if (normalized.endsWith(extension)) {
      return language;
    }
  }

  return "javascript";
}
