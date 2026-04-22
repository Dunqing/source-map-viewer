<script setup lang="ts">
import { ref } from "vue";
import IconArrowLeft from "~icons/carbon/arrow-left";

interface CompareEntry {
  generatedCode: string;
  sourceMapJson: string;
  label: string;
}

const props = defineProps<{
  prefilledA?: CompareEntry | null;
  slugA?: string;
}>();

const emit = defineEmits<{
  compare: [entryA: CompareEntry, entryB: CompareEntry];
}>();

const urlA = ref("");
const urlB = ref("");
const error = ref<string | null>(null);
const loading = ref(false);

function extractSlug(input: string): string {
  const trimmed = input.trim();
  // Full URL: extract last path segment
  try {
    const url = new URL(trimmed);
    return url.pathname.slice(1); // remove leading /
  } catch {}
  // Bare slug
  return trimmed;
}

async function handleCompare() {
  error.value = null;
  const slugA = props.prefilledA ? "" : extractSlug(urlA.value);
  const slugB = extractSlug(urlB.value);

  if (!props.prefilledA && !slugA) {
    error.value = "Please enter URL A";
    return;
  }
  if (!slugB) {
    error.value = "Please enter URL B";
    return;
  }

  if (props.prefilledA) {
    // Preserve the existing ?a slug from the URL
    const currentSlugA = props.slugA ?? "";
    window.location.href = `/compare?a=${currentSlugA}&b=${slugB}`;
    return;
  }

  window.location.href = `/compare?a=${slugA}&b=${slugB}`;
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-base p-4">
    <div class="max-w-lg w-full space-y-6">
      <a
        href="/"
        class="flex items-center gap-1 text-sm text-fg-muted hover:text-fg-dim transition"
      >
        <IconArrowLeft class="w-4 h-4" />
        Back to home
      </a>

      <div class="text-center">
        <h1 class="text-2xl font-bold tracking-tight text-fg mb-1">Compare Source Maps</h1>
        <p class="text-sm font-mono text-fg-muted">
          {{
            prefilledA
              ? "Enter a second URL to compare against"
              : "Paste two viewer URLs to diff their mappings"
          }}
        </p>
        <p v-if="!prefilledA" class="text-xs text-fg-muted mt-2">
          Tip: you can also click Compare in the visualization toolbar to pre-fill URL A
        </p>
      </div>

      <div
        v-if="error"
        class="rounded-lg bg-red-50 dark:bg-red-900/20 p-3 text-red-700 dark:text-red-400 text-sm"
      >
        {{ error }}
      </div>

      <div class="space-y-3">
        <!-- URL A -->
        <div>
          <label class="text-xs uppercase tracking-widest font-semibold text-fg-muted mb-1.5 block">
            URL A
          </label>
          <div
            v-if="prefilledA"
            class="rounded-lg border border-green-500 dark:border-green-400 bg-surface px-3 py-2 text-sm font-mono text-fg-dim"
          >
            {{ prefilledA.label }}
          </div>
          <input
            v-else
            v-model="urlA"
            class="w-full rounded-lg border border-edge bg-muted px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="https://source-map-viewer.void.app/abc123 or just abc123"
            @keydown.enter="handleCompare"
          />
        </div>

        <!-- URL B -->
        <div>
          <label class="text-xs uppercase tracking-widest font-semibold text-fg-muted mb-1.5 block">
            URL B
          </label>
          <input
            v-model="urlB"
            class="w-full rounded-lg border border-edge bg-muted px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="https://source-map-viewer.void.app/xyz789 or just xyz789"
            @keydown.enter="handleCompare"
          />
          <p class="text-xs text-fg-muted mt-1">
            Open another source map in the viewer, click Share, then paste the URL here
          </p>
        </div>
      </div>

      <button
        class="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
        :disabled="loading || (!prefilledA && !urlA.trim()) || !urlB.trim()"
        @click="handleCompare"
      >
        Compare
      </button>
    </div>
  </div>
</template>
