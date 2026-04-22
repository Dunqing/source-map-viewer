<script setup lang="ts">
import { computed, ref, nextTick } from "vue";
import IconCopy from "~icons/carbon/copy";
import IconCheckmark from "~icons/carbon/checkmark";
import { useSourceMapStore } from "../stores/sourceMap";

const store = useSourceMapStore();
const filter = ref("");

const emit = defineEmits<{
  clickMapping: [segment: import("../core/types").MappingSegment];
}>();

const genLines = computed(() => store.generatedCode.split("\n"));
const origLinesMap = computed(() => {
  const map = new Map<number, string[]>();
  if (!store.parsedData) return map;
  store.parsedData.sourcesContent.forEach((content, i) => {
    map.set(i, content?.split("\n") ?? []);
  });
  return map;
});

function getSnippet(lines: string[], line: number, col: number, maxLen = 30): string {
  const text = lines[line] ?? "";
  const snippet = text.slice(col, col + maxLen);
  return snippet.length >= maxLen ? snippet + "..." : snippet;
}

const mappings = computed(() => {
  if (!store.parsedData) return [];

  const q = filter.value.toLowerCase();
  return store.mappingIndex
    .map((seg, i) => {
      const source = store.parsedData!.sources[seg.sourceIndex] ?? "?";
      const name = seg.nameIndex !== null ? store.parsedData!.names[seg.nameIndex] : null;
      const genSnippet = getSnippet(genLines.value, seg.generatedLine, seg.generatedColumn);
      const origLines = origLinesMap.value.get(seg.sourceIndex) ?? [];
      const origSnippet = getSnippet(origLines, seg.originalLine, seg.originalColumn);
      const isBad = store.badSegmentSet.has(seg);
      return {
        i,
        seg,
        genLine: seg.generatedLine + 1,
        genCol: seg.generatedColumn,
        genSnippet,
        source,
        origLine: seg.originalLine + 1,
        origCol: seg.originalColumn,
        origSnippet,
        name,
        isBad,
        isHovered: seg === store.hoveredSegment,
      };
    })
    .filter((m) => {
      if (!q) return true;
      return (
        `${m.genLine}:${m.genCol}`.includes(q) ||
        `${m.origLine}:${m.origCol}`.includes(q) ||
        m.source.toLowerCase().includes(q) ||
        m.genSnippet.toLowerCase().includes(q) ||
        m.origSnippet.toLowerCase().includes(q) ||
        (m.name?.toLowerCase().includes(q) ?? false)
      );
    });
});

function scrollToHovered() {
  nextTick(() => {
    const el = document.querySelector('[data-mapping-hovered="true"]');
    if (el) el.scrollIntoView({ block: "center", behavior: "smooth" });
  });
}

defineExpose({ scrollToHovered });

const summary = computed(() => {
  if (!store.parsedData) return "";
  const total = store.mappingIndex.length;
  const sources = store.parsedData.sources.length;
  const names = store.parsedData.names.length;
  const bad = store.diagnostics.length;
  return `${total} mappings, ${sources} source${sources !== 1 ? "s" : ""}, ${names} name${names !== 1 ? "s" : ""}${bad > 0 ? `, ${bad} bad` : ""}`;
});

const copied = ref(false);

function copyMappings() {
  const header = `| Orig | Original code | → | Gen | Generated code | Source |${store.parsedData?.names?.length ? " Name |" : ""}`;
  const divider = `|------|--------------|---|-----|---------------|--------|${store.parsedData?.names?.length ? "------|" : ""}`;
  const rows = mappings.value.map((m) => {
    const base = `| ${m.origLine}:${m.origCol} | \`${m.origSnippet}\` | → | ${m.genLine}:${m.genCol} | \`${m.genSnippet}\` | ${m.source} |`;
    return store.parsedData?.names?.length ? `${base} ${m.name ?? ""} |` : base;
  });

  const text = [`Source Map Mappings (${summary.value})`, "", header, divider, ...rows].join("\n");

  navigator.clipboard.writeText(text).then(() => {
    copied.value = true;
    setTimeout(() => {
      copied.value = false;
    }, 2000);
  });
}
</script>

<template>
  <div class="flex flex-col border-t border-edge bg-surface h-80 text-xs overflow-hidden">
    <div class="px-3 py-2 border-b border-edge flex items-center gap-3">
      <div>
        <span class="font-medium text-fg">Mappings</span>
        <span class="text-fg-muted ml-2">{{ summary }}</span>
      </div>
      <input
        v-model="filter"
        class="flex-1 rounded border border-edge bg-muted px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
        placeholder="Filter by line, code, source, name..."
      />
      <button
        class="p-1.5 rounded hover:bg-muted transition shrink-0"
        title="Copy mappings as markdown"
        @click="copyMappings"
      >
        <IconCheckmark v-if="copied" class="w-4 h-4 text-green-500" />
        <IconCopy v-else class="w-4 h-4" />
      </button>
    </div>
    <div class="flex-1 overflow-auto font-mono">
      <table class="w-full">
        <thead class="sticky top-0 bg-muted">
          <tr class="text-left text-fg-muted">
            <th class="px-2 py-1 w-20">Orig</th>
            <th class="px-2 py-1">Original code</th>
            <th class="px-2 py-1 w-8 text-center">→</th>
            <th class="px-2 py-1 w-20">Gen</th>
            <th class="px-2 py-1">Generated code</th>
            <th class="px-2 py-1 w-24">Source</th>
            <th v-if="store.parsedData?.names?.length" class="px-2 py-1 w-20">Name</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="m in mappings"
            :key="m.i"
            class="border-t border-edge hover:bg-blue-50 dark:hover:bg-blue-900/20 cursor-pointer"
            :class="[
              m.isHovered ? 'bg-yellow-50 dark:bg-yellow-900/20' : '',
              m.isBad && !m.isHovered ? 'bg-red-50 dark:bg-red-900/10' : '',
            ]"
            :data-mapping-hovered="m.isHovered || undefined"
            @mouseenter="store.setHoveredSegment(m.seg)"
            @mouseleave="store.setHoveredSegment(null)"
            @click="emit('clickMapping', m.seg)"
          >
            <td class="px-2 py-0.5 text-green-600 dark:text-green-400 whitespace-nowrap">
              {{ m.origLine }}:{{ m.origCol }}
            </td>
            <td class="px-2 py-0.5 text-fg-dim truncate max-w-48">
              {{ m.origSnippet }}
            </td>
            <td class="px-2 py-0.5 text-fg-muted text-center">→</td>
            <td class="px-2 py-0.5 text-blue-600 dark:text-blue-400 whitespace-nowrap">
              {{ m.genLine }}:{{ m.genCol }}
            </td>
            <td class="px-2 py-0.5 text-fg-dim truncate max-w-48">
              {{ m.genSnippet }}
            </td>
            <td class="px-2 py-0.5 text-fg-muted truncate">{{ m.source }}</td>
            <td
              v-if="store.parsedData?.names?.length"
              class="px-2 py-0.5 text-purple-600 dark:text-purple-400"
            >
              {{ m.name ?? "" }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
