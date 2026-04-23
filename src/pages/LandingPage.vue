<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";
import IconUpload from "~icons/carbon/upload";
import IconChevronDown from "~icons/carbon/chevron-down";
import IconPaste from "~icons/carbon/paste";
import IconLink from "~icons/carbon/link";
import IconCircleDash from "~icons/carbon/circle-dash";
import IconLogoGithub from "~icons/carbon/logo-github";
import IconTrashCan from "~icons/carbon/trash-can";
import IconArrowRight from "~icons/carbon/arrow-right";
import type { ResolvedFileCollection } from "../core/inputResolver";
import { useSourceMapStore } from "../stores/sourceMap";
import { useFileLoader } from "../composables/useFileLoader";
import { formatMultiEntryHistoryLabel } from "../composables/historyLabels";
import { compressToHash } from "../composables/useShareableUrl";
import { useTheme } from "../composables/useTheme";
import { useHistory } from "../composables/useHistory";
import {
  cacheSessionCollection,
  getCachedSessionCollection,
} from "../composables/useSessionCollectionCache";
import { exampleSources, type ExampleSource } from "../examples";
import { APP_NAME } from "../constants";
import FileDropZone from "../components/FileDropZone.vue";
import ExamplePreview from "../components/ExamplePreview.vue";

const store = useSourceMapStore();
const { loadFileEntries, loadFromText, loadFromUrl } = useFileLoader();
const {
  entries: historyEntries,
  loading: historyLoading,
  addEntry: addHistoryEntry,
  clearHistory,
} = useHistory();
useTheme();

const showPaste = ref(false);
const showUrl = ref(false);
const showUploadMenu = ref(false);
const pasteContent = ref("");
const urlInput = ref("");
const error = ref<string | null>(null);
const loading = ref(false);
const uploadMenuRef = ref<HTMLElement | null>(null);
const preferredExampleTransformerOrder = ["oxc", "rolldown"] as const;

function getPrimaryEntry(entries: ResolvedFileCollection[]): ResolvedFileCollection {
  const entry = entries[0];
  if (!entry) {
    throw new Error("No source map entrypoints found.");
  }
  return entry;
}

function getUploadRootLabel(files: File[]): string | null {
  const relativePaths = files
    .map((file) =>
      "webkitRelativePath" in file && typeof file.webkitRelativePath === "string"
        ? file.webkitRelativePath
        : "",
    )
    .filter(Boolean);

  if (relativePaths.length !== files.length || relativePaths.length === 0) {
    return null;
  }

  const firstSegment = relativePaths[0]?.split("/")[0];
  if (!firstSegment) return null;

  return relativePaths.every((path) => path.split("/")[0] === firstSegment) ? firstSegment : null;
}

function getHistoryLabel(
  label: string,
  sessionEntries?: ResolvedFileCollection[],
  sessionLabel?: string,
  activeIndex = 0,
): string {
  if (!sessionEntries || sessionEntries.length <= 1) {
    return label;
  }

  const activeEntry = sessionEntries[activeIndex];
  return formatMultiEntryHistoryLabel(
    sessionLabel ?? label,
    activeEntry?.entryPath ?? activeEntry?.label ?? "",
    sessionEntries.length,
  );
}

async function createSharePath(generatedCode: string, sourceMapJson: string): Promise<string> {
  try {
    const res = await fetch("/api/share", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ generatedCode, sourceMapJson }),
    });
    if (!res.ok) throw new Error();
    const { id } = await res.json();
    return `/${id}`;
  } catch {
    const slug = await compressToHash({ generatedCode, sourceMapJson });
    return `/${slug}`;
  }
}

async function navigateWithData(
  data: { generatedCode: string; sourceMapJson: string },
  label: string,
  sessionEntries?: ResolvedFileCollection[],
  sessionLabel?: string,
) {
  const path = await createSharePath(data.generatedCode, data.sourceMapJson);
  if (sessionEntries && sessionEntries.length > 1) {
    const slug = path.slice(1);
    cacheSessionCollection(slug, sessionEntries);
    store.loadSourceMapCollection(sessionEntries, 0, slug, sessionLabel ?? label);
  } else {
    store.loadSourceMap(data.generatedCode, data.sourceMapJson);
  }
  if (store.error) throw new Error(store.error);

  addHistoryEntry({
    label: getHistoryLabel(label, sessionEntries, sessionLabel),
    slug: path.slice(1),
    timestamp: Date.now(),
    sessionLabel,
  });
  window.history.pushState(null, "", path);
  window.dispatchEvent(new CustomEvent("smv-navigate"));
}

