<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, nextTick } from "vue";
import { useSourceMapStore } from "../stores/sourceMap";
import { useHighlighter } from "../composables/useHighlighter";
import { useTheme } from "../composables/useTheme";
import { compressToHash } from "../composables/useShareableUrl";
import CodePanel from "../components/CodePanel.vue";
import Toolbar from "../components/Toolbar.vue";
import StatusBar from "../components/StatusBar.vue";
import SourceTabs from "../components/SourceTabs.vue";
import StatsPanel from "../components/StatsPanel.vue";
import MappingsPanel from "../components/MappingsPanel.vue";
import SearchBar from "../components/SearchBar.vue";
import MappingConnector from "../components/MappingConnector.vue";
import AiDebugPanel from "../components/AiDebugPanel.vue";
import type { MappingSegment } from "../core/types";

const store = useSourceMapStore();
const { init, loading: highlighterLoading } = useHighlighter();
useTheme();

const showStats = ref(false);
const showMappings = ref(false);
const selectedSegIndex = ref<number | null>(null);
// Defer heavy rendering to avoid recursive update loops during mount.
// First render is an empty shell; content appears after mount settles.
const ready = ref(false);
let urlSyncEnabled = false;
let urlSyncTimer = 0;

onMounted(() => {
  // Restore UI state from URL params (client-only)
  const params = new URLSearchParams(window.location.search);
  showStats.value = params.get("stats") === "1";
  const initialTab = Number(params.get("tab"));
  if (initialTab > 0) store.setActiveSource(initialTab);

  const segParam = params.get("seg");
  // seg implies mappings panel open
  if (segParam != null) showMappings.value = true;

  // Show content after mount cascade settles
  requestAnimationFrame(() => {
    ready.value = true;

    // Restore segment selection after panels are mounted (double rAF)
    if (segParam != null && Number(segParam) >= 0 && Number(segParam) < store.mappingIndex.length) {
      const initialSeg = Number(segParam);
      requestAnimationFrame(() => {
        const segToSelect = store.mappingIndex[initialSeg];
        store.setHoveredSegment(segToSelect);
        selectedSegIndex.value = initialSeg;
        store.setActiveSource(segToSelect.sourceIndex);
        originalPanelRef.value?.scrollToLine(segToSelect.originalLine);
        generatedPanelRef.value?.scrollToLine(segToSelect.generatedLine);
        mappingsPanelRef.value?.scrollToHovered();
      });
    }

    // Enable URL sync after first real render
    setTimeout(() => {
      urlSyncEnabled = true;
    }, 100);
  });
});

function syncUrlParams() {
  if (!urlSyncEnabled) return;
  clearTimeout(urlSyncTimer);
  urlSyncTimer = window.setTimeout(() => {
    const p = new URLSearchParams();
    if (store.activeSourceIndex > 0) p.set("tab", String(store.activeSourceIndex));
    if (showStats.value) p.set("stats", "1");
    if (selectedSegIndex.value != null) p.set("seg", String(selectedSegIndex.value));
    const search = p.toString();
    const newUrl = `${window.location.pathname}${search ? "?" + search : ""}`;
    window.history.replaceState(null, "", newUrl);
  }, 16);
}

watch([showMappings, showStats, () => store.activeSourceIndex, selectedSegIndex], syncUrlParams);
const showAiDebug = ref(false);
const showSearch = ref(false);
const searchQuery = ref("");
const toast = ref<string | null>(null);

function showToast(message: string) {
  toast.value = message;
  setTimeout(() => {
    toast.value = null;
  }, 3000);
}

const originalPanelRef = ref<InstanceType<typeof CodePanel> | null>(null);
const generatedPanelRef = ref<InstanceType<typeof CodePanel> | null>(null);
const mappingsPanelRef = ref<InstanceType<typeof MappingsPanel> | null>(null);

watch(
  () => store.hoveredSegment,
  (seg) => {
    if (!seg) return;
    originalPanelRef.value?.scrollToLineIfNeeded(seg.originalLine);
    generatedPanelRef.value?.scrollToLineIfNeeded(seg.generatedLine);
  },
);

function handleKeydown(e: KeyboardEvent) {
  if ((e.metaKey || e.ctrlKey) && e.key === "f") {
    e.preventDefault();
    showSearch.value = true;
  }
}

onMounted(async () => {
  document.addEventListener("keydown", handleKeydown);
  await init();
});

onUnmounted(() => {
  document.removeEventListener("keydown", handleKeydown);
});

function handleBack() {
  store.reset();
  window.history.pushState(null, "", "/");
  window.dispatchEvent(new CustomEvent("smv-navigate"));
}

function selectSegment(segment: MappingSegment) {
  const idx = store.mappingIndex.indexOf(segment);
  selectedSegIndex.value = idx >= 0 ? idx : null;
}

