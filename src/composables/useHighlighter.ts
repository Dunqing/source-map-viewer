import { shallowRef } from "vue";
import type { HighlighterCore, ThemedToken } from "shiki/core";
import { useTheme } from "./useTheme";
import {
  detectLanguage,
  type SupportedShikiLanguage,
  supportedShikiLanguages,
} from "../core/language";

const highlighter = shallowRef<HighlighterCore | null>(null);
const loading = shallowRef(true);
const highlightedTokenCache = new Map<string, HighlightedToken[][]>();
const MAX_HIGHLIGHT_CACHE_SIZE = 8;
let highlighterPromise: Promise<HighlighterCore> | null = null;
let activeLoadCount = 0;

export const supportedShikiThemes = ["github-light", "github-dark"] as const;
export type SupportedShikiTheme = (typeof supportedShikiThemes)[number];
const commonPrewarmLanguages = [
  "javascript",
  "typescript",
  "css",
  "json",
] as const satisfies readonly SupportedShikiLanguage[];

const loadedLanguages = new Set<string>();
const loadedThemes = new Set<string>();
const pendingLanguageLoads = new Map<string, Promise<void>>();
const pendingThemeLoads = new Map<string, Promise<void>>();

type HighlighterLanguage = Parameters<HighlighterCore["loadLanguage"]>[0];
type HighlighterTheme = Parameters<HighlighterCore["loadTheme"]>[0];
type TokenWithColor = Pick<ThemedToken, "content" | "color">;

const languageLoaders: Record<SupportedShikiLanguage, () => Promise<HighlighterLanguage>> = {
  javascript: () => import("shiki/langs/javascript.mjs").then((module) => module.default),
  typescript: () => import("shiki/langs/typescript.mjs").then((module) => module.default),
  jsx: () => import("shiki/langs/jsx.mjs").then((module) => module.default),
  tsx: () => import("shiki/langs/tsx.mjs").then((module) => module.default),
  css: () => import("shiki/langs/css.mjs").then((module) => module.default),
  scss: () => import("shiki/langs/scss.mjs").then((module) => module.default),
  sass: () => import("shiki/langs/sass.mjs").then((module) => module.default),
  json: () => import("shiki/langs/json.mjs").then((module) => module.default),
  html: () => import("shiki/langs/html.mjs").then((module) => module.default),
  vue: () => import("shiki/langs/vue.mjs").then((module) => module.default),
  svelte: () => import("shiki/langs/svelte.mjs").then((module) => module.default),
  astro: () => import("shiki/langs/astro.mjs").then((module) => module.default),
  yaml: () => import("shiki/langs/yaml.mjs").then((module) => module.default),
  toml: () => import("shiki/langs/toml.mjs").then((module) => module.default),
  markdown: () => import("shiki/langs/markdown.mjs").then((module) => module.default),
  mdx: () => import("shiki/langs/mdx.mjs").then((module) => module.default),
};

const themeLoaders: Record<SupportedShikiTheme, () => Promise<HighlighterTheme>> = {
  "github-light": () => import("shiki/themes/github-light.mjs").then((module) => module.default),
  "github-dark": () => import("shiki/themes/github-dark.mjs").then((module) => module.default),
};

const languageDependencies: Partial<
  Record<SupportedShikiLanguage, readonly SupportedShikiLanguage[]>
> = {
  scss: ["css"],
  sass: ["css"],
  vue: ["html", "css", "javascript", "typescript"],
  svelte: ["html", "css", "javascript", "typescript"],
  astro: ["html", "css", "javascript", "typescript", "markdown"],
  mdx: ["markdown", "jsx", "javascript", "typescript", "html"],
};

export type WhitespaceKind = "space" | "tab";

export interface HighlightedToken {
  content: string;
  color: string | undefined;
  whitespaceKind: WhitespaceKind | null;
}

export interface SharedHighlighterOptions {
  langs?: readonly SupportedShikiLanguage[];
  themes?: readonly SupportedShikiTheme[];
}

type WarmupConnection = {
  saveData?: boolean;
  effectiveType?: string;
};

function rememberHighlightedLines(key: string, tokens: HighlightedToken[][]): HighlightedToken[][] {
  highlightedTokenCache.delete(key);
  highlightedTokenCache.set(key, tokens);

  if (highlightedTokenCache.size > MAX_HIGHLIGHT_CACHE_SIZE) {
    const oldestKey = highlightedTokenCache.keys().next().value;
    if (oldestKey) {
      highlightedTokenCache.delete(oldestKey);
    }
  }

  return tokens;
}

function beginLoading() {
  activeLoadCount++;
  loading.value = true;
}

function endLoading() {
  activeLoadCount = Math.max(0, activeLoadCount - 1);
  loading.value = activeLoadCount > 0;
}

async function runWithLoading<T>(fn: () => Promise<T>): Promise<T> {
  beginLoading();
  try {
    return await fn();
  } finally {
    endLoading();
  }
}

function splitHighlightedToken(token: TokenWithColor): HighlightedToken[] {
  const parts: HighlightedToken[] = [];
  let textBuffer = "";

  function flushTextBuffer() {
    if (!textBuffer) return;
    parts.push({
      content: textBuffer,
      color: token.color,
      whitespaceKind: null,
    });
    textBuffer = "";
  }

  for (const char of token.content) {
    if (char === " " || char === "\t") {
      flushTextBuffer();
      parts.push({
        content: char,
        color: token.color,
        whitespaceKind: char === "\t" ? "tab" : "space",
      });
      continue;
    }

    textBuffer += char;
  }

  flushTextBuffer();
  return parts;
}

function normalizeTokens(tokens: ThemedToken[][]): HighlightedToken[][] {
  return tokens.map((line) => line.flatMap((token) => splitHighlightedToken(token)));
}