async function handleFiles(files: File[]) {
  try {
    error.value = null;
    loading.value = true;
    const results = await loadFileEntries(files);
    const primaryEntry = getPrimaryEntry(results);
    const label = primaryEntry.label ?? files.map((f) => f.name).join(" + ");
    const sessionLabel =
      results.length > 1 ? (getUploadRootLabel(files) ?? "Build folder") : undefined;
    await navigateWithData(primaryEntry, label, results, sessionLabel);
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
    await navigateWithData(result, "Pasted code");
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
    const parsedUrl = new URL(urlInput.value);
    const label =
      parsedUrl.protocol === "data:"
        ? "data:application/json"
        : parsedUrl.pathname.split("/").pop() || urlInput.value;
    await navigateWithData(result, label);
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Failed to fetch URL";
  } finally {
    loading.value = false;
  }
}

async function loadExample(source: ExampleSource, transformer: string) {
  const data = source.transformers[transformer];
  if (!data) return;
  await navigateWithData(
    data.entries?.[0] ?? data,
    `${source.name} · ${transformer}`,
    data.entries,
    data.entries ? `${source.name} · ${transformer}` : undefined,
  );
}

function getOrderedTransformers(source: ExampleSource): string[] {
  return Object.keys(source.transformers)
    .map((transformer, index) => ({
      transformer,
      index,
      priority: preferredExampleTransformerOrder.indexOf(
        transformer as (typeof preferredExampleTransformerOrder)[number],
      ),
    }))
    .sort((a, b) => {
      const aPriority = a.priority === -1 ? Number.POSITIVE_INFINITY : a.priority;
      const bPriority = b.priority === -1 ? Number.POSITIVE_INFINITY : b.priority;
      if (aPriority !== bPriority) return aPriority - bPriority;
      return a.index - b.index;
    })
    .map(({ transformer }) => transformer);
}

function getDefaultTransformer(source: ExampleSource): string | undefined {
  return getOrderedTransformers(source)[0];
}

async function loadDefaultExample(source: ExampleSource) {
  const transformer = getDefaultTransformer(source);
  if (!transformer) return;
  await loadExample(source, transformer);
}

function loadFromHistory(entry: { slug: string; sessionLabel?: string }) {
  const url = new URL(`/${entry.slug}`, window.location.origin);
  const slug = url.pathname.slice(1);
  const cachedEntries = getCachedSessionCollection(slug);
  if (cachedEntries) {
    const entryIndex = Number(url.searchParams.get("entry"));
    store.loadSourceMapCollection(
      cachedEntries,
      Number.isFinite(entryIndex) ? entryIndex : 0,
      slug,
      entry.sessionLabel,
    );
  }
  window.history.pushState(null, "", `${url.pathname}${url.search}`);
  window.dispatchEvent(new CustomEvent("smv-navigate"));
}

function openUploadDialog(mode: "files" | "folder") {
  const input = document.createElement("input");
  input.type = "file";
  input.multiple = true;
  input.accept = ".js,.ts,.css,.map,.json";
  if (mode === "folder") {
    input.setAttribute("webkitdirectory", "");
    input.setAttribute("directory", "");
  }
  input.onchange = () => {
    if (input.files) handleFiles(Array.from(input.files));
  };
  input.click();
}

function selectUploadMode(mode: "files" | "folder") {
  showUploadMenu.value = false;
  openUploadDialog(mode);
}

function handleDocumentPointerDown(event: MouseEvent) {
  if (!showUploadMenu.value) return;
  if (!(event.target instanceof Node)) return;
  if (uploadMenuRef.value?.contains(event.target)) return;
  showUploadMenu.value = false;
}

onMounted(() => {
  document.addEventListener("mousedown", handleDocumentPointerDown);
});

onUnmounted(() => {
  document.removeEventListener("mousedown", handleDocumentPointerDown);
});

