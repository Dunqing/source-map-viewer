<script setup lang="ts">
import { computed, ref, shallowRef, watch, onMounted, onUnmounted, nextTick } from "vue";
import { useSourceMapStore } from "../stores/sourceMap";
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
import { lookupPosition, type PositionQuery } from "../core/positionLookup";
import PositionLookupPanel from "../components/PositionLookupPanel.vue";
import WorkspaceDialog from "../components/WorkspaceDialog.vue";

const store = useSourceMapStore();
const { addEntry: addHistoryEntry } = useHistory();
useTheme();

const showStats = ref(false);
const showMappings = ref(false);
const showFiles = ref(false);
const generatedFilename = computed(
  () => store.activeGeneratedEntry?.generatedPath || store.parsedData?.file || "output.js",
);
const originalContentMissing = computed(
  () => store.parsedData?.sourcesContent[store.activeSourceIndex] == null,
);
const selectedSegIndex = ref<number | null>(null);
const showPositionLookup = ref(false);
const positionQuery = shallowRef<PositionQuery | null>(null);
const lookupMatch = shallowRef<MappingSegment | null>(null);
const lookupPanelRef = ref<InstanceType<typeof PositionLookupPanel> | null>(null);
const positionResult = computed(() =>
  positionQuery.value && store.parsedData
    ? lookupPosition(store.parsedData, store.generatedCode, positionQuery.value)
    : null,
);
const generatedFocus = computed(() => {
  if (positionResult.value?.kind === "out-of-bounds") return null;
  if (positionQuery.value?.side === "generated") return positionQuery.value;
  const segment = lookupMatch.value;
  return segment ? { line: segment.generatedLine, column: segment.generatedColumn } : null;
});
const originalFocus = computed(() => {
  if (positionResult.value?.kind === "out-of-bounds") return null;
  const query = positionQuery.value;
  if (query?.side === "original") {
    return query.sourceIndex === store.activeSourceIndex ? query : null;
  }
  const segment = lookupMatch.value;
  return segment?.sourceIndex === store.activeSourceIndex
    ? { line: segment.originalLine, column: segment.originalColumn }
    : null;
});
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

    // Restore the requested coordinates even when they are inside an unmapped gap.
    if (initialState.position) {
      showPositionLookup.value = true;
      requestAnimationFrame(() =>
        handlePositionLookup(initialState.position!, initialState.selectedSegmentIndex),
      );
    }

    // Restore segment selection after panels are mounted (double rAF)
    const initialSeg = initialState.selectedSegmentIndex;
    if (!initialState.position && initialSeg != null && initialSeg < store.mappingIndex.length) {
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
      buildViewerUrl(
        window.location.pathname,
        {
          activeGeneratedEntryIndex: store.activeGeneratedEntryIndex,
          activeSourceIndex: store.activeSourceIndex,
          selectedSegmentIndex: selectedSegIndex.value,
          showStats: showStats.value,
          position: positionQuery.value,
        },
        window.location.hash,
      ),
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
    positionQuery,
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

const searchBarRef = ref<InstanceType<typeof SearchBar> | null>(null);

function revealCode() {
  showFiles.value = false;
  if (window.matchMedia("(max-width: 680px)").matches) showStats.value = false;
}

function openPositionLookup() {
  revealCode();
  showPositionLookup.value = true;
  nextTick(() => lookupPanelRef.value?.focusInput());
}

function closePositionLookup() {
  const restoreFocus = lookupPanelRef.value?.$el.contains(document.activeElement);
  showPositionLookup.value = false;
  if (restoreFocus) nextTick(() => document.getElementById("position-lookup-toggle")?.focus());
}

async function openSearch() {
  revealCode();
  showSearch.value = true;
  await nextTick();
  searchBarRef.value?.focusInput();
}

function handleKeydown(e: KeyboardEvent) {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "g") {
    e.preventDefault();
    openPositionLookup();
  }
  if (e.key === "Escape" && !showFiles.value) closePositionLookup();
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "f") {
    e.preventDefault();
    void openSearch();
  }
}