function getThemeName(mode: string): SupportedShikiTheme {
  return mode === "dark" ? "github-dark" : "github-light";
}

async function ensureLanguageLoaded(
  instance: HighlighterCore,
  lang: SupportedShikiLanguage,
): Promise<void> {
  if (loadedLanguages.has(lang)) return;

  const pending = pendingLanguageLoads.get(lang);
  if (pending) {
    await pending;
    return;
  }

  const dependencies = languageDependencies[lang] ?? [];
  const loadPromise = runWithLoading(async () => {
    await ensureLanguagesLoaded(instance, dependencies);
    const language = await languageLoaders[lang]();
    await instance.loadLanguage(language as HighlighterLanguage);
    loadedLanguages.add(lang);
  }).finally(() => {
    pendingLanguageLoads.delete(lang);
  });

  pendingLanguageLoads.set(lang, loadPromise);
  await loadPromise;
}

async function ensureThemeLoaded(
  instance: HighlighterCore,
  theme: SupportedShikiTheme,
): Promise<void> {
  if (loadedThemes.has(theme)) return;

  const pending = pendingThemeLoads.get(theme);
  if (pending) {
    await pending;
    return;
  }

  const loadPromise = runWithLoading(async () => {
    const registration = await themeLoaders[theme]();
    await instance.loadTheme(registration as HighlighterTheme);
    loadedThemes.add(theme);
  }).finally(() => {
    pendingThemeLoads.delete(theme);
  });

  pendingThemeLoads.set(theme, loadPromise);
  await loadPromise;
}

async function ensureLanguagesLoaded(
  instance: HighlighterCore,
  langs: readonly SupportedShikiLanguage[],
): Promise<void> {
  await Promise.all(langs.map((lang) => ensureLanguageLoaded(instance, lang)));
}

async function ensureThemesLoaded(
  instance: HighlighterCore,
  themes: readonly SupportedShikiTheme[],
): Promise<void> {
  await Promise.all(themes.map((theme) => ensureThemeLoaded(instance, theme)));
}

async function getOrCreateHighlighter(): Promise<HighlighterCore> {
  if (highlighter.value) return highlighter.value;

  if (!highlighterPromise) {
    highlighterPromise = runWithLoading(async () => {
      const [{ createHighlighterCore }, { createJavaScriptRegexEngine }] = await Promise.all([
        import("shiki/core"),
        import("shiki/engine/javascript"),
      ]);

      return createHighlighterCore({
        themes: [],
        langs: [],
        engine: createJavaScriptRegexEngine(),
      });
    })
      .then((instance) => {
        highlighter.value = instance;
        return instance;
      })
      .catch((error) => {
        highlighterPromise = null;
        throw error;
      });
  }

  return highlighterPromise;
}

export async function getSharedHighlighter(
  options: SharedHighlighterOptions = {},
): Promise<HighlighterCore> {
  const { langs = [], themes = [] } = options;
  const instance = await getOrCreateHighlighter();
  if (langs.length > 0) {
    await ensureLanguagesLoaded(instance, langs);
  }
  if (themes.length > 0) {
    await ensureThemesLoaded(instance, themes);
  }
  return instance;
}

export async function prewarmCommonHighlighterAssets(): Promise<void> {
  await getSharedHighlighter({
    langs: commonPrewarmLanguages,
    themes: supportedShikiThemes,
  });
}

function shouldSkipCommonHighlighterPrewarm(): boolean {
  if (typeof navigator === "undefined" || !("connection" in navigator)) return false;

  const connection = navigator.connection as WarmupConnection | undefined;
  return !!connection?.saveData || connection?.effectiveType === "slow-2g";
}

export function scheduleCommonHighlighterPrewarm(): () => void {
  if (typeof window === "undefined" || shouldSkipCommonHighlighterPrewarm()) {
    return () => {};
  }

  let warmupTimer = 0;
  let warmupIdleId: number | null = null;
  let cancelled = false;

  const runWarmup = () => {
    warmupIdleId = null;
    warmupTimer = 0;
    if (cancelled) return;
    void prewarmCommonHighlighterAssets();
  };

  if ("requestIdleCallback" in window) {
    warmupIdleId = window.requestIdleCallback(runWarmup, { timeout: 1500 });
  } else {
    warmupTimer = setTimeout(runWarmup, 1200);
  }

  return () => {
    cancelled = true;
    if (warmupIdleId !== null && "cancelIdleCallback" in window) {
      window.cancelIdleCallback(warmupIdleId);
    }
    clearTimeout(warmupTimer);
  };
}

export function useHighlighter() {
  const { resolvedTheme } = useTheme();

  async function init(options: SharedHighlighterOptions = {}) {
    await getSharedHighlighter(options);
  }

  function tokenizeLines(code: string, lang: SupportedShikiLanguage): HighlightedToken[][] {
    const themeName = getThemeName(resolvedTheme.value);
    if (!highlighter.value || !loadedLanguages.has(lang) || !loadedThemes.has(themeName)) return [];
    const cacheKey = `${themeName}:${lang}:${code}`;
    const cached = highlightedTokenCache.get(cacheKey);
    if (cached) {
      highlightedTokenCache.delete(cacheKey);
      highlightedTokenCache.set(cacheKey, cached);
      return cached;
    }

    return rememberHighlightedLines(
      cacheKey,
      normalizeTokens(
        highlighter.value.codeToTokensBase(code, {
          lang,
          theme: themeName,
        }),
      ),
    );
  }

  return {
    loading,
    init,
    tokenizeLines,
    detectLanguage,
    supportedShikiLanguages,
    supportedShikiThemes,
  };
}