function getFirstGeneratedCode(source: ExampleSource): string {
  const defaultTransformer = getDefaultTransformer(source);
  if (!defaultTransformer) return "";
  const first = source.transformers[defaultTransformer];
  return first?.entries?.[0]?.generatedCode ?? first?.generatedCode ?? "";
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
  <div class="min-h-screen flex items-center justify-center bg-base px-4 py-6 sm:px-6">
    <FileDropZone @drop="handleFiles" />

    <div class="w-full max-w-4xl space-y-8">
      <div class="mx-auto w-full max-w-4xl space-y-6">
        <!-- Header -->
        <div class="mx-auto max-w-2xl text-center">
          <div class="flex items-center justify-center gap-2 mb-1">
            <img src="/logo.svg" alt="Logo" class="h-8 w-8" />
            <h1 class="text-4xl font-bold tracking-tight text-fg">
              {{ APP_NAME }}
            </h1>
          </div>
          <p class="text-base font-mono text-fg-muted">
            A visual tool for inspecting, comparing, and sharing JavaScript/CSS source maps.
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
          <div class="mb-3 space-y-1">
            <p class="text-sm text-fg-muted">
              Drop generated code, source maps, or a build folder here
            </p>
            <p class="text-xs text-fg-muted">
              Supports
              <code class="font-mono bg-muted px-1.5 py-0.5 rounded">.js</code>,
              <code class="font-mono bg-muted px-1.5 py-0.5 rounded">.ts</code>,
              <code class="font-mono bg-muted px-1.5 py-0.5 rounded">.css</code>,
              <code class="font-mono bg-muted px-1.5 py-0.5 rounded">.map</code>, and
              <code class="font-mono bg-muted px-1.5 py-0.5 rounded">.json</code>
            </p>
          </div>
          <div class="flex flex-wrap items-center justify-center gap-2">
            <div ref="uploadMenuRef" class="relative">
              <button
                :class="[
                  'flex items-center gap-1.5 rounded-lg border px-4 py-2 text-sm transition-all duration-150 focus:outline-none focus-visible:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-500/30 active:translate-y-px',
                  showUploadMenu
                    ? 'border-fg-muted bg-muted text-fg shadow-sm'
                    : 'border-edge bg-surface text-fg-dim hover:border-fg-muted hover:bg-muted hover:text-fg active:border-fg active:bg-panel active:text-fg',
                ]"
                :aria-expanded="showUploadMenu"
                @click="showUploadMenu = !showUploadMenu"
              >
                <IconUpload class="w-4 h-4" />
                Upload
                <IconChevronDown
                  class="w-4 h-4 transition-transform"
                  :class="showUploadMenu ? 'rotate-180' : ''"
                />
              </button>
              <div
                v-if="showUploadMenu"
                class="absolute left-0 top-full z-10 mt-2 min-w-[13rem] rounded-lg border border-edge bg-panel p-1.5 shadow-lg"
              >
                <button
                  class="block w-full rounded-md px-3 py-2 text-left transition-all duration-150 hover:bg-surface active:translate-y-px active:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30"
                  @click="selectUploadMode('files')"
                >
                  <span class="block text-sm text-fg">Files</span>
                  <span class="mt-0.5 block text-xs leading-tight text-fg-muted">
                    Pick individual generated files and source maps
                  </span>
                </button>
                <button
                  class="block w-full rounded-md px-3 py-2 text-left transition-all duration-150 hover:bg-surface active:translate-y-px active:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30"
                  @click="selectUploadMode('folder')"
                >
                  <span class="block text-sm text-fg">Folder</span>
                  <span class="mt-0.5 block text-xs leading-tight text-fg-muted">
                    Load every bundle in a build folder with its relative paths
                  </span>
                </button>
              </div>
            </div>
            <button
              class="flex items-center gap-1.5 rounded-lg border border-edge bg-surface px-4 py-2 text-sm text-fg-dim transition-all duration-150 hover:border-fg-muted hover:bg-muted hover:text-fg active:translate-y-px active:border-fg active:bg-panel active:text-fg focus:outline-none focus-visible:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-500/30"
              @click="
                showPaste = !showPaste;
                showUrl = false;
              "
            >
              <IconPaste class="w-4 h-4" />
              Paste
            </button>
            <button
              class="flex items-center gap-1.5 rounded-lg border border-edge bg-surface px-4 py-2 text-sm text-fg-dim transition-all duration-150 hover:border-fg-muted hover:bg-muted hover:text-fg active:translate-y-px active:border-fg active:bg-panel active:text-fg focus:outline-none focus-visible:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-500/30"
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
            placeholder="Paste generated code with an inline sourceMappingURL, raw source map JSON, or a data:application/json... URL..."
          />
          <button
            class="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-all duration-150 hover:bg-blue-500 active:translate-y-px active:bg-blue-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-blue-600 disabled:active:translate-y-0 disabled:active:bg-blue-600"
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
            placeholder="https://cdn.example.com/bundle.min.js, .map, or data:application/json..."
            @keydown.enter="handleUrl"
          />
          <button
            class="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-all duration-150 hover:bg-blue-500 active:translate-y-px active:bg-blue-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-blue-600 disabled:active:translate-y-0 disabled:active:bg-blue-600"
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
            <span class="text-xs uppercase tracking-widest font-semibold text-fg-muted"
              >Recent</span
            >
            <button
              class="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-fg-muted transition-all duration-150 hover:bg-surface hover:text-fg-dim active:translate-y-px active:bg-muted active:text-fg-dim focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30"
              @click="clearHistory"
            >
              <IconTrashCan class="w-3 h-3" />
              Clear
            </button>
          </div>
          <div class="space-y-1">
            <button
              v-for="entry in historyEntries"
              :key="entry.slug"
              class="w-full flex items-center justify-between rounded-lg border border-edge bg-surface px-3 py-2 text-left transition-all duration-150 hover:border-fg-muted hover:bg-muted active:translate-y-px active:border-fg active:bg-panel focus:outline-none focus-visible:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-500/30"
              @click="loadFromHistory(entry)"
            >
              <span class="font-mono text-sm text-fg-dim truncate">{{ entry.label }}</span>
              <span class="text-xs text-fg-muted shrink-0 ml-2">{{
                formatTimeAgo(entry.timestamp)
              }}</span>
            </button>
          </div>
        </div>
      </div>

      <!-- Examples -->
      <div class="mx-auto w-full max-w-4xl">
        <span class="text-xs uppercase tracking-widest font-semibold text-fg-muted mb-2 block"
          >Examples</span
        >
        <div class="grid gap-3 md:grid-cols-2">
          <div
            v-for="source in exampleSources"
            :key="source.name"
            :data-example-name="source.name"
            :data-default-transformer="getDefaultTransformer(source)"
            class="flex h-full cursor-pointer items-start gap-3 rounded-lg border border-edge bg-surface p-3 transition-all duration-150 hover:border-fg-muted hover:bg-muted active:translate-y-px active:border-fg active:bg-panel focus:outline-none focus-visible:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-500/30"
            role="button"
            tabindex="0"
            @click="loadDefaultExample(source)"
            @keydown.enter.prevent="loadDefaultExample(source)"
            @keydown.space.prevent="loadDefaultExample(source)"
          >
            <ExamplePreview :code="getFirstGeneratedCode(source)" />
            <div class="flex-1 min-w-0">
              <p class="text-sm font-semibold text-fg">{{ source.name }}</p>
              <p class="text-xs text-fg-muted mb-1.5">
                {{ source.description }}
              </p>
              <div class="flex flex-wrap gap-1.5">
                <button
                  v-for="transformer in getOrderedTransformers(source)"
                  :key="transformer"
                  :data-transformer="transformer"
                  class="rounded border border-transparent bg-muted px-2 py-0.5 text-xs font-mono text-fg-dim transition-all duration-150 hover:border-edge hover:bg-edge hover:text-fg active:translate-y-px active:bg-panel focus:outline-none focus-visible:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-500/30"
                  @click.stop="loadExample(source, transformer)"
                >
                  {{ transformer }}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="mx-auto w-full max-w-4xl space-y-6">
        <!-- How it works -->
        <div>
          <span class="text-xs uppercase tracking-widest font-semibold text-fg-muted mb-2 block"
            >How it works</span
          >
          <div class="space-y-1.5 text-sm text-fg-muted">
            <div class="flex items-baseline gap-2">
              <IconArrowRight class="w-3 h-3 shrink-0 mt-0.5 text-fg-muted" />
              <span
                >Load generated code and its source map from files, paste, URLs, or examples</span
              >
            </div>
            <div class="flex items-baseline gap-2">
              <IconArrowRight class="w-3 h-3 shrink-0 mt-0.5 text-fg-muted" />
              <span
                >Inspect original and generated code side by side with synchronized
                highlighting</span
              >
            </div>
            <div class="flex items-baseline gap-2">
              <IconArrowRight class="w-3 h-3 shrink-0 mt-0.5 text-fg-muted" />
              <span
                >Hover or click a segment to trace mappings and catch broken or suspicious
                entries</span
              >
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
  </div>
</template>
