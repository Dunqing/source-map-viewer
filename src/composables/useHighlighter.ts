import { shallowRef } from "vue";
import { transformerRenderWhitespace } from "@shikijs/transformers";
import { createHighlighterCore, type HighlighterCore } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";
import githubLight from "shiki/themes/github-light.mjs";
import githubDark from "shiki/themes/github-dark.mjs";
import javascript from "shiki/langs/javascript.mjs";
import typescript from "shiki/langs/typescript.mjs";
import css from "shiki/langs/css.mjs";
import json from "shiki/langs/json.mjs";
import { useTheme } from "./useTheme";
import { detectLanguage } from "../core/language";

const highlighter = shallowRef<HighlighterCore | null>(null);
const loading = shallowRef(true);
const whitespaceTransformer = transformerRenderWhitespace();

export type WhitespaceKind = "space" | "tab";

type HastNode = {
  type: string;
  tagName?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
  value?: string;
};

export interface HighlightedToken {
  content: string;
  color: string | undefined;
  whitespaceKind: WhitespaceKind | null;
}

function getClassList(value: unknown): string[] {
  if (typeof value === "string") {
    return value.split(/\s+/).filter(Boolean);
  }
  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === "string");
  }
  return [];
}

function getTextContent(node: HastNode): string {
  if (node.type === "text") return node.value ?? "";
  return (node.children ?? []).map(getTextContent).join("");
}

function getWhitespaceKind(node: HastNode): WhitespaceKind | null {
  const classes = getClassList(node.properties?.class);
  if (classes.includes("tab")) return "tab";
  if (classes.includes("space")) return "space";
  return null;
}

function getInlineColor(style: unknown): string | undefined {
  if (typeof style !== "string") return undefined;
  const match = style.match(/(?:^|;)\s*color:([^;]+)/);
  return match ? match[1].trim() : undefined;
}

function parseHighlightedLines(root: HastNode): HighlightedToken[][] {
  const pre = root.children?.find((node) => node.type === "element" && node.tagName === "pre");
  const code = pre?.children?.find((node) => node.type === "element" && node.tagName === "code");
  if (!code) return [];

  const lines: HighlightedToken[][] = [];
  for (const child of code.children ?? []) {
    if (child.type !== "element" || child.tagName !== "span") continue;
    if (!getClassList(child.properties?.class).includes("line")) continue;

    const lineTokens: HighlightedToken[] = [];
    for (const token of child.children ?? []) {
      if (token.type !== "element" || token.tagName !== "span") continue;
      const content = getTextContent(token);
      if (!content) continue;
      lineTokens.push({
        content,
        color: getInlineColor(token.properties?.style),
        whitespaceKind: getWhitespaceKind(token),
      });
    }
    lines.push(lineTokens);
  }

  return lines;
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

  function tokenizeLines(code: string, lang: string): HighlightedToken[][] {
    if (!highlighter.value) return [];
    const themeName = resolvedTheme.value === "dark" ? "github-dark" : "github-light";
    return parseHighlightedLines(
      highlighter.value.codeToHast(code, {
        lang,
        theme: themeName,
        transformers: [whitespaceTransformer],
      }) as HastNode,
    );
  }

  return { loading, init, tokenizeLines, detectLanguage };
}
