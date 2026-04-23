<script setup lang="ts">
import { ref, watch } from "vue";
import MarkdownIt from "markdown-it";
import { transformerMetaHighlight } from "@shikijs/transformers";
import IconCopy from "~icons/carbon/copy";
import IconCheckmark from "~icons/carbon/checkmark";
import IconClose from "~icons/carbon/close";
import IconLightbulb from "~icons/carbon/idea";
import { useAiDebugPrompt } from "../composables/useAiDebugPrompt";
import { getSharedHighlighter, supportedShikiThemes } from "../composables/useHighlighter";
import { isSupportedShikiLanguage, type SupportedShikiLanguage } from "../core/language";

const { prompt } = useAiDebugPrompt();
const copied = ref(false);
const renderedHtml = ref("");
let markdownRendererPromise: Promise<MarkdownIt> | null = null;
let renderRequestId = 0;

const markdownHighlighterLanguages = [
  "jsx",
  "tsx",
] as const satisfies readonly SupportedShikiLanguage[];

function extractMarkdownFenceLanguages(markdownSource: string): SupportedShikiLanguage[] {
  const found = new Set<SupportedShikiLanguage>(markdownHighlighterLanguages);

  for (const match of markdownSource.matchAll(/^```([^\s{]+)/gm)) {
    const language = match[1]?.toLowerCase();
    if (language && isSupportedShikiLanguage(language)) {
      found.add(language);
    }
  }

  return [...found];
}

async function getMarkdownRenderer(): Promise<MarkdownIt> {
  if (!markdownRendererPromise) {
    markdownRendererPromise = (async () => {
      const { fromHighlighter } = await import("@shikijs/markdown-it/core");
      const highlighter = await getSharedHighlighter();
      const markdown = new MarkdownIt({ html: false });

      markdown.use(
        fromHighlighter(highlighter, {
          themes: { light: "github-light", dark: "github-dark" },
          defaultLanguage: "text",
          fallbackLanguage: "text",
          transformers: [transformerMetaHighlight()],
        }),
      );

      return markdown;
    })().catch((error) => {
      markdownRendererPromise = null;
      throw error;
    });
  }

  return markdownRendererPromise;
}

async function renderPrompt(markdownSource: string) {
  const requestId = ++renderRequestId;
  try {
    await getSharedHighlighter({
      langs: extractMarkdownFenceLanguages(markdownSource),
      themes: supportedShikiThemes,
    });
    const markdown = await getMarkdownRenderer();
    const html = markdown.render(markdownSource);
    if (requestId === renderRequestId) {
      renderedHtml.value = html;
    }
  } catch {
    if (requestId === renderRequestId) {
      renderedHtml.value = "";
    }
  }
}

watch(
  prompt,
  (value) => {
    if (typeof window === "undefined") return;
    void renderPrompt(value);
  },
  { immediate: true },
);

const emit = defineEmits<{ close: [] }>();

function copyPrompt() {
  navigator.clipboard.writeText(prompt.value).then(() => {
    copied.value = true;
    setTimeout(() => {
      copied.value = false;
    }, 2000);
  });
}
</script>

<template>
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
    @click.self="emit('close')"
  >
    <div class="bg-surface rounded-lg shadow-xl w-[800px] max-h-[80vh] flex flex-col">
      <div class="px-4 py-3 border-b border-edge">
        <div class="flex items-center justify-between">
          <h2 class="text-sm font-semibold">AI Debug Prompt</h2>
          <div class="flex items-center gap-2">
            <button
              class="flex items-center gap-1 px-3 py-1.5 rounded text-xs font-medium bg-blue-600 text-white hover:bg-blue-700 transition"
              @click="copyPrompt"
            >
              <IconCheckmark v-if="copied" class="w-4 h-4" />
              <IconCopy v-else class="w-4 h-4" />
              {{ copied ? "Copied!" : "Copy to clipboard" }}
            </button>
            <button class="p-1 rounded hover:bg-surface" @click="emit('close')">
              <IconClose class="w-4 h-4" />
            </button>
          </div>
        </div>
        <p
          class="flex items-center gap-1.5 text-xs text-fg-muted mt-2 px-2 py-1.5 rounded bg-muted"
        >
          <IconLightbulb class="w-3.5 h-3.5 shrink-0 text-amber-500" />
          Share a URL and AI tools (Claude Code, Codex) will fetch this prompt automatically
        </p>
      </div>
      <div
        v-if="renderedHtml"
        class="flex-1 overflow-auto p-4 prose prose-sm dark:prose-invert max-w-none"
        v-html="renderedHtml"
      />
      <div v-else class="flex-1 overflow-auto p-4">
        <pre class="text-xs font-mono whitespace-pre-wrap text-fg-dim">{{ prompt }}</pre>
      </div>
    </div>
  </div>
</template>

<style>
/* Unscoped — needs html.dark ancestor selector for Shiki dark-mode switching */
.prose .shiki {
  background-color: var(--c-bg-mute) !important;
  border: 1px solid var(--c-border);
  border-radius: 0.375rem;
  padding: 0.75rem 1rem;
  overflow: auto;
}
.prose .shiki code {
  background: transparent !important;
}
.prose .shiki .line.highlighted {
  background-color: rgba(245, 158, 11, 0.12);
  box-shadow: inset 3px 0 0 rgba(245, 158, 11, 0.9);
}
.prose :not(pre) > code {
  background-color: var(--c-bg-mute);
  padding: 0.15em 0.35em;
  border-radius: 0.25rem;
}
html.dark .prose .shiki,
html.dark .prose .shiki span {
  color: var(--shiki-dark) !important;
}
html.dark .prose .shiki {
  background-color: var(--c-bg-mute) !important;
}
html.dark .prose .shiki .line.highlighted {
  background-color: rgba(250, 204, 21, 0.12);
  box-shadow: inset 3px 0 0 rgba(250, 204, 21, 0.85);
}
.prose table {
  width: max-content;
  font-size: 0.75rem;
  border-collapse: collapse;
}
.prose table th,
.prose table td {
  padding: 0.25rem 0.5rem;
  border: 1px solid var(--c-border);
  white-space: nowrap;
}
.prose table code {
  white-space: pre;
}
</style>
