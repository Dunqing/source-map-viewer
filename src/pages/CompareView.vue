<script setup lang="ts">
import { computed } from "vue";
import IconArrowLeft from "~icons/carbon/arrow-left";
import { parseSourceMap } from "../core/parser";
import { buildMappingIndex, buildVisibleGeneratedMappingIndex } from "../core/mapper";
import { validateMappings } from "../core/validator";
import { diffMappings } from "../core/diff";
import MappingDiffTable from "../components/MappingDiffTable.vue";

const props = defineProps<{
  entryA: { generatedCode: string; sourceMapJson: string; label: string };
  entryB: { generatedCode: string; sourceMapJson: string; label: string };
  slugA?: string;
  slugB?: string;
}>();

const parsedA = computed(() => parseSourceMap(props.entryA.sourceMapJson));
const parsedB = computed(() => parseSourceMap(props.entryB.sourceMapJson));

const genLinesA = computed(() => props.entryA.generatedCode.split("\n"));
const genLinesB = computed(() => props.entryB.generatedCode.split("\n"));

const indexA = computed(() => buildMappingIndex(parsedA.value.mappings));
const indexB = computed(() => buildMappingIndex(parsedB.value.mappings));
const compareIndexA = computed(() =>
  buildVisibleGeneratedMappingIndex(indexA.value, genLinesA.value),
);
const compareIndexB = computed(() =>
  buildVisibleGeneratedMappingIndex(indexB.value, genLinesB.value),
);

const diagnosticsA = computed(() => validateMappings(parsedA.value));
const diagnosticsB = computed(() => validateMappings(parsedB.value));

const diffResult = computed(() =>
  diffMappings(compareIndexA.value, compareIndexB.value, {
    sourcesA: parsedA.value.sources,
    sourcesB: parsedB.value.sources,
  }),
);

const origLinesA = computed(() => parsedA.value.sourcesContent.map((c) => (c ?? "").split("\n")));
const origLinesB = computed(() => parsedB.value.sourcesContent.map((c) => (c ?? "").split("\n")));

function viewerHref(slug?: string): string | null {
  return slug ? `/${slug}` : null;
}

function displayId(slug: string | undefined, fallback: string): string {
  if (!slug) return fallback;
  return slug.length > 12 ? `${slug.slice(0, 12)}...` : slug;
}

function compareCountLabel(visibleCount: number, rawCount: number): string {
  return visibleCount === rawCount
    ? `${visibleCount} mappings`
    : `${visibleCount} compared, ${rawCount} raw`;
}
</script>

<template>
  <div class="min-h-screen bg-base">
    <!-- Header -->
    <div class="border-b border-edge bg-panel px-4 py-3">
      <div class="flex items-start gap-3 max-w-6xl mx-auto">
        <a
          href="/"
          class="flex items-center gap-1 text-sm text-fg-muted hover:text-fg-dim transition"
        >
          <IconArrowLeft class="w-4 h-4" />
          Back
        </a>
        <div class="flex-1 min-w-0">
          <h1 class="text-sm font-bold text-fg truncate">Source Map Comparison</h1>
          <div class="flex flex-wrap items-center gap-2 mt-1 text-xs">
            <div
              class="inline-flex items-center gap-2 rounded-full border border-edge bg-base px-2.5 py-1 min-w-0"
            >
              <span class="font-semibold text-fg-dim shrink-0">A</span>
              <a
                v-if="viewerHref(slugA)"
                :href="viewerHref(slugA)!"
                target="_blank"
                rel="noreferrer"
                class="font-mono text-fg hover:text-fg-dim underline decoration-dotted truncate"
              >
                {{ displayId(slugA, entryA.label) }}
              </a>
              <span v-else class="font-mono text-fg truncate">{{ entryA.label }}</span>
              <span class="text-fg-muted shrink-0">
                {{ compareCountLabel(compareIndexA.length, indexA.length)
                }}<template v-if="diagnosticsA.length"
                  >,
                  <span class="text-amber-600 dark:text-amber-400"
                    >{{ diagnosticsA.length }} issues</span
                  ></template
                >
              </span>
            </div>
            <div
              class="inline-flex items-center gap-2 rounded-full border border-edge bg-base px-2.5 py-1 min-w-0"
            >
              <span class="font-semibold text-fg-dim shrink-0">B</span>
              <a
                v-if="viewerHref(slugB)"
                :href="viewerHref(slugB)!"
                target="_blank"
                rel="noreferrer"
                class="font-mono text-fg hover:text-fg-dim underline decoration-dotted truncate"
              >
                {{ displayId(slugB, entryB.label) }}
              </a>
              <span v-else class="font-mono text-fg truncate">{{ entryB.label }}</span>
              <span class="text-fg-muted shrink-0">
                {{ compareCountLabel(compareIndexB.length, indexB.length)
                }}<template v-if="diagnosticsB.length"
                  >,
                  <span class="text-amber-600 dark:text-amber-400"
                    >{{ diagnosticsB.length }} issues</span
                  ></template
                >
              </span>
            </div>
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
        :raw-mappings-a="indexA"
        :raw-mappings-b="indexB"
      />
    </div>
  </div>
</template>
