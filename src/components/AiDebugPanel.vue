<script setup lang="ts">
import { ref, onMounted } from "vue";
import MarkdownIt from "markdown-it";
import IconCopy from "~icons/carbon/copy";
import IconCheckmark from "~icons/carbon/checkmark";
import IconClose from "~icons/carbon/close";
import { useAiDebugPrompt } from "../composables/useAiDebugPrompt";

const { prompt } = useAiDebugPrompt();
const copied = ref(false);
const renderedHtml = ref("");

const md = new MarkdownIt({ html: false });

onMounted(async () => {
  const { fromHighlighter } = await import("@shikijs/markdown-it");
  const { createHighlighterCore } = await import("shiki/core");
  const { createJavaScriptRegexEngine } = await import("shiki/engine/javascript");
  const [githubLight, githubDark, javascript, typescript, tsx, jsx, css] = await Promise.all([
    import("shiki/themes/github-light.mjs").then((m) => m.default),
    import("shiki/themes/github-dark.mjs").then((m) => m.default),
    import("shiki/langs/javascript.mjs").then((m) => m.default),
    import("shiki/langs/typescript.mjs").then((m) => m.default),
    import("shiki/langs/tsx.mjs").then((m) => m.default),
    import("shiki/langs/jsx.mjs").then((m) => m.default),
    import("shiki/langs/css.mjs").then((m) => m.default),
  ]);
  const highlighter = await createHighlighterCore({
    themes: [githubLight, githubDark],
    langs: [javascript, typescript, tsx, jsx, css],
    engine: createJavaScriptRegexEngine(),
  });
  md.use(fromHighlighter(highlighter, { themes: { light: "github-light", dark: "github-dark" } }));
  renderedHtml.value = md.render(prompt.value);
});

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
      <div class="flex items-center justify-between px-4 py-3 border-b border-edge">
        <h2 class="text-sm font-semibold">AI Debug Prompt</h2>
        <div class="flex items-center gap-2">
          <span class="text-xs text-fg-muted"
            >Tip: AI tools like Claude Code and Codex get this automatically when fetching the
            shared URL</span
          >
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
.prose table {
  display: block;
  overflow-x: auto;
  white-space: nowrap;
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
