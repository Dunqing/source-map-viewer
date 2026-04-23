import { computed, reactive, ref, shallowRef } from "vue";
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

  function loadSourceMap(code: string, mapJson: string) {
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
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Failed to parse source map";
      parsedData.value = null;
      mappingIndex.value = [];
      inverseMappingIndex.value = new Map();
      diagnostics.value = [];
      stats.value = null;
    }
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
    setActiveSource,
    setHoveredSegment,
    reset,
  };
}

const store = reactive(createSourceMapStore());

export function useSourceMapStore() {
  return store;
}
