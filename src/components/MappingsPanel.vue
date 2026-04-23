<script setup lang="ts">
import { computed, ref, nextTick } from "vue";
import IconCopy from "~icons/carbon/copy";
import IconCheckmark from "~icons/carbon/checkmark";
import { useSourceMapStore } from "../stores/sourceMap";
import { extractGeneratedSnippet, extractOriginalSnippet } from "../core/snippets";

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

interface MappingRow {
  i: number;
  seg: import("../core/types").MappingSegment;
  genLine: number;
  genCol: number;
  genSnippet: string;
  source: string;
  origLine: number;
  origCol: number;
  origSnippet: string;
  name: string | null;
  isBad: boolean;
  isSuspicious: boolean;
}

const mappingRows = computed<MappingRow[]>(() => {
  if (!store.parsedData) return [];

  const snippetOptions = { length: 30, appendEllipsis: true } as const;
  const data = store.parsedData;

  return store.mappingIndex.map((seg, i) => {
    const source = data.sources[seg.sourceIndex] ?? "?";
    const name = seg.nameIndex !== null ? data.names[seg.nameIndex] : null;
    const genSnippet = extractGeneratedSnippet(
      genLines.value,
      seg.generatedLine,
      seg.generatedColumn,
      snippetOptions,
    );
    const origLines = origLinesMap.value.get(seg.sourceIndex) ?? [];
    const origSnippet = extractOriginalSnippet(
      origLines,
      seg.originalLine,
      seg.originalColumn,
      snippetOptions,
    );

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
      isBad: store.badSegmentSet.has(seg),
      isSuspicious: store.splitTokenSegmentSet.has(seg),
    };
  });
});

const mappings = computed(() => {
  const q = filter.value.toLowerCase();
  if (!q) return mappingRows.value;

  return mappingRows.value.filter((m) => {
    return (
      `${m.genLine}:${m.genCol}`.includes(q) ||
      `${m.origLine}:${m.origCol}`.includes(q) ||
      m.source.toLowerCase().includes(q) ||
      m.genSnippet.toLowerCase().includes(q) ||
      m.origSnippet.toLowerCase().includes(q) ||
      (m.isSuspicious && "suspicious split-token identifier".includes(q)) ||
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
  const suspicious = store.splitTokenSegmentSet.size;
  return `${total} mappings, ${sources} source${sources !== 1 ? "s" : ""}, ${names} name${names !== 1 ? "s" : ""}${bad > 0 ? `, ${bad} bad` : ""}${suspicious > 0 ? `, ${suspicious} suspicious` : ""}`;
});

const copied = ref(false);

function copyMappings() {
  const header = `| Orig | Original code | → | Gen | Generated code | Source | Flag |${store.parsedData?.names?.length ? " Name |" : ""}`;
  const divider = `|------|--------------|---|-----|---------------|--------|------|${store.parsedData?.names?.length ? "------|" : ""}`;
  const rows = mappings.value.map((m) => {
    const flag = m.isBad ? "⚠ invalid" : m.isSuspicious ? "⚡ split-token" : "";
    const base = `| ${m.origLine}:${m.origCol} | \`${m.origSnippet}\` | → | ${m.genLine}:${m.genCol} | \`${m.genSnippet}\` | ${m.source} | ${flag} |`;
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
            <th class="px-2 py-1 w-10 text-center">Flag</th>
            <th v-if="store.parsedData?.names?.length" class="px-2 py-1 w-20">Name</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="m in mappings"
            :key="m.i"
            class="border-t border-edge hover:bg-blue-50 dark:hover:bg-blue-900/20 cursor-pointer"
            :class="[
              store.hoveredSegment === m.seg ? 'bg-yellow-50 dark:bg-yellow-900/20' : '',
              m.isBad && store.hoveredSegment !== m.seg ? 'bg-red-50 dark:bg-red-900/10' : '',
              m.isSuspicious && !m.isBad && store.hoveredSegment !== m.seg ? 'suspicious-row' : '',
            ]"
            :title="m.isSuspicious ? 'Suspicious: mapping cuts through an identifier' : undefined"
            :data-mapping-hovered="store.hoveredSegment === m.seg || undefined"
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
              class="px-2 py-0.5 whitespace-nowrap text-center"
              :class="
                m.isBad
                  ? 'text-red-600 dark:text-red-400'
                  : m.isSuspicious
                    ? 'suspicious-flag'
                    : 'text-fg-muted'
              "
            >
              {{ m.isBad ? "⚠" : m.isSuspicious ? "⚡" : "" }}
            </td>
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

<style scoped>
.suspicious-row {
  background: var(--connector-suspicious-bg);
}

.suspicious-flag {
  color: var(--connector-suspicious);
}
</style>
