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
import { buildInverseMappingIndex, buildMappingIndex } from "../core/mapper";
import { validateMappings } from "../core/validator";
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

  function setHoveredSegment(segment: MappingSegment | null) {
    hoveredSegment.value = segment;
    if (segment && segment.sourceIndex !== activeSourceIndex.value) {
      setActiveSource(segment.sourceIndex);
    }
  }

  function reset() {
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
