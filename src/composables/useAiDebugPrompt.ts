import { computed, ref, onMounted } from "vue";
import { useSourceMapStore } from "../stores/sourceMap";
import { generateDebugPrompt, analyzeQuality } from "../core/prompt";

export function useAiDebugPrompt() {
  const store = useSourceMapStore();
  const visualizationUrl = ref("");

  onMounted(() => {
    const url = new URL(window.location.href);
    url.searchParams.delete("seg");
    visualizationUrl.value = url.toString();
  });

  const prompt = computed(() => {
    if (!store.parsedData) return "";

    const coveragePercent = store.stats?.coveragePercent ?? 0;
    const qualityWarnings = analyzeQuality(store.parsedData, store.generatedCode, coveragePercent);

    return generateDebugPrompt({
      generatedCode: store.generatedCode,
      sourceMapJson: store.sourceMapJson,
      parsedData: store.parsedData,
      mappingIndex: store.mappingIndex,
      diagnostics: store.diagnostics,
      badSegmentSet: store.badSegmentSet,
      splitTokenSegmentSet: store.splitTokenSegmentSet,
      qualityWarnings,
      coveragePercent,
      visualizationUrl: visualizationUrl.value,
    });
  });

  return { prompt };
}
