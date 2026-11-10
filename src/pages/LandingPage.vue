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
import { useTheme } from "../composables/useTheme";
import { useHistory } from "../composables/useHistory";
import { navigateToPath } from "../composables/navigation";
import { createLocalSession, getCachedSession } from "../composables/useSessionCollectionCache";
import { exampleSources, type ExampleSource } from "../examples";
import { APP_DESCRIPTION, APP_NAME } from "../constants";
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

function navigateWithData(
  data: { generatedCode: string; sourceMapJson: string },
  label: string,
  sessionEntries?: ResolvedFileCollection[],
  sessionLabel?: string,
) {
  const entries = sessionEntries?.length ? sessionEntries : [{ ...data, label, entryPath: label }];
  const resolvedSessionLabel = sessionLabel ?? label;
  const slug = createLocalSession(entries, resolvedSessionLabel);
  store.loadSourceMapCollection(entries, 0, slug, resolvedSessionLabel);
  if (store.error) throw new Error(store.error);

  addHistoryEntry({
    label: getHistoryLabel(label, sessionEntries, sessionLabel),
    slug,
    timestamp: Date.now(),
    sessionLabel,
  });
  navigateToPath(`/${slug}`);
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
    navigateWithData(primaryEntry, label, results, sessionLabel);
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
    navigateWithData(result, "Pasted code");
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
    navigateWithData(result, label);
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Failed to fetch URL";
  } finally {
    loading.value = false;
  }
}

