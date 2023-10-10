<script setup lang="ts">
import { useSourceMapStore } from "../stores/sourceMap";
import { computed } from "vue";

const store = useSourceMapStore();

const emit = defineEmits<{
  toggleMappings: [];
}>();

const statusText = computed(() => {
  const seg = store.hoveredSegment;
  if (!seg) return "Hover over code to see mapping info";

  const source = store.parsedData?.sources[seg.sourceIndex] ?? "unknown";
  const name = seg.nameIndex !== null ? store.parsedData?.names[seg.nameIndex] : null;

  return `Generated ${seg.generatedLine + 1}:${seg.generatedColumn} → ${source} ${seg.originalLine + 1}:${seg.originalColumn}${name ? ` (${name})` : ""}`;
});
</script>

<template>
  <div class="flex items-center px-4 py-1 border-t border-edge bg-surface text-xs text-fg-dim">
    <span>{{ statusText }}</span>
    <div class="flex-1" />
    <button
      v-if="store.stats"
      class="hover:text-blue-500 transition"
      @click="emit('toggleMappings')"
    >
      {{ store.stats.totalMappings }} mappings ▴
    </button>
  </div>
</template>
