<script setup lang="ts">
import { ref } from "vue";
import IconUpload from "~icons/carbon/upload";
import IconPaste from "~icons/carbon/paste";
import IconLink from "~icons/carbon/link";
import IconCircleDash from "~icons/carbon/circle-dash";
import IconLogoGithub from "~icons/carbon/logo-github";
import IconTrashCan from "~icons/carbon/trash-can";
import IconArrowRight from "~icons/carbon/arrow-right";
import { useSourceMapStore } from "../stores/sourceMap";
import { useFileLoader } from "../composables/useFileLoader";
import { compressToHash } from "../composables/useShareableUrl";
import { useTheme } from "../composables/useTheme";
import { useHistory } from "../composables/useHistory";
import { exampleSources, type ExampleSource } from "../examples";
import { APP_NAME } from "../constants";
import FileDropZone from "../components/FileDropZone.vue";
import ExamplePreview from "../components/ExamplePreview.vue";

const store = useSourceMapStore();
const { loadFromFiles, loadFromText, loadFromUrl } = useFileLoader();
const {
  entries: historyEntries,
  loading: historyLoading,
  addEntry: addHistoryEntry,
  clearHistory,
} = useHistory();
useTheme();

const showPaste = ref(false);
const showUrl = ref(false);
const pasteContent = ref("");
const urlInput = ref("");
const error = ref<string | null>(null);
const loading = ref(false);

async function navigateWithData(generatedCode: string, sourceMapJson: string, label: string) {
  store.loadSourceMap(generatedCode, sourceMapJson);
  if (store.error) throw new Error(store.error);

  // Create short URL via API, fall back to inline hash
  let path: string;
  try {
    const res = await fetch("/api/share", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ generatedCode, sourceMapJson }),
    });
    if (!res.ok) throw new Error();
    const { id } = await res.json();
    path = `/${id}`;
  } catch {
    const hash = await compressToHash({ generatedCode, sourceMapJson });
    path = `/${hash}`;
  }

  addHistoryEntry({ label, hash: path.slice(1), timestamp: Date.now() });
  window.history.pushState(null, "", path);
  window.dispatchEvent(new CustomEvent("smv-navigate"));
}

async function handleFiles(files: File[]) {
  try {
    error.value = null;
    loading.value = true;
    const result = await loadFromFiles(files);
    const label = files.map((f) => f.name).join(" + ");
    await navigateWithData(result.generatedCode, result.sourceMapJson, label);
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Failed to load files";
  } finally {
    loading.value = false;
  }
}

async function handlePaste() {
  try {
    error.value = null;
    loading.value = true;
    const result = await loadFromText(pasteContent.value);
    await navigateWithData(result.generatedCode, result.sourceMapJson, "Pasted code");
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Failed to parse pasted content";
  } finally {
    loading.value = false;
  }
}

async function handleUrl() {
  try {
    error.value = null;
    loading.value = true;
    const result = await loadFromUrl(urlInput.value);
    const label = new URL(urlInput.value).pathname.split("/").pop() || urlInput.value;
    await navigateWithData(result.generatedCode, result.sourceMapJson, label);
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Failed to fetch URL";
  } finally {
    loading.value = false;
  }
}

async function loadExample(source: ExampleSource, transformer: string) {
  const data = source.transformers[transformer];
  if (!data) return;
  await navigateWithData(data.generatedCode, data.sourceMapJson, `${source.name} · ${transformer}`);
}

function loadFromHistory(entry: { hash: string }) {
  window.history.pushState(null, "", `/${entry.hash}`);
  window.dispatchEvent(new CustomEvent("smv-navigate"));
}

function openFileDialog() {
  const input = document.createElement("input");
  input.type = "file";
  input.multiple = true;
  input.accept = ".js,.ts,.css,.map,.json";
  input.onchange = () => {
    if (input.files) handleFiles(Array.from(input.files));
  };
  input.click();
}

function getFirstGeneratedCode(source: ExampleSource): string {
  const first = Object.values(source.transformers)[0];
  return first?.generatedCode ?? "";
}

function formatTimeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-base p-4">
    <FileDropZone @drop="handleFiles" />

    <div class="max-w-lg w-full space-y-6">
      <!-- Header -->
      <div class="text-center">
        <div class="flex items-center justify-center gap-2 mb-1">
          <img src="/logo.svg" alt="Logo" class="h-6 w-6" />
          <h1 class="text-2xl font-bold tracking-tight text-fg">
            {{ APP_NAME }}
          </h1>
        </div>
        <p class="text-sm font-mono text-fg-muted">
          Inspect and debug source map mappings, visually
        </p>
      </div>

      <!-- Error -->
      <div
        v-if="error"
        class="rounded-lg bg-red-50 dark:bg-red-900/20 p-4 text-red-700 dark:text-red-400 text-sm"
      >
        {{ error }}
      </div>

      <!-- Drop Zone -->
      <div class="rounded-xl border-2 border-dashed border-edge bg-surface p-6 text-center">
        <p class="text-sm text-fg-muted mb-3">
          Drop your
          <code class="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">.js</code>
          <code class="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">.css</code>
          or
          <code class="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">.map</code>
          files here
        </p>
        <div class="flex items-center justify-center gap-2">
          <button
            class="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-edge text-sm text-fg-dim hover:bg-surface transition"
            @click="openFileDialog"
          >
            <IconUpload class="w-4 h-4" />
            Upload
          </button>
          <button
            class="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-edge text-sm text-fg-dim hover:bg-surface transition"
            @click="
              showPaste = !showPaste;
              showUrl = false;
            "
          >
            <IconPaste class="w-4 h-4" />
            Paste
          </button>
          <button
            class="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-edge text-sm text-fg-dim hover:bg-surface transition"
            @click="
              showUrl = !showUrl;
              showPaste = false;
            "
          >
            <IconLink class="w-4 h-4" />
            URL
          </button>
        </div>
      </div>

      <!-- Loading -->
      <div v-if="loading" class="flex items-center justify-center gap-2 text-sm text-fg-muted">
        <IconCircleDash class="w-4 h-4 animate-spin" />
        Loading source map...
      </div>

      <!-- Paste panel -->
      <div v-if="showPaste" class="space-y-2">
        <textarea
          v-model="pasteContent"
          class="w-full h-40 rounded-lg border border-edge bg-muted p-3 text-sm font-mono resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Paste generated code with an inline sourceMappingURL, or raw source map JSON..."
        />
        <button
          class="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition disabled:opacity-50"
          :disabled="!pasteContent || loading"
          @click="handlePaste"
        >
          Visualize
        </button>
      </div>

      <!-- URL panel -->
      <div v-if="showUrl" class="space-y-2">
        <input
          v-model="urlInput"
          class="w-full rounded-lg border border-edge bg-muted px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="https://cdn.example.com/bundle.min.js or .map"
          @keydown.enter="handleUrl"
        />
        <button
          class="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition disabled:opacity-50"
          :disabled="!urlInput || loading"
          @click="handleUrl"
        >
          Fetch & Visualize
        </button>
      </div>

      <!-- Recent History: skeleton during SSR, real content on client -->
      <div v-if="historyLoading">
        <span class="text-xs uppercase tracking-widest font-semibold text-fg-muted mb-2 block"
          >Recent</span
        >
        <div class="space-y-1">
          <div
            v-for="i in 2"
            :key="i"
            class="w-full h-10 rounded-lg border border-edge bg-surface animate-pulse"
          />
        </div>
      </div>
      <div v-else-if="historyEntries.length > 0">
        <div class="flex items-center justify-between mb-2">
          <span class="text-xs uppercase tracking-widest font-semibold text-fg-muted">Recent</span>
          <button
            class="text-xs text-fg-muted hover:text-fg-dim transition flex items-center gap-1"
            @click="clearHistory"
          >
            <IconTrashCan class="w-3 h-3" />
            Clear
          </button>
        </div>
        <div class="space-y-1">
          <button
            v-for="entry in historyEntries"
            :key="entry.hash"
            class="w-full flex items-center justify-between px-3 py-2 rounded-lg border border-edge bg-surface hover:bg-surface transition text-left"
            @click="loadFromHistory(entry)"
          >
            <span class="font-mono text-sm text-fg-dim truncate">{{ entry.label }}</span>
            <span class="text-xs text-fg-muted shrink-0 ml-2">{{
              formatTimeAgo(entry.timestamp)
            }}</span>
          </button>
        </div>
      </div>

      <!-- Examples -->
      <div>
        <span class="text-xs uppercase tracking-widest font-semibold text-fg-muted mb-2 block"
          >Examples</span
        >
        <div class="space-y-2">
          <div
            v-for="source in exampleSources"
            :key="source.name"
            class="flex items-center gap-3 rounded-lg border border-edge bg-surface p-3 hover:bg-surface transition"
          >
            <ExamplePreview :code="getFirstGeneratedCode(source)" />
            <div class="flex-1 min-w-0">
              <p class="text-sm font-semibold text-fg">{{ source.name }}</p>
              <p class="text-xs text-fg-muted mb-1.5">
                {{ source.description }}
              </p>
              <div class="flex flex-wrap gap-1.5">
                <button
                  v-for="transformer in Object.keys(source.transformers)"
                  :key="transformer"
                  class="rounded px-2 py-0.5 text-xs font-mono bg-muted text-fg-dim hover:bg-muted transition"
                  @click="loadExample(source, transformer)"
                >
                  {{ transformer }}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- How it works -->
      <div>
        <span class="text-xs uppercase tracking-widest font-semibold text-fg-muted mb-2 block"
          >How it works</span
        >
        <div class="space-y-1.5 text-sm text-fg-muted">
          <div class="flex items-baseline gap-2">
            <IconArrowRight class="w-3 h-3 shrink-0 mt-0.5 text-fg-muted" />
            <span>View generated and original code side by side</span>
          </div>
          <div class="flex items-baseline gap-2">
            <IconArrowRight class="w-3 h-3 shrink-0 mt-0.5 text-fg-muted" />
            <span>Hover any segment to trace its mapping across files</span>
          </div>
          <div class="flex items-baseline gap-2">
            <IconArrowRight class="w-3 h-3 shrink-0 mt-0.5 text-fg-muted" />
            <span>Spot broken, missing, or suspicious mapping entries</span>
          </div>
        </div>
      </div>

      <!-- Compare -->
      <a
        href="/compare"
        class="block rounded-xl border border-edge bg-surface p-4 hover:bg-muted transition"
      >
        <span class="text-sm font-semibold text-fg">Compare Source Maps</span>
        <p class="text-xs text-fg-muted mt-1">
          Diff two source maps to see which mappings changed, were added, or removed
        </p>
      </a>

      <!-- Footer -->
      <div
        class="border-t border-edge pt-4 flex items-center justify-between text-xs text-fg-muted"
      >
        <a
          href="https://github.com/Dunqing/source-map-viewer"
          target="_blank"
          rel="noopener"
          class="flex items-center gap-1 hover:text-fg-dim transition"
        >
          <IconLogoGithub class="w-4 h-4" />
          GitHub
        </a>
        <span class="font-mono"
          >Built to improve
          <a
            href="https://github.com/oxc-project/oxc"
            target="_blank"
            rel="noopener"
            class="hover:text-fg-dim underline transition"
            >Oxc</a
          >
          source map quality</span
        >
      </div>
    </div>
  </div>
</template>
