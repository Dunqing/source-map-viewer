import { computed, ref, onMounted } from "vue";
import { useSourceMapStore } from "../stores/sourceMap";
import { generateDebugPrompt } from "../core/prompt";

export function useAiDebugPrompt() {
  const store = useSourceMapStore();
  const visualizationUrl = ref("");

  onMounted(() => {
    visualizationUrl.value = window.location.href;
  });

  const prompt = computed(() => {
    if (!store.parsedData) return "";

    return generateDebugPrompt({
      generatedCode: store.generatedCode,
      sourceMapJson: store.sourceMapJson,
      parsedData: store.parsedData,
      mappingIndex: store.mappingIndex,
      diagnostics: store.diagnostics,
      badSegmentSet: store.badSegmentSet,
      visualizationUrl: visualizationUrl.value,
    });
  });

  return { prompt };
}
