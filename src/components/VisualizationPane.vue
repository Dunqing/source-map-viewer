<script setup lang="ts">
import { nextTick, ref, watch } from "vue";
import CodePanel from "./CodePanel.vue";
import SourceTabs from "./SourceTabs.vue";
import WorkspaceDialog from "./WorkspaceDialog.vue";
import MappingConnector from "./MappingConnector.vue";
import { useSourceMapStore } from "../stores/sourceMap";
import type { MappingSegment } from "../core/types";

/**
 * The reusable inner half of the main viewer: original code on the left,
 * generated code on the right, mapping connector arrows between, and a
 * source picker in the filename header. All hover/click sync
 * between the two panels and source-side switching wires through the
 * injected `useSourceMapStore`.
 *
 * `VisualizationPage.vue` mounts this with the global singleton store;
 * `CompareCodePane.vue` mounts it with a per-instance store via
 * `provideSourceMapStore` so two instances on the compare page have
 * independent state.
 */
const props = defineProps<{
  searchQuery?: string;
  /** Filename used for the generated-side syntax highlighting. */
  generatedFilename?: string;
  /**
   * Optional per-line gutter markers for the generated `CodePanel`.
   * Compare page uses this to surface which lines have a non-`same`
   * mapping diff entry. Key = 0-based line number.
   */
  genLineStatuses?: Map<number, "shifted" | "changed" | "removed" | "added">;
}>();

const store = useSourceMapStore();
const showSources = ref(false);

const originalPanelRef = ref<InstanceType<typeof CodePanel> | null>(null);
const generatedPanelRef = ref<InstanceType<typeof CodePanel> | null>(null);

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

function handleOriginalSegmentClick(segment: MappingSegment) {
  store.setHoveredSegment(segment);
  generatedPanelRef.value?.scrollToLine(segment.generatedLine);
}

function handleGeneratedSegmentClick(segment: MappingSegment) {
  store.setHoveredSegment(segment);
  store.setActiveSource(segment.sourceIndex);
  originalPanelRef.value?.scrollToLine(segment.originalLine);
}

defineExpose({ originalPanelRef, generatedPanelRef });
</script>

<template>
  <div class="flex flex-col overflow-hidden flex-1 min-h-0">
    <WorkspaceDialog
      :open="showSources"
      label="Original sources"
      title="Original sources"
      @close="showSources = false"
    >
      <SourceTabs class="file-list" @select="showSources = false" />
    </WorkspaceDialog>
    <div class="workspace-panes">
      <!-- Left: Original code -->
      <div class="workspace-pane">
        <header class="workspace-code-header">
          <button
            type="button"
            :title="store.activeSourceName"
            aria-haspopup="dialog"
            @click="showSources = true"
          >
            {{ store.activeSourceName
            }}<small v-if="store.sourceCount > 1"> ({{ store.sourceCount }})</small>
          </button>
          <span>Original</span>
        </header>
        <CodePanel
          ref="originalPanelRef"
          :code="store.activeSourceContent"
          :filename="store.activeSourceName"
          side="original"
          :search-query="props.searchQuery"
          class="flex-1"
          @segment-click="handleOriginalSegmentClick"
        />
      </div>

      <!-- Right: Generated code -->
      <div class="workspace-pane">
        <header class="workspace-code-header">
          <span
            class="workspace-filename"
            :title="props.generatedFilename ?? store.parsedData?.file ?? 'output.js'"
            >{{ props.generatedFilename ?? store.parsedData?.file ?? "output.js" }}</span
          >
          <span>Generated</span>
        </header>
        <CodePanel
          ref="generatedPanelRef"
          :code="store.generatedCode"
          :filename="props.generatedFilename ?? store.parsedData?.file ?? 'output.js'"
          side="generated"
          :search-query="props.searchQuery"
          :line-statuses="props.genLineStatuses"
          class="flex-1"
          @segment-click="handleGeneratedSegmentClick"
        />
      </div>

      <!-- Connector arrow overlay -->
      <MappingConnector :original-panel="originalPanelRef" :generated-panel="generatedPanelRef" />
    </div>
  </div>
</template>
