<script setup lang="ts">
import { computed, ref, watch, onMounted, onUnmounted, nextTick } from "vue";
import { useSourceMapStore } from "../stores/sourceMap";
import { useHighlighter } from "../composables/useHighlighter";
import { formatMultiEntryHistoryLabel } from "../composables/historyLabels";
import { useTheme } from "../composables/useTheme";
import { useHistory } from "../composables/useHistory";
import { navigateToPath, replaceCurrentPath } from "../composables/navigation";
import { copyShareUrl, createComparePath } from "../composables/shareLinks";
import { buildViewerUrl, readViewerUrlState } from "../composables/viewerUrlState";
import CodePanel from "../components/CodePanel.vue";
import Toolbar from "../components/Toolbar.vue";
import StatusBar from "../components/StatusBar.vue";
import SourceTabs from "../components/SourceTabs.vue";
import EntrypointTabs from "../components/EntrypointTabs.vue";
import StatsPanel from "../components/StatsPanel.vue";
import MappingsPanel from "../components/MappingsPanel.vue";
import SearchBar from "../components/SearchBar.vue";
import MappingConnector from "../components/MappingConnector.vue";
import AiDebugPanel from "../components/AiDebugPanel.vue";
import type { MappingSegment } from "../core/types";

const store = useSourceMapStore();
const { init } = useHighlighter();
const { addEntry: addHistoryEntry } = useHistory();
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
  const initialState = readViewerUrlState(window.location.search);
  showStats.value = initialState.showStats;
  showMappings.value = initialState.showMappings;
  if (initialState.activeGeneratedEntryIndex > 0) {
    store.setActiveGeneratedEntry(initialState.activeGeneratedEntryIndex);
  }
  if (initialState.activeSourceIndex > 0) {
    store.setActiveSource(initialState.activeSourceIndex);
  }

  // Show content after mount cascade settles
  requestAnimationFrame(() => {
    ready.value = true;

    // Restore segment selection after panels are mounted (double rAF)
    const initialSeg = initialState.selectedSegmentIndex;
    if (initialSeg != null && initialSeg < store.mappingIndex.length) {
      requestAnimationFrame(() => {
        const segToSelect = store.mappingIndex[initialSeg];
        if (!segToSelect) return;
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
    replaceCurrentPath(
      buildViewerUrl(window.location.pathname, {
        activeGeneratedEntryIndex: store.activeGeneratedEntryIndex,
        activeSourceIndex: store.activeSourceIndex,
        selectedSegmentIndex: selectedSegIndex.value,
        showStats: showStats.value,
      }),
    );
  }, 16);
}

watch(
  [
    showMappings,
    showStats,
    () => store.activeGeneratedEntryIndex,
    () => store.activeSourceIndex,
    selectedSegIndex,
  ],
  syncUrlParams,
);
watch(
  [() => store.activeGeneratedEntryIndex, () => store.sessionSlug],
  ([index, slug], [previousIndex, previousSlug]) => {
    if (!slug || store.generatedEntryCount <= 1) return;
    if (index === previousIndex && slug === previousSlug) return;
    const activeEntry = store.activeGeneratedEntry;
    if (!activeEntry) return;
    const sessionLabel = store.sessionLabel || "Build folder";
    addHistoryEntry({
      label: formatMultiEntryHistoryLabel(
        sessionLabel,
        activeEntry.entryPath || activeEntry.label,
        store.generatedEntryCount,
      ),
      slug: index > 0 ? `${slug}?entry=${index}` : slug,
      timestamp: Date.now(),
      sessionLabel,
    });
  },
);
const showAiDebug = ref(false);
const showSearch = ref(false);
const searchQuery = ref("");
const toast = ref<string | null>(null);
const generatedTabs = computed(() => store.generatedEntries.map((entry) => entry.entryPath));

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
    generatedPanelRef.value?.scrollToLineIfNeeded(seg.generatedLine);
    if (seg.sourceIndex === store.activeSourceIndex) {
      originalPanelRef.value?.scrollToLineIfNeeded(seg.originalLine);
    }
  },
);

watch(
  [() => store.hoveredSegment, () => store.activeSourceIndex],
  async ([seg, activeSourceIndex], [, previousActiveSourceIndex]) => {
    if (!seg || activeSourceIndex === previousActiveSourceIndex) return;
    if (seg.sourceIndex !== activeSourceIndex) return;

    await nextTick();
    if (store.hoveredSegment !== seg || store.activeSourceIndex !== activeSourceIndex) return;

    originalPanelRef.value?.scrollToLineIfNeeded(seg.originalLine);
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
  clearTimeout(urlSyncTimer);
});

function handleBack() {
  store.reset();
  navigateToPath("/");
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

function handleGeneratedTabSelect(index: number) {
  if (index === store.activeGeneratedEntryIndex) return;
  selectedSegIndex.value = null;
  store.setActiveGeneratedEntry(index);
  originalPanelRef.value?.scrollToLine(0);
  generatedPanelRef.value?.scrollToLine(0);
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
    window.location.href = await createComparePath({
      generatedCode: store.generatedCode,
      sourceMapJson: store.sourceMapJson,
    });
  } catch {
    showToast("Failed to start compare");
  }
}

async function handleShare() {
  try {
    const shareKind = await copyShareUrl({
      generatedCode: store.generatedCode,
      sourceMapJson: store.sourceMapJson,
    });
    showToast(shareKind === "short" ? "Short URL copied to clipboard" : "URL copied to clipboard");
  } catch {
    showToast("Failed to copy URL");
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

    <div v-if="ready" class="flex-1 flex flex-col overflow-hidden relative">
      <SearchBar :visible="showSearch" @search="searchQuery = $event" @close="showSearch = false" />
      <EntrypointTabs
        v-if="store.generatedEntryCount > 1"
        :entries="generatedTabs"
        :active-index="store.activeGeneratedEntryIndex"
        @select="handleGeneratedTabSelect"
      />

      <div class="flex-1 flex overflow-hidden relative">
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
