<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from "vue";
import VisualizationPane from "./VisualizationPane.vue";
import { provideSourceMapStore } from "../stores/sourceMap";
import { useCrossPaneHover } from "../composables/useCrossPaneHover";
import { useCrossPaneScroll } from "../composables/useCrossPaneScroll";
import { LINE_HEIGHT } from "../constants";
import type { DiffEntry } from "../core/diff";
import type { MappingSegment } from "../core/types";

/**
 * One side of the compare-page Code panes view. Hosts a fresh
 * `SourceMapStore` instance via provide/inject and renders the
 * full main-viewer experience for that one sourcemap. Each side
 * has independent state. Cross-pane hover sync (when the parent
 * provides via `useCrossPaneHover`) pairs entries across A and B
 * by `DiffEntry` identity — so hovering a token in A lights up
 * its bipartite-matched counterpart in B regardless of source
 * name differences.
 */
const props = defineProps<{
  generatedCode: string;
  sourceMapJson: string;
  filename: string;
  /**
   * Per-line gutter status for the generated-side `CodePanel`. Keys are
   * 0-based line numbers; values pick the marker color via `CodePanel`'s
   * `lineStatuses` prop.
   */
  genLineStatuses?: Map<number, "shifted" | "changed" | "removed" | "added">;
  /**
   * Which side of the compare this pane represents. Used by the cross-pane
   * hover sync to look up the right segment from each `DiffEntry`.
   */
  side: "a" | "b";
  /**
   * The full unfiltered diff entries. Used purely as a lookup table for
   * cross-pane hover pairing — even when the diff table is filtered to a
   * pattern's members, hover should still cross over for non-member entries.
   */
  entries: DiffEntry[];
}>();

const store = provideSourceMapStore();

const visualizationPaneRef = ref<InstanceType<typeof VisualizationPane> | null>(null);

watch(
  () => [props.generatedCode, props.sourceMapJson] as const,
  ([code, json]) => {
    store.loadSourceMap(code, json);
  },
  { immediate: true },
);

// Cross-pane hover sync. The shared ref carries a DiffEntry; this side
// maps its local hovered segment to/from `entry[props.side]`.
const sharedHover = useCrossPaneHover();

/**
 * Segments are compared by value, not identity. Each `CompareCodePane`
 * parses its own copy of the sourcemap into a fresh local store, so the
 * `MappingSegment` instances here are distinct JavaScript objects from
 * the ones in `CompareView`'s `diffResult.entries` (parsed independently
 * at the page level). Match on the full position tuple — within a single
 * sourcemap that uniquely identifies a segment.
 */
function segmentEquals(a: MappingSegment, b: MappingSegment): boolean {
  return (
    a.generatedLine === b.generatedLine &&
    a.generatedColumn === b.generatedColumn &&
    a.originalLine === b.originalLine &&
    a.originalColumn === b.originalColumn &&
    a.sourceIndex === b.sourceIndex &&
    a.nameIndex === b.nameIndex
  );
}

if (sharedHover) {
  // Local → shared. Find the diff entry whose side-segment matches the
  // hovered local segment by value. Skip the write when the entry is
  // unchanged so the mirror watcher on the other pane doesn't bounce back.
  watch(
    () => store.hoveredSegment,
    (seg) => {
      const entry = seg
        ? (props.entries.find((e) => {
            const sideSeg = e[props.side];
            return sideSeg !== null && segmentEquals(sideSeg, seg);
          }) ?? null)
        : null;
      if (sharedHover.value !== entry) {
        sharedHover.value = entry;
      }
    },
  );

  // Shared → local. The diff entry's segment was parsed at the page level;
  // find the matching segment in our local `mappingIndex` (by value), then
  // hover that. Skip when local hover already covers the right position.
  watch(sharedHover, (entry) => {
    const targetSpec = entry ? entry[props.side] : null;
    if (!targetSpec) {
      if (store.hoveredSegment !== null) store.setHoveredSegment(null);
      return;
    }
    if (store.hoveredSegment && segmentEquals(store.hoveredSegment, targetSpec)) {
      return;
    }
    const localMatch = store.mappingIndex.find((s) => segmentEquals(s, targetSpec));
    if (localMatch) store.setHoveredSegment(localMatch);
  });
}

// Cross-pane scroll sync. Both panes show generated code in their right-hand
// `CodePanel`; syncing top line keeps the user looking at the same place in
// both A and B as they scroll either one. We deliberately do NOT sync the
// left-hand original/source panel — A and B may show different source files,
// so syncing those would be confusing.
const sharedScroll = useCrossPaneScroll();

if (sharedScroll) {
  let detachScroll: (() => void) | null = null;
  let isApplyingRemoteScroll = false;

  function getGeneratedContainer(): HTMLElement | null {
    const codePanel = visualizationPaneRef.value?.generatedPanelRef as
      | { containerRef?: HTMLElement | null }
      | null
      | undefined;
    return codePanel?.containerRef ?? null;
  }

  function attach(container: HTMLElement) {
    detachScroll?.();
    const handler = () => {
      if (isApplyingRemoteScroll) return;
      const topLine = Math.round(container.scrollTop / LINE_HEIGHT);
      const current = sharedScroll!.value;
      if (current && current.side === props.side && current.topLine === topLine) return;
      sharedScroll!.value = { side: props.side, topLine };
    };
    container.addEventListener("scroll", handler, { passive: true });
    detachScroll = () => container.removeEventListener("scroll", handler);
  }

  // Re-attach whenever the inner VisualizationPane (and thus its generated
  // CodePanel container) re-renders due to the input sourcemap changing.
  watch(
    () => visualizationPaneRef.value,
    () => {
      const container = getGeneratedContainer();
      if (container) attach(container);
    },
    { immediate: true, flush: "post" },
  );

  watch(sharedScroll, (state) => {
    if (!state || state.side === props.side) return;
    const container = getGeneratedContainer();
    if (!container) return;
    const target = state.topLine * LINE_HEIGHT;
    if (Math.abs(container.scrollTop - target) < 1) return;
    isApplyingRemoteScroll = true;
    container.scrollTop = target;
    // Native scroll event fires synchronously after assignment; clear flag
    // on the next microtask so our handler skips this round-trip write.
    queueMicrotask(() => {
      isApplyingRemoteScroll = false;
    });
  });

  onBeforeUnmount(() => {
    detachScroll?.();
  });
}
</script>

<template>
  <VisualizationPane
    ref="visualizationPaneRef"
    :generated-filename="filename"
    :gen-line-statuses="genLineStatuses"
  />
</template>