function loadExample(source: ExampleSource, transformer: string) {
  const data = source.transformers[transformer];
  if (!data) return;
  navigateWithData(
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

function loadDefaultExample(source: ExampleSource) {
  const transformer = getDefaultTransformer(source);
  if (!transformer) return;
  loadExample(source, transformer);
}

function loadFromHistory(entry: { slug: string; sessionLabel?: string }) {
  const url = new URL(`/${entry.slug}`, window.location.origin);
  const slug = url.pathname.slice(1);
  const cachedSession = getCachedSession(slug);
  if (cachedSession) {
    const entryIndex = Number(url.searchParams.get("entry"));
    store.loadSourceMapCollection(
      cachedSession.entries,
      Number.isFinite(entryIndex) ? entryIndex : 0,
      slug,
      cachedSession.label || entry.sessionLabel,
    );
  }
  navigateToPath(`${url.pathname}${url.search}`);
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
  <div class="landing-page">
    <FileDropZone @drop="handleFiles" />

    <div class="landing-content">
      <div class="landing-primary">
        <!-- Header -->
        <div class="landing-heading">
          <div class="landing-brand">
            <img :src="'/logo.svg'" alt="Logo" class="h-6 w-6" />
            <h1 class="landing-title">
              {{ APP_NAME }}
            </h1>
          </div>
          <p class="landing-description">
            {{ APP_DESCRIPTION }}
          </p>
        </div>

        <!-- Error -->
        <div v-if="error" class="landing-error">
          {{ error }}
        </div>

        <!-- Drop Zone -->
        <div class="landing-input">
          <div class="landing-input-copy">
            <p class="text-sm text-fg-dim">
              Drop generated code, source maps, or a build folder here
            </p>
            <p class="text-xs text-fg-muted">
              Supports
              <code class="font-mono">.js</code>, <code class="font-mono">.ts</code>,
              <code class="font-mono">.css</code>, <code class="font-mono">.map</code>, and
              <code class="font-mono">.json</code>
            </p>
          </div>
          <div class="landing-input-actions">
            <div ref="uploadMenuRef" class="relative">
              <button
                :class="['landing-action landing-action-primary', showUploadMenu ? 'is-open' : '']"
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
              <div v-if="showUploadMenu" class="landing-upload-menu">
                <button class="landing-upload-option" @click="selectUploadMode('files')">
                  <span class="block text-sm text-fg">Files</span>
                  <span class="mt-0.5 block text-xs leading-tight text-fg-muted">
                    Pick individual generated files and source maps
                  </span>
                </button>
                <button class="landing-upload-option" @click="selectUploadMode('folder')">
                  <span class="block text-sm text-fg">Folder</span>
                  <span class="mt-0.5 block text-xs leading-tight text-fg-muted">
                    Load every bundle in a build folder with its relative paths
                  </span>
                </button>
              </div>
            </div>
            <button
              class="landing-action"
              @click="
                showPaste = !showPaste;
                showUrl = false;
              "
            >
              <IconPaste class="w-4 h-4" />
              Paste
            </button>
            <button
              class="landing-action"
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
        <div v-if="loading" class="flex items-center gap-2 text-sm text-fg-muted">
          <IconCircleDash class="w-4 h-4 animate-spin" />
          Loading source map...
        </div>

        <!-- Paste panel -->
        <div v-if="showPaste" class="landing-text-input">
          <textarea
            v-model="pasteContent"
            class="landing-field landing-paste-field"
            placeholder="Paste generated code with an inline sourceMappingURL, raw source map JSON, or a data:application/json... URL..."
          />
          <button
            class="landing-action landing-action-primary"
            :disabled="!pasteContent || loading"
            @click="handlePaste"
          >
            Visualize
          </button>
        </div>

        <!-- URL panel -->
        <div v-if="showUrl" class="landing-text-input">
          <input
            v-model="urlInput"
            class="landing-field"
            placeholder="https://cdn.example.com/bundle.min.js, .map, or data:application/json..."
            @keydown.enter="handleUrl"
          />
          <button
            class="landing-action landing-action-primary"
            :disabled="!urlInput || loading"
            @click="handleUrl"
          >
            Fetch & Visualize
          </button>
        </div>

        <!-- Recent History: skeleton during SSR, real content on client -->
        <div v-if="historyLoading">
          <span class="landing-section-title">Recent</span>
          <div class="landing-history-list">
            <div v-for="i in 2" :key="i" class="landing-history-skeleton animate-pulse" />
          </div>
        </div>
        <div v-else-if="historyEntries.length > 0">
          <div class="landing-section-heading">
            <span class="landing-section-title">Recent</span>
            <button class="landing-clear" @click="clearHistory">
              <IconTrashCan class="w-3 h-3" />
              Clear
            </button>
          </div>
          <div class="landing-history-list">
            <button
              v-for="entry in historyEntries"
              :key="entry.slug"
              class="landing-history-row"
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
      <div class="landing-examples">
        <span class="landing-section-title">Examples</span>
        <div class="landing-example-list">
          <div
            v-for="source in exampleSources"
            :key="source.name"
            :data-example-name="source.name"
            :data-default-transformer="getDefaultTransformer(source)"
            class="landing-example-row"
            role="button"
            tabindex="0"
            @click="loadDefaultExample(source)"
            @keydown.enter.prevent="loadDefaultExample(source)"
            @keydown.space.prevent="loadDefaultExample(source)"
          >
            <ExamplePreview class="landing-example-preview" :code="getFirstGeneratedCode(source)" />
            <div class="flex-1 min-w-0">
              <p class="text-sm font-medium text-fg">{{ source.name }}</p>
              <p class="text-xs leading-relaxed text-fg-muted mt-1 mb-2">
                {{ source.description }}
              </p>
              <div class="flex flex-wrap gap-1.5">
                <button
                  v-for="transformer in getOrderedTransformers(source)"
                  :key="transformer"
                  :data-transformer="transformer"
                  class="landing-transformer"
                  @click.stop="loadExample(source, transformer)"
                >
                  {{ transformer }}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="landing-support">
        <!-- How it works -->
        <div>
          <span class="landing-section-title">How it works</span>
          <div class="landing-instructions">
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
        <a href="/compare" class="landing-compare-link">
          <span class="text-sm font-medium text-fg">Compare Source Maps</span>
          <p class="text-xs text-fg-muted mt-1">
            Diff two source maps to see which mappings changed, were added, or removed
          </p>
        </a>

        <!-- Footer -->
        <div class="landing-footer">
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

<style scoped>
.landing-page {
  --landing-accent: #246fc6;
  min-height: 100dvh;
  padding: 64px 24px 28px;
  background: var(--c-bg);
  color: var(--c-text);
}

.landing-content {
  width: 100%;
  max-width: 800px;
  margin: 0 auto;
}

.landing-primary {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.landing-heading {
  margin-bottom: 8px;
}

.landing-brand {
  display: flex;
  align-items: center;
  gap: 10px;
}

.landing-title {
  font-size: 26px;
  line-height: 1.3;
  font-weight: 600;
  letter-spacing: -0.7px;
}

.landing-description {
  margin-top: 10px;
  font-size: 14px;
  line-height: 1.6;
  color: var(--c-text-3);
}

.landing-input {
  padding: 30px;
  border: 1px dashed var(--c-border);
  border-radius: 5px;
  background: var(--c-bg-soft);
}

.landing-input-copy > :first-child {
  color: var(--c-text);
  font-size: 15px;
  line-height: 1.5;
}

.landing-input-copy > :last-child {
  margin-top: 7px;
  line-height: 1.7;
}

.landing-input-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-top: 22px;
}

.landing-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  min-height: 36px;
  padding: 8px 13px;
  border: 1px solid var(--c-border);
  border-radius: 4px;
  background: var(--c-bg);
  color: var(--c-text-2);
  font-size: 13px;
  line-height: 1.4;
  transition:
    background-color 120ms,
    color 120ms,
    border-color 120ms;
}

.landing-action:hover {
  background: var(--c-bg-mute);
  color: var(--c-text);
}

.landing-action-primary {
  border-color: transparent;
  background: var(--landing-accent);
  color: #fff;
}

.landing-action-primary:hover,
.landing-action-primary.is-open {
  background: #1e62b0;
  color: #fff;
}

.landing-action:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.landing-upload-menu {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  z-index: 10;
  width: min(280px, calc(100vw - 64px));
  padding: 5px;
  border: 1px solid var(--c-border);
  border-radius: 5px;
  background: var(--c-bg);
  box-shadow: 0 8px 28px #10213614;
}

.landing-upload-option {
  display: block;
  width: 100%;
  padding: 10px;
  border-radius: 3px;
  text-align: left;
}

.landing-upload-option:hover {
  background: var(--c-bg-soft);
}

.landing-text-input {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 10px;
}

.landing-field {
  width: 100%;
  min-height: 40px;
  padding: 10px 12px;
  border: 1px solid var(--c-border);
  border-radius: 4px;
  background: var(--c-bg);
  color: var(--c-text);
  font-family: monospace;
  font-size: 13px;
  line-height: 1.6;
}

.landing-field::placeholder {
  color: var(--c-text-3);
}

.landing-paste-field {
  height: 180px;
  resize: none;
}

.landing-error {
  padding: 12px 14px;
  border-left: 2px solid var(--c-text-3);
  background: var(--c-bg-soft);
  color: var(--c-text);
  font-size: 13px;
  overflow-wrap: anywhere;
}

.landing-section-title {
  display: block;
  margin-bottom: 10px;
  font-size: 13px;
  font-weight: 550;
  color: var(--c-text-2);
}

.landing-section-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.landing-section-heading .landing-section-title {
  margin-bottom: 0;
}

.landing-clear {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 5px 0 5px 8px;
  font-size: 12px;
  color: var(--c-text-3);
}

.landing-clear:hover {
  color: var(--c-text);
}

.landing-history-list,
.landing-example-list {
  border-top: 1px solid var(--c-border);
}

.landing-history-row {
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 0;
  border-bottom: 1px solid var(--c-border);
  text-align: left;
  transition: background-color 120ms;
}

.landing-history-skeleton {
  height: 44px;
  border-bottom: 1px solid var(--c-border);
  background: var(--c-bg-soft);
}

.landing-examples {
  margin-top: 36px;
}

.landing-example-row {
  display: flex;
  align-items: center;
  gap: 18px;
  padding: 18px 0;
  border-bottom: 1px solid var(--c-border);
  cursor: pointer;
  transition: background-color 120ms;
}

.landing-history-row:hover,
.landing-example-row:hover {
  background: var(--c-bg-soft);
}

.landing-example-preview {
  opacity: 0.7;
  filter: grayscale(1);
}

.landing-transformer {
  padding: 3px 6px;
  margin-left: -6px;
  margin-right: 6px;
  border-radius: 3px;
  color: var(--c-text-2);
  font-family: monospace;
  font-size: 12px;
  transition:
    background-color 120ms,
    color 120ms;
}

.landing-transformer:hover {
  background: var(--c-bg-mute);
  color: var(--landing-accent);
}

.landing-support {
  margin-top: 32px;
}

.landing-instructions {
  display: flex;
  flex-direction: column;
  gap: 9px;
  color: var(--c-text-3);
  font-size: 13px;
  line-height: 1.6;
}

.landing-compare-link {
  display: block;
  margin-top: 28px;
  padding: 18px 0;
  border-top: 1px solid var(--c-border);
  transition: background-color 120ms;
}

.landing-compare-link:hover {
  background: var(--c-bg-soft);
}

.landing-footer {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px 20px;
  padding-top: 20px;
  border-top: 1px solid var(--c-border);
  color: var(--c-text-3);
  font-size: 12px;
  line-height: 1.6;
}

.landing-footer > span {
  font-family: inherit;
}

.landing-page :is(button, a, [role="button"], input, textarea):focus-visible {
  outline: 2px solid var(--landing-accent);
  outline-offset: 3px;
}

@media (max-width: 600px) {
  .landing-page {
    padding: 32px 18px 24px;
  }

  .landing-title {
    font-size: 23px;
  }

  .landing-input {
    padding: 22px 18px;
  }

  .landing-example-row {
    align-items: flex-start;
    gap: 12px;
  }

  .landing-example-preview {
    margin-top: 3px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .landing-page *,
  .landing-page *::before,
  .landing-page *::after {
    animation: none !important;
    transition: none !important;
  }
}
</style>
