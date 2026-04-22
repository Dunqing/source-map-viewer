<script setup lang="ts">
import { computed } from "vue";
import IconArrowLeft from "~icons/carbon/arrow-left";
import { parseSourceMap } from "../core/parser";
import { buildMappingIndex } from "../core/mapper";
import { validateMappings } from "../core/validator";
import { diffMappings } from "../core/diff";
import MappingDiffTable from "../components/MappingDiffTable.vue";

const props = defineProps<{
  entryA: { generatedCode: string; sourceMapJson: string; label: string };
  entryB: { generatedCode: string; sourceMapJson: string; label: string };
}>();

const parsedA = computed(() => parseSourceMap(props.entryA.sourceMapJson));
const parsedB = computed(() => parseSourceMap(props.entryB.sourceMapJson));

const indexA = computed(() => buildMappingIndex(parsedA.value.mappings));
const indexB = computed(() => buildMappingIndex(parsedB.value.mappings));

const diagnosticsA = computed(() => validateMappings(parsedA.value));
const diagnosticsB = computed(() => validateMappings(parsedB.value));

const diffResult = computed(() => diffMappings(indexA.value, indexB.value));

const genLinesA = computed(() => props.entryA.generatedCode.split("\n"));
const genLinesB = computed(() => props.entryB.generatedCode.split("\n"));

const origLinesA = computed(() => parsedA.value.sourcesContent.map((c) => (c ?? "").split("\n")));
const origLinesB = computed(() => parsedB.value.sourcesContent.map((c) => (c ?? "").split("\n")));
</script>

<template>
  <div class="min-h-screen bg-base">
    <!-- Header -->
    <div class="border-b border-edge bg-panel px-4 py-3">
      <div class="flex items-center gap-3 max-w-6xl mx-auto">
        <a
          href="/"
          class="flex items-center gap-1 text-sm text-fg-muted hover:text-fg-dim transition"
        >
          <IconArrowLeft class="w-4 h-4" />
          Back
        </a>
        <div class="flex-1 min-w-0">
          <h1 class="text-sm font-bold text-fg truncate">Source Map Comparison</h1>
          <div class="flex items-center gap-4 text-xs text-fg-muted mt-0.5">
            <span>
              <span class="font-semibold text-fg-dim">A:</span>
              {{ entryA.label }}
              ({{ indexA.length }} mappings<template v-if="diagnosticsA.length"
                >,
                <span class="text-amber-600 dark:text-amber-400"
                  >{{ diagnosticsA.length }} issues</span
                ></template
              >)
            </span>
            <span>
              <span class="font-semibold text-fg-dim">B:</span>
              {{ entryB.label }}
              ({{ indexB.length }} mappings<template v-if="diagnosticsB.length"
                >,
                <span class="text-amber-600 dark:text-amber-400"
                  >{{ diagnosticsB.length }} issues</span
                ></template
              >)
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- Diff table -->
    <div class="max-w-6xl mx-auto p-4">
      <MappingDiffTable
        :entries="diffResult.entries"
        :summary="diffResult.summary"
        :sources-a="parsedA.sources"
        :sources-b="parsedB.sources"
        :gen-lines-a="genLinesA"
        :gen-lines-b="genLinesB"
        :orig-lines-a="origLinesA"
        :orig-lines-b="origLinesB"
      />
    </div>
  </div>
</template>
