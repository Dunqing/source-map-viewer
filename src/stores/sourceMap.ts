import {
  computed,
  getCurrentInstance,
  inject,
  provide,
  reactive,
  ref,
  shallowRef,
  type InjectionKey,
  type UnwrapNestedRefs,
} from "vue";
import type { ResolvedFileCollection } from "../core/inputResolver";
import type {
  InverseMappingIndex,
  MappingDiagnostic,
  MappingIndex,
  MappingSegment,
  SourceMapData,
  SourceMapStats,
} from "../core/types";
import { parseSourceMap } from "../core/parser";
import { buildInverseMappingIndex, buildMappingIndex, clampOriginalPosition } from "../core/mapper";
import { findTokenSplitSegments, validateMappings } from "../core/validator";
import { calculateStats } from "../core/stats";

function createSourceMapStore() {
  const generatedCode = ref("");
  const sourceMapJson = ref("");
  const generatedEntries = shallowRef<ResolvedFileCollection[]>([]);
  const activeGeneratedEntryIndex = ref(0);
  const sessionSlug = ref("");
  const sessionLabel = ref("");
  const parsedData = shallowRef<SourceMapData | null>(null);
  const mappingIndex = shallowRef<MappingIndex>([]);
  const inverseMappingIndex = shallowRef<InverseMappingIndex>(new Map());
  const diagnostics = shallowRef<MappingDiagnostic[]>([]);
  const stats = shallowRef<SourceMapStats | null>(null);
  const activeSourceIndex = ref(0);
  const hoveredSegment = shallowRef<MappingSegment | null>(null);
  const error = ref<string | null>(null);
  let pendingHoverSourceSync = 0;

  const activeSourceContent = computed(() => {
    if (!parsedData.value) return "";
    return parsedData.value.sourcesContent[activeSourceIndex.value] ?? "";
  });

  const activeSourceName = computed(() => {
    if (!parsedData.value) return "";
    return parsedData.value.sources[activeSourceIndex.value] ?? "";
  });

  const activeGeneratedEntry = computed(
    () => generatedEntries.value[activeGeneratedEntryIndex.value] ?? null,
  );
  const generatedEntryCount = computed(() => generatedEntries.value.length);
  const sourceCount = computed(() => parsedData.value?.sources.length ?? 0);

  const badSegmentSet = computed(
    () => new Set<MappingSegment>(diagnostics.value.map((d) => d.segment)),
  );

  /** Segments whose mapping boundaries split an identifier on either side. */
  const splitTokenSegmentSet = computed(() => {
    const data = parsedData.value;
    if (!data) return new Set<MappingSegment>();
    return findTokenSplitSegments(
      data,
      generatedCode.value,
      mappingIndex.value,
      inverseMappingIndex.value,
    );
  });

  /** Segments whose original position was clamped (out-of-bounds in source content). */
  const clampedSegmentSet = computed(() => {
    const data = parsedData.value;
    if (!data) return new Set<MappingSegment>();

    const set = new Set<MappingSegment>();
    const sourceLines = data.sourcesContent.map((c) => (c !== null ? c.split("\n") : null));

    for (const seg of data.mappings) {
      const lines = sourceLines[seg.sourceIndex];
      if (!lines) continue;
      const clamped = clampOriginalPosition(seg.originalLine, seg.originalColumn, lines);
      if (clamped.line !== seg.originalLine || clamped.column !== seg.originalColumn) {
        set.add(seg);
      }
    }
    return set;
  });

  function applySourceMap(code: string, mapJson: string) {
    try {
      error.value = null;
      generatedCode.value = code;
      sourceMapJson.value = mapJson;

      const data = parseSourceMap(mapJson);
      parsedData.value = data;
      mappingIndex.value = buildMappingIndex(data.mappings);
      inverseMappingIndex.value = buildInverseMappingIndex(data.mappings);
      diagnostics.value = validateMappings(data);
      stats.value = calculateStats(data, code, diagnostics.value, mappingIndex.value);
      // Warm hover-dependent sets eagerly so the first hover doesn't stall
      void clampedSegmentSet.value;
      void splitTokenSegmentSet.value;
      activeSourceIndex.value = 0;
      hoveredSegment.value = null;
      return true;
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Failed to parse source map";
      parsedData.value = null;
      mappingIndex.value = [];
      inverseMappingIndex.value = new Map();
      diagnostics.value = [];
      stats.value = null;
      hoveredSegment.value = null;
      return false;
    }
  }

  function loadSourceMap(code: string, mapJson: string) {
    generatedEntries.value = [];
    activeGeneratedEntryIndex.value = 0;
    sessionSlug.value = "";
    sessionLabel.value = "";
    applySourceMap(code, mapJson);
  }

  function loadSourceMapCollection(
    entries: ResolvedFileCollection[],
    activeIndex = 0,
    slug = "",
    label = "",
  ) {
    generatedEntries.value = entries;
    sessionSlug.value = slug;
    sessionLabel.value = label;
    setActiveGeneratedEntry(activeIndex);
  }

  function setActiveGeneratedEntry(index: number) {
    if (index < 0 || index >= generatedEntries.value.length) return;
    activeGeneratedEntryIndex.value = index;
    const entry = generatedEntries.value[index];
    applySourceMap(entry.generatedCode, entry.sourceMapJson);
  }

  function setActiveSource(index: number) {
    if (parsedData.value && index >= 0 && index < parsedData.value.sources.length) {
      activeSourceIndex.value = index;
    }
  }

  function cancelPendingHoverSourceSync() {
    if (!pendingHoverSourceSync || typeof window === "undefined") return;
    window.cancelAnimationFrame(pendingHoverSourceSync);
    pendingHoverSourceSync = 0;
  }

  function setHoveredSegment(segment: MappingSegment | null) {
    hoveredSegment.value = segment;
    cancelPendingHoverSourceSync();

    if (!segment || segment.sourceIndex === activeSourceIndex.value) {
      return;
    }

    if (typeof window === "undefined") {
      setActiveSource(segment.sourceIndex);
      return;
    }

    pendingHoverSourceSync = window.requestAnimationFrame(() => {
      pendingHoverSourceSync = 0;
      if (hoveredSegment.value === segment) {
        setActiveSource(segment.sourceIndex);
      }
    });
  }

  function reset() {
    cancelPendingHoverSourceSync();
    generatedCode.value = "";
    sourceMapJson.value = "";
    generatedEntries.value = [];
    activeGeneratedEntryIndex.value = 0;
    sessionSlug.value = "";
    sessionLabel.value = "";
    parsedData.value = null;
    mappingIndex.value = [];
    inverseMappingIndex.value = new Map();
    diagnostics.value = [];
    stats.value = null;
    activeSourceIndex.value = 0;
    hoveredSegment.value = null;
    error.value = null;
  }

  return {
    generatedCode,
    sourceMapJson,
    generatedEntries,
    activeGeneratedEntryIndex,
    activeGeneratedEntry,
    generatedEntryCount,
    sessionSlug,
    sessionLabel,
    parsedData,
    mappingIndex,
    inverseMappingIndex,
    diagnostics,
    stats,
    activeSourceIndex,
    hoveredSegment,
    error,
    activeSourceContent,
    activeSourceName,
    sourceCount,
    badSegmentSet,
    splitTokenSegmentSet,
    clampedSegmentSet,
    loadSourceMap,
    loadSourceMapCollection,
    setActiveGeneratedEntry,
    setActiveSource,
    setHoveredSegment,
    reset,
  };
}