function handleOriginalSegmentClick(segment: MappingSegment) {
  store.setHoveredSegment(segment);
  selectSegment(segment);
  if (generatedPanelRef.value) {
    generatedPanelRef.value.scrollToLine(segment.generatedLine);
  }
  if (showMappings.value && mappingsPanelRef.value) {
    mappingsPanelRef.value.scrollToHovered();
  }
}

function handleGeneratedSegmentClick(segment: MappingSegment) {
  store.setHoveredSegment(segment);
  selectSegment(segment);
  store.setActiveSource(segment.sourceIndex);
  if (originalPanelRef.value) {
    originalPanelRef.value.scrollToLine(segment.originalLine);
  }
  if (showMappings.value && mappingsPanelRef.value) {
    mappingsPanelRef.value.scrollToHovered();
  }
}

function handleMappingClick(segment: MappingSegment) {
  store.setHoveredSegment(segment);
  selectSegment(segment);
  store.setActiveSource(segment.sourceIndex);
  if (originalPanelRef.value) {
    originalPanelRef.value.scrollToLine(segment.originalLine);
  }
  if (generatedPanelRef.value) {
    generatedPanelRef.value.scrollToLine(segment.generatedLine);
  }
}

async function handleCompare() {
  try {
    const res = await fetch("/api/share", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        generatedCode: store.generatedCode,
        sourceMapJson: store.sourceMapJson,
      }),
    });
    if (!res.ok) throw new Error("Share failed");
    const { id } = await res.json();
    window.location.href = `/compare?a=${id}`;
  } catch {
    showToast("Failed to start compare");
  }
}

async function handleShare() {
  try {
    // Try short URL via API
    const res = await fetch("/api/share", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        generatedCode: store.generatedCode,
        sourceMapJson: store.sourceMapJson,
      }),
    });
    if (!res.ok) throw new Error("Share failed");
    const { url } = await res.json();
    await navigator.clipboard.writeText(url);
    window.history.replaceState(null, "", new URL(url).pathname);
    showToast("Short URL copied to clipboard");
  } catch {
    try {
      // Fallback to inline hash URL
      const hash = await compressToHash({
        generatedCode: store.generatedCode,
        sourceMapJson: store.sourceMapJson,
      });
      const url = `${window.location.origin}/${hash}`;
      await navigator.clipboard.writeText(url);
      showToast("URL copied to clipboard");
    } catch {
      showToast("Failed to copy URL");
    }
  }
}
</script>

<template>
  <div class="h-screen flex flex-col bg-panel text-fg">
    <Toolbar
      v-if="ready"
      :show-stats="showStats"
      :show-mappings="showMappings"
      @update:show-stats="showStats = $event"
      @update:show-mappings="showMappings = $event"
      @home="handleBack"
      @ai-debug="showAiDebug = true"
      @share="handleShare"
      @compare="handleCompare"
    />

    <div v-if="ready" class="flex-1 flex overflow-hidden relative">
      <SearchBar :visible="showSearch" @search="searchQuery = $event" @close="showSearch = false" />

      <!-- Left: Original code -->
      <div class="flex-1 flex flex-col border-r border-edge min-w-0">
        <div class="px-3 py-1 text-xs font-medium text-fg-muted border-b border-edge bg-muted">
          Original code
        </div>
        <SourceTabs v-if="store.sourceCount > 1" />
        <CodePanel
          ref="originalPanelRef"
          :code="store.activeSourceContent"
          :filename="store.activeSourceName"
          side="original"
          :search-query="searchQuery"
          class="flex-1"
          @segment-click="handleOriginalSegmentClick"
        />
      </div>

      <!-- Right: Generated code -->
      <div class="flex-1 flex flex-col min-w-0">
        <div class="px-3 py-1 text-xs font-medium text-fg-muted border-b border-edge bg-muted">
          Generated code
        </div>
        <CodePanel
          ref="generatedPanelRef"
          :code="store.generatedCode"
          :filename="store.parsedData?.file ?? 'output.js'"
          side="generated"
          :search-query="searchQuery"
          class="flex-1"
          @segment-click="handleGeneratedSegmentClick"
        />
      </div>

      <!-- Connector arrow overlay -->
      <MappingConnector :original-panel="originalPanelRef" :generated-panel="generatedPanelRef" />

      <StatsPanel v-if="showStats" />
    </div>

    <StatusBar v-if="ready" @toggle-mappings="showMappings = !showMappings" />
    <MappingsPanel
      v-if="ready && showMappings"
      ref="mappingsPanelRef"
      @click-mapping="handleMappingClick"
    />

    <Transition name="fade">
      <div
        v-if="toast"
        class="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 rounded-lg bg-zinc-800 dark:bg-zinc-200 px-4 py-2 text-sm text-white dark:text-zinc-900 shadow-lg"
      >
        {{ toast }}
      </div>
    </Transition>

    <AiDebugPanel v-if="showAiDebug" @close="showAiDebug = false" />
  </div>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
