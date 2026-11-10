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
  const note = store.splitTokenSegmentSet.has(seg)
    ? " · suspicious: mapping cuts through an identifier"
    : "";

  return `${source} ${seg.originalLine + 1}:${seg.originalColumn}${name ? ` (${name})` : ""} → Generated ${seg.generatedLine + 1}:${seg.generatedColumn}${note}`;
});
</script>

<template>
  <footer class="workspace-footer text-fg-dim">
    <span :title="statusText">{{ statusText }}</span>
    <div class="footer-spacer" />
    <button
      v-if="store.stats"
      class="hover:text-blue-500 transition"
      @click="emit('toggleMappings')"
    >
      {{ store.stats.totalMappings }} mappings ▴
    </button>
  </footer>
</template>
