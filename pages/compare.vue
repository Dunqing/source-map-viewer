<script setup lang="ts">
import { ref, onMounted } from "vue";
import { resolveSlug, type ShareableData } from "../src/composables/useShareableUrl";
import { useTheme } from "../src/composables/useTheme";
import CompareView from "../src/pages/CompareView.vue";
import CompareLanding from "../src/pages/CompareLanding.vue";

useTheme();

interface CompareEntry extends ShareableData {
  label: string;
}

const entryA = ref<CompareEntry | null>(null);
const entryB = ref<CompareEntry | null>(null);
const prefilledA = ref<CompareEntry | null>(null);
const slugA = ref<string | null>(null);
const slugB = ref<string | null>(null);
const loading = ref(false);
const error = ref<string | null>(null);
const resolved = ref(false);

function formatCompareLabel(prefix: "A" | "B", slug: string): string {
  return `${prefix} (${slug.slice(0, 8)}...)`;
}

async function resolveCompareEntry(prefix: "A" | "B", slug: string): Promise<CompareEntry> {
  const data = await resolveSlug(slug);
  if (!data) {
    throw new Error(`Failed to load source map ${prefix} (${slug})`);
  }
  return { ...data, label: formatCompareLabel(prefix, slug) };
}

onMounted(async () => {
  document.documentElement.classList.remove("has-share-slug");

  const params = new URLSearchParams(window.location.search);
  slugA.value = params.get("a");
  slugB.value = params.get("b");

  if (!slugA.value && !slugB.value) {
    resolved.value = true;
    return;
  }

  loading.value = true;
  error.value = null;

  try {
    if (slugA.value && slugB.value) {
      [entryA.value, entryB.value] = await Promise.all([
        resolveCompareEntry("A", slugA.value),
        resolveCompareEntry("B", slugB.value),
      ]);
    } else if (slugA.value) {
      prefilledA.value = await resolveCompareEntry("A", slugA.value);
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Failed to load source maps";
  } finally {
    loading.value = false;
    resolved.value = true;
  }
});
</script>

<template>
  <!-- Loading state -->
  <div v-if="loading" class="min-h-screen flex items-center justify-center bg-base">
    <div class="text-center">
      <div class="i-carbon-circle-dash w-8 h-8 animate-spin text-fg-muted mx-auto mb-3" />
      <p class="text-sm text-fg-muted">Loading source maps...</p>
    </div>
  </div>

  <!-- Error state -->
  <div v-else-if="error" class="min-h-screen flex items-center justify-center bg-base p-4">
    <div class="max-w-md w-full">
      <div
        class="rounded-lg bg-red-50 dark:bg-red-900/20 p-4 text-red-700 dark:text-red-400 text-sm"
      >
        {{ error }}
      </div>
      <a href="/" class="mt-4 block text-center text-sm text-fg-muted hover:text-fg-dim transition">
        Back to home
      </a>
    </div>
  </div>

  <!-- Comparison view -->
  <CompareView
    v-else-if="entryA && entryB"
    :entry-a="entryA"
    :entry-b="entryB"
    :slug-a="slugA ?? undefined"
    :slug-b="slugB ?? undefined"
  />

  <!-- Landing: file upload -->
  <CompareLanding v-else-if="resolved" :prefilled-a="prefilledA" :slug-a="slugA ?? undefined" />
</template>
