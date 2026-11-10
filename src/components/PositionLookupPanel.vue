<script setup lang="ts">
import { computed, nextTick, onMounted, ref, toRaw, watch } from "vue";
import IconClose from "~icons/carbon/close";
import { useSourceMapStore } from "../stores/sourceMap";
import { lookupPosition, parsePositionInput, type PositionQuery } from "../core/positionLookup";
import type { MappingSegment } from "../core/types";

const props = defineProps<{
  query: PositionQuery | null;
  selectedSegment: MappingSegment | null;
}>();
const emit = defineEmits<{
  lookup: [query: PositionQuery];
  select: [segment: MappingSegment];
  close: [];
}>();
const store = useSourceMapStore();
const side = ref<PositionQuery["side"]>("generated");
const sourceIndex = ref(store.activeSourceIndex);
const input = ref("");
const columnBase = ref<0 | 1>(0);
const inputRef = ref<HTMLInputElement | null>(null);
const error = ref("");
const visibleMatches = ref(50);
let submittedQuery: PositionQuery | null = null;

watch(
  () => props.query,
  (query) => {
    visibleMatches.value = 50;
    error.value = "";
    if (!query || toRaw(query) === submittedQuery) return;
    side.value = query.side;
    sourceIndex.value = query.sourceIndex;
    input.value = `${query.line + 1}:${query.column}`;
    columnBase.value = 0;
  },
  { immediate: true },
);

const result = computed(() =>
  props.query && store.parsedData
    ? lookupPosition(store.parsedData, store.generatedCode, props.query)
    : null,
);
const title = computed(() => {
  switch (result.value?.kind) {
    case "exact":
      return "Exact mapping point";
    case "range":
      return "Inside a mapped range";
    case "unmapped":
      return "Unmapped position";
    case "out-of-bounds":
      return "Position outside loaded code";
    default:
      return "";
  }
});

