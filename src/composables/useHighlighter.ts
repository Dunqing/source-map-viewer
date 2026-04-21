import { shallowRef } from "vue";
import { createHighlighterCore, type HighlighterCore, type ThemedToken } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";
import githubLight from "shiki/themes/github-light.mjs";
import githubDark from "shiki/themes/github-dark.mjs";
import javascript from "shiki/langs/javascript.mjs";
import typescript from "shiki/langs/typescript.mjs";
import css from "shiki/langs/css.mjs";
import json from "shiki/langs/json.mjs";
import { useTheme } from "./useTheme";

const highlighter = shallowRef<HighlighterCore | null>(null);
const loading = shallowRef(true);

export function detectLanguage(filename: string): string {
  if (filename.endsWith(".ts") || filename.endsWith(".tsx")) return "typescript";
  if (filename.endsWith(".css") || filename.endsWith(".scss")) return "css";
  if (filename.endsWith(".json") || filename.endsWith(".map")) return "json";
  return "javascript";
}

export function useHighlighter() {
  const { resolvedTheme } = useTheme();

  async function init() {
    if (highlighter.value) return;
    loading.value = true;
    highlighter.value = await createHighlighterCore({
      themes: [githubLight, githubDark],
      langs: [javascript, typescript, css, json],
      engine: createJavaScriptRegexEngine(),
    });
    loading.value = false;
  }

  function tokenizeLines(code: string, lang: string): ThemedToken[][] {
    if (!highlighter.value) return [];
    const themeName = resolvedTheme.value === "dark" ? "github-dark" : "github-light";
    return highlighter.value.codeToTokensBase(code, { lang, theme: themeName });
  }

  return { highlighter, loading, init, tokenizeLines, detectLanguage };
}