export type SourceMapStore = UnwrapNestedRefs<ReturnType<typeof createSourceMapStore>>;

/**
 * The global default store, used by the single-document viewer page and
 * anything outside a provider. Multi-instance contexts (the compare page)
 * should call `provideSourceMapStore()` in a parent to create a fresh
 * instance scoped to that subtree.
 */
const defaultStore: SourceMapStore = reactive(createSourceMapStore());

const STORE_KEY: InjectionKey<SourceMapStore> = Symbol("sourceMapStore");

/**
 * Create a fresh store and provide it to descendants. Components below this
 * point that call `useSourceMapStore()` see the local instance instead of
 * the singleton. Useful when mounting multiple sourcemap views in the same
 * page that should keep independent hover / active-source / scroll state.
 */
export function provideSourceMapStore(): SourceMapStore {
  const instance: SourceMapStore = reactive(createSourceMapStore());
  provide(STORE_KEY, instance);
  return instance;
}

export function useSourceMapStore(): SourceMapStore {
  // `inject` only works inside a Vue setup context — outside that (tests
  // calling this from `beforeEach`, composables called early, etc.) it
  // returns undefined regardless of any default. Fall back to the singleton
  // so callers always get a usable store.
  if (getCurrentInstance()) {
    const provided = inject(STORE_KEY, undefined as SourceMapStore | undefined);
    if (provided) return provided;
  }
  return defaultStore;
}