function matchesFilename(path: string, filename: string): boolean {
  const normalize = (value: string) => value.split(/[?#]/)[0].replace(/\\/g, "/");
  const a = normalize(path);
  const b = normalize(filename);
  return a === b || a.endsWith(`/${b}`) || b.endsWith(`/${a}`);
}

function submit() {
  error.value = "";
  try {
    const position = parsePositionInput(input.value, columnBase.value);
    let selectedSource = sourceIndex.value;
    if (position.filename && store.parsedData) {
      if (side.value === "original") {
        const candidates = store.parsedData.sources
          .map((source, index) => (matchesFilename(source, position.filename!) ? index : -1))
          .filter((index) => index >= 0);
        if (!candidates.includes(selectedSource)) {
          if (candidates.length !== 1) {
            throw new Error(
              candidates.length === 0
                ? `No original source matches ${position.filename}. Choose a source and enter line:column.`
                : "Multiple sources match this filename. Choose the source before looking up the frame.",
            );
          }
          selectedSource = candidates[0];
        }
      } else {
        const filenames = [store.activeGeneratedEntry?.entryPath, store.parsedData.file].filter(
          (name): name is string => !!name,
        );
        if (
          filenames.length &&
          !filenames.some((name) => matchesFilename(name, position.filename!))
        ) {
          throw new Error(
            `This frame is for ${position.filename}. Load that generated file, or enter line:column to inspect the current file.`,
          );
        }
      }
    }
    sourceIndex.value = selectedSource;
    submittedQuery = {
      side: side.value,
      line: position.line,
      column: position.column,
      sourceIndex: side.value === "original" ? selectedSource : 0,
    };
    emit("lookup", submittedQuery);
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : "Enter a valid position.";
  }
}

function focusInput() {
  nextTick(() => inputRef.value?.focus());
}
onMounted(focusInput);
defineExpose({ focusInput });
</script>

<template>
  <section aria-label="Position lookup" class="text-xs">
    <div class="mb-2 flex items-center justify-between gap-3">
      <h2 class="font-semibold text-fg">Find position</h2>
      <button
        type="button"
        aria-label="Close position lookup"
        class="rounded p-1 text-fg-muted hover:bg-muted hover:text-fg"
        @click="emit('close')"
      >
        <IconClose class="h-4 w-4" />
      </button>
    </div>
    <form class="flex flex-wrap items-end gap-2" @submit.prevent="submit">
      <label class="flex flex-col gap-1 text-fg-dim">
        Side
        <select v-model="side" class="rounded border border-edge bg-panel px-2 py-1.5 text-fg">
          <option value="generated">Generated</option>
          <option value="original">Original</option>
        </select>
      </label>
      <label v-if="side === 'original'" class="flex min-w-0 max-w-full flex-col gap-1 text-fg-dim">
        Source file
        <select
          v-model="sourceIndex"
          class="max-w-full rounded border border-edge bg-panel px-2 py-1.5 text-fg"
        >
          <option v-for="(source, index) in store.parsedData?.sources" :key="index" :value="index">
            {{ source }}
          </option>
        </select>
      </label>
      <label class="flex min-w-40 flex-1 flex-col gap-1 text-fg-dim">
        Position or stack frame
        <input
          ref="inputRef"
          v-model="input"
          type="text"
          autofocus
          required
          spellcheck="false"
          autocomplete="off"
          aria-describedby="position-lookup-help"
          :aria-invalid="!!error"
          class="w-full rounded border border-edge bg-panel px-2 py-1.5 font-mono text-fg outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="1:42 or at calculateTotal (app.js:1:43)"
        />
      </label>
      <label class="flex flex-col gap-1 text-fg-dim">
        Column format
        <select
          v-model="columnBase"
          class="rounded border border-edge bg-panel px-2 py-1.5 text-fg"
        >
          <option :value="0">Source map: starts at 0</option>
          <option :value="1">Stack trace: starts at 1</option>
        </select>
      </label>
      <button
        type="submit"
        class="rounded bg-blue-600 px-4 py-1.5 font-medium text-white hover:bg-blue-500"
      >
        Go
      </button>
    </form>
    <p id="position-lookup-help" class="mt-2 text-fg-muted">
      Lines start at 1. Choose the input column format; results always use columns starting at 0.
      Generated lookups inspect the currently loaded file.
    </p>
    <p v-if="error" role="alert" class="mt-2 text-red-500">{{ error }}</p>
    <div v-if="result && query" aria-live="polite" class="mt-3 border-t border-edge pt-2">
      <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 class="font-semibold text-fg" data-lookup-kind>{{ title }}</h3>
        <span class="font-mono text-fg-dim"
          >{{
            query.side === "generated" ? "Generated" : store.parsedData?.sources[query.sourceIndex]
          }}
          {{ query.line + 1 }}:{{ query.column }}</span
        >
      </div>
      <p class="mt-1 text-fg-dim">{{ result.message }}</p>
      <p v-if="result.kind === 'range'" class="mt-1 text-fg-muted">
        The preceding mapping applies. Its original position is an anchor; character offsets are not
        interpolated.
      </p>
      <p
        v-if="query.side === 'generated' && result.matches.length && result.endColumn !== null"
        class="mt-1 font-mono text-fg-muted"
      >
        Generated range: {{ query.line + 1 }}:{{ result.matches[0].generatedColumn }}–{{
          query.line + 1
        }}:{{ result.endColumn }} (end exclusive)
      </p>
      <p v-if="result.matches.length" class="mt-2 text-fg-muted">
        {{ result.matches.length }} mapping{{ result.matches.length === 1 ? "" : "s" }}. Select a
        result to focus both panes.
      </p>
      <ul v-if="result.matches.length" class="mt-1 max-h-32 overflow-auto">
        <li v-for="(segment, index) in result.matches.slice(0, visibleMatches)" :key="index">
          <button
            type="button"
            class="w-full rounded px-2 py-1.5 text-left font-mono text-fg-dim hover:bg-muted"
            :class="{ 'bg-muted text-fg': selectedSegment === segment }"
            :aria-pressed="selectedSegment === segment"
            @click="emit('select', segment)"
          >
            {{ store.parsedData?.sources[segment.sourceIndex] }} {{ segment.originalLine + 1 }}:{{
              segment.originalColumn
            }}
            → {{ store.parsedData?.file || "Generated" }} {{ segment.generatedLine + 1 }}:{{
              segment.generatedColumn
            }}
            <span v-if="segment.nameIndex !== null" class="text-fg-muted">
              · {{ store.parsedData?.names[segment.nameIndex] }}</span
            >
          </button>
        </li>
      </ul>
      <button
        v-if="result.matches.length > visibleMatches"
        type="button"
        class="mt-1 text-fg-dim underline"
        @click="visibleMatches += 50"
      >
        Show more ({{ visibleMatches }} of {{ result.matches.length }})
      </button>
    </div>
  </section>
</template>