onMounted(() => {
  document.addEventListener("keydown", handleKeydown);
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
  positionQuery.value = null;
  lookupMatch.value = null;
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
  revealCode();
  if (index === store.activeGeneratedEntryIndex) return;
  selectedSegIndex.value = null;
  positionQuery.value = null;
  lookupMatch.value = null;
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

async function scrollToLookup() {
  await nextTick();
  const generated = generatedFocus.value;
  const original = originalFocus.value;
  if (generated) void generatedPanelRef.value?.scrollToPosition(generated.line, generated.column);
  if (original) void originalPanelRef.value?.scrollToPosition(original.line, original.column);
}

async function selectLookupMatch(segment: MappingSegment) {
  lookupMatch.value = segment;
  const index = store.mappingIndex.indexOf(segment);
  selectedSegIndex.value = index >= 0 ? index : null;
  store.setActiveSource(segment.sourceIndex);
  store.setHoveredSegment(segment);
  await scrollToLookup();
  if (showMappings.value) mappingsPanelRef.value?.scrollToHovered();
}

async function handlePositionLookup(
  query: PositionQuery,
  preferredSegmentIndex: number | null = null,
) {
  if (!store.parsedData) return;
  positionQuery.value = query;
  const result = positionResult.value!;
  const preferred =
    preferredSegmentIndex === null ? null : store.mappingIndex[preferredSegmentIndex];
  const match = preferred && result.matches.includes(preferred) ? preferred : result.matches[0];
  if (match) {
    await selectLookupMatch(match);
  } else {
    lookupMatch.value = null;
    selectedSegIndex.value = null;
    store.setHoveredSegment(null);
    if (result.kind !== "out-of-bounds") {
      if (query.side === "original") store.setActiveSource(query.sourceIndex);
      await scrollToLookup();
    }
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
    const search = buildViewerUrl("", {
      // A share contains the active entry's data, so it becomes entry zero.
      activeGeneratedEntryIndex: 0,
      activeSourceIndex: store.activeSourceIndex,
      selectedSegmentIndex: selectedSegIndex.value,
      showStats: showStats.value,
      position: positionQuery.value,
    });
    const shareKind = await copyShareUrl(
      {
        generatedCode: store.generatedCode,
        sourceMapJson: store.sourceMapJson,
      },
      search,
    );
    showToast(shareKind === "short" ? "Short URL copied to clipboard" : "URL copied to clipboard");
  } catch {
    showToast("Failed to copy URL");
  }
}
</script>

<template>
  <div class="workspace-shell">
    <Toolbar
      v-if="ready"
      :show-stats="showStats"
      :show-mappings="showMappings"
      :show-position-lookup="showPositionLookup"
      :show-files="showFiles"
      @files="showFiles = true"
      @search="openSearch"
      @position-lookup="showPositionLookup ? closePositionLookup() : openPositionLookup()"
      @update:show-stats="showStats = $event"
      @update:show-mappings="showMappings = $event"
      @home="handleBack"
      @ai-debug="showAiDebug = true"
      @share="handleShare"
      @compare="handleCompare"
    />

    <WorkspaceDialog
      v-if="ready"
      :open="showFiles"
      label="Files"
      title="Files"
      @close="showFiles = false"
    >
      <h3 class="file-heading">Generated entries</h3>
      <EntrypointTabs
        v-if="store.generatedEntryCount > 1"
        class="file-list"
        :entries="generatedTabs"
        :active-index="store.activeGeneratedEntryIndex"
        @select="handleGeneratedTabSelect"
      />
      <p v-else class="text-sm text-fg-dim break-all">{{ generatedFilename }}</p>
      <h3 class="file-heading">Original sources</h3>
      <SourceTabs class="file-list" @select="revealCode" />
      <h3 class="file-heading">Source map</h3>
      <p class="text-xs text-fg-muted break-all">
        {{ store.activeGeneratedEntry?.sourceMapPath || "Source map path is not available." }}
      </p>
    </WorkspaceDialog>

    <PositionLookupPanel
      v-if="ready && showPositionLookup"
      id="position-lookup-panel"
      ref="lookupPanelRef"
      class="workspace-lookup"
      :query="positionQuery"
      :selected-segment="lookupMatch"
      @lookup="handlePositionLookup"
      @select="selectLookupMatch"
      @close="closePositionLookup"
    />

    <div v-if="ready" class="workspace-content">
      <SearchBar
        ref="searchBarRef"
        :visible="showSearch"
        @search="searchQuery = $event"
        @close="showSearch = false"
      />
      <div class="workspace-panes" :class="{ 'has-details': showStats }">
        <div class="workspace-pane">
          <header class="workspace-code-header">
            <button
              type="button"
              :title="store.activeSourceName"
              aria-haspopup="dialog"
              @click="showFiles = true"
            >
              {{ store.activeSourceName
              }}<small v-if="store.sourceCount > 1"> ({{ store.sourceCount }})</small>
            </button>
            <span>Original</span>
          </header>
          <div v-if="originalContentMissing" class="px-6 py-4 text-sm text-fg-muted">
            Original content is not embedded in this source map. Its path and mapping coordinates
            remain available.
          </div>
          <CodePanel
            ref="originalPanelRef"
            :code="store.activeSourceContent"
            :filename="store.activeSourceName"
            side="original"
            :focus-position="originalFocus"
            :search-query="searchQuery"
            class="flex-1 min-h-0"
            @segment-click="handleOriginalSegmentClick"
          />
        </div>
        <div class="workspace-pane">
          <header class="workspace-code-header">
            <button
              type="button"
              :title="generatedFilename"
              aria-haspopup="dialog"
              @click="showFiles = true"
            >
              {{ generatedFilename }}
            </button>
            <span>Generated</span>
          </header>
          <CodePanel
            ref="generatedPanelRef"
            :code="store.generatedCode"
            :filename="generatedFilename"
            side="generated"
            :focus-position="generatedFocus"
            :search-query="searchQuery"
            class="flex-1 min-h-0"
            @segment-click="handleGeneratedSegmentClick"
          />
        </div>
        <MappingConnector :original-panel="originalPanelRef" :generated-panel="generatedPanelRef" />
        <aside v-if="showStats" class="workspace-side-panel" aria-label="Source map details">
          <header class="workspace-side-heading">
            <h2>Details</h2>
            <button
              type="button"
              class="workspace-icon"
              aria-label="Close details"
              @click="showStats = false"
            >
              ×
            </button>
          </header>
          <StatsPanel />
        </aside>
      </div>
    </div>
    <StatusBar v-if="ready" @toggle-mappings="showMappings = !showMappings" />
    <MappingsPanel
      v-if="ready && showMappings"
      ref="mappingsPanelRef"
      @click-mapping="handleMappingClick"
    />
    <Transition name="fade"
      ><div v-if="toast" class="workspace-toast" role="status">{{ toast }}</div></Transition
    >
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
