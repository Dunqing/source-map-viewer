<script setup lang="ts">
import { ref, computed } from "vue";
import type { DiffEntry, DiffSummary } from "../core/diff";
import { extractGeneratedSnippet, extractOriginalSnippet } from "../core/snippets";

const props = defineProps<{
  entries: DiffEntry[];
  summary: DiffSummary;
  sourcesA: string[];
  sourcesB: string[];
  genLinesA: string[];
  genLinesB: string[];
  origLinesA: string[][];
  origLinesB: string[][];
}>();

const showSame = ref(false);
const expandedIndex = ref<string | null>(null);

const CONTEXT_LINES = 3;

const filteredEntries = computed(() =>
  showSame.value ? props.entries : props.entries.filter((e) => e.status !== "same"),
);

function entryKey(entry: DiffEntry): string {
  const seg = entry.a ?? entry.b!;
  return `${seg.generatedLine}:${seg.generatedColumn}:${entry.status}`;
}

function toggleExpand(key: string) {
  expandedIndex.value = expandedIndex.value === key ? null : key;
}

function statusIcon(status: DiffEntry["status"]): string {
  switch (status) {
    case "same":
      return "=";
    case "changed":
      return "~";
    case "removed":
      return "-";
    case "added":
      return "+";
  }
}

function formatPos(line: number, col: number): string {
  return `${line + 1}:${col}`;
}

function genSnippet(entry: DiffEntry, side: "a" | "b"): string {
  const seg = entry[side];
  if (!seg) return "";
  const lines = side === "a" ? props.genLinesA : props.genLinesB;
  return extractGeneratedSnippet(lines, seg.generatedLine, seg.generatedColumn);
}

function origPos(entry: DiffEntry, side: "a" | "b"): string {
  const seg = entry[side];
  if (!seg) return "";
  return `${seg.originalLine + 1}:${seg.originalColumn}`;
}

function origCode(entry: DiffEntry, side: "a" | "b"): string {
  const seg = entry[side];
  if (!seg) return "";
  const allLines = side === "a" ? props.origLinesA : props.origLinesB;
  const sourceLines = allLines[seg.sourceIndex] ?? [];
  return extractOriginalSnippet(sourceLines, seg.originalLine, seg.originalColumn);
}

function getContextLines(
  entry: DiffEntry,
  side: "a" | "b",
  type: "gen" | "orig",
): { lineNum: number; text: string; isTarget: boolean }[] {
  const seg = entry[side];
  if (!seg) return [];

  let lines: string[];
  let targetLine: number;

  if (type === "gen") {
    lines = side === "a" ? props.genLinesA : props.genLinesB;
    targetLine = seg.generatedLine;
  } else {
    const allLines = side === "a" ? props.origLinesA : props.origLinesB;
    lines = allLines[seg.sourceIndex] ?? [];
    targetLine = seg.originalLine;
  }

  const start = Math.max(0, targetLine - CONTEXT_LINES);
  const end = Math.min(lines.length, targetLine + CONTEXT_LINES + 1);
  const result: { lineNum: number; text: string; isTarget: boolean }[] = [];

  for (let i = start; i < end; i++) {
    result.push({ lineNum: i + 1, text: lines[i], isTarget: i === targetLine });
  }
  return result;
}

function statusClass(status: DiffEntry["status"]): string {
  switch (status) {
    case "changed":
      return "bg-amber-50 dark:bg-amber-900/20";
    case "removed":
      return "bg-red-50 dark:bg-red-900/20";
    case "added":
      return "bg-green-50 dark:bg-green-900/20";
    default:
      return "";
  }
}

function statusTextClass(status: DiffEntry["status"]): string {
  switch (status) {
    case "changed":
      return "text-amber-600 dark:text-amber-400";
    case "removed":
      return "text-red-600 dark:text-red-400";
    case "added":
      return "text-green-600 dark:text-green-400";
    default:
      return "text-fg-muted";
  }
}
</script>

<template>
  <div>
    <!-- Summary bar -->
    <div
      class="flex items-center gap-3 px-3 py-2 rounded-lg bg-surface border border-edge text-xs font-mono mb-3"
    >
      <span class="text-fg-muted">{{ summary.same }} same</span>
      <span class="text-amber-600 dark:text-amber-400 font-semibold">
        {{ summary.changed }} changed
      </span>
      <span class="text-red-600 dark:text-red-400 font-semibold">
        {{ summary.removed }} removed
      </span>
      <span class="text-green-600 dark:text-green-400 font-semibold">
        {{ summary.added }} added
      </span>
      <span class="ml-auto">
        <label class="flex items-center gap-1.5 cursor-pointer text-fg-muted">
          <input v-model="showSame" type="checkbox" class="rounded" />
          Show identical
        </label>
      </span>
    </div>

    <!-- Empty state -->
    <div
      v-if="filteredEntries.length === 0 && !showSame"
      class="text-center py-8 text-fg-muted text-sm"
    >
      No differences found. Source maps are identical.
    </div>

    <!-- Diff cards -->
    <div class="space-y-1">
      <div v-for="(entry, i) in filteredEntries" :key="i">
        <!-- Entry row -->
        <div
          class="flex items-start gap-2 px-3 py-1.5 rounded-lg border border-edge text-xs font-mono cursor-pointer"
          :class="[
            statusClass(entry.status),
            expandedIndex === entryKey(entry) ? 'rounded-b-none' : '',
          ]"
          @click="toggleExpand(entryKey(entry))"
        >
          <!-- Status -->
          <span
            class="font-bold w-4 text-center shrink-0 mt-0.5"
            :class="statusTextClass(entry.status)"
          >
            {{ statusIcon(entry.status) }}
          </span>

          <!-- Generated position -->
          <span class="text-fg-muted w-12 shrink-0 mt-0.5">
            {{
              entry.a
                ? formatPos(entry.a.generatedLine, entry.a.generatedColumn)
                : entry.b
                  ? formatPos(entry.b.generatedLine, entry.b.generatedColumn)
                  : ""
            }}
          </span>

          <!-- Generated code snippet -->
          <code class="text-fg-dim truncate max-w-40 mt-0.5 shrink-0">
            {{ genSnippet(entry, entry.a ? "a" : "b") }}
          </code>

          <!-- Maps to -->
          <div class="flex-1 min-w-0 mt-0.5">
            <template v-if="entry.status === 'changed'">
              <div class="space-y-0.5">
                <div class="flex items-center gap-1.5">
                  <span class="text-red-500 font-semibold w-6">A:</span>
                  <span class="text-fg-muted">{{ origPos(entry, "a") }}</span>
                  <code class="text-red-500 line-through truncate">{{ origCode(entry, "a") }}</code>
                </div>
                <div class="flex items-center gap-1.5">
                  <span class="text-green-600 dark:text-green-400 font-semibold w-6">B:</span>
                  <span class="text-fg-muted">{{ origPos(entry, "b") }}</span>
                  <code class="text-green-600 dark:text-green-400 truncate">{{
                    origCode(entry, "b")
                  }}</code>
                </div>
              </div>
            </template>
            <template v-else-if="entry.status === 'removed'">
              <div class="flex items-center gap-1.5">
                <span class="text-fg-muted">{{ origPos(entry, "a") }}</span>
                <code class="text-red-500 truncate">{{ origCode(entry, "a") }}</code>
              </div>
            </template>
            <template v-else-if="entry.status === 'added'">
              <div class="flex items-center gap-1.5">
                <span class="text-fg-muted">{{ origPos(entry, "b") }}</span>
                <code class="text-green-600 dark:text-green-400 truncate">{{
                  origCode(entry, "b")
                }}</code>
              </div>
            </template>
            <template v-else>
              <div class="flex items-center gap-1.5">
                <span class="text-fg-muted">{{ origPos(entry, "a") }}</span>
                <code class="text-fg-muted truncate">{{ origCode(entry, "a") }}</code>
              </div>
            </template>
          </div>

          <!-- Expand indicator -->
          <span class="text-fg-muted shrink-0 mt-0.5">{{
            expandedIndex === entryKey(entry) ? "▾" : "▸"
          }}</span>
        </div>

        <!-- Expanded code preview -->
        <div
          v-if="expandedIndex === entryKey(entry)"
          class="border border-t-0 border-edge rounded-b-lg bg-panel overflow-hidden"
        >
          <div class="grid grid-cols-2 divide-x divide-edge">
            <!-- Side A -->
            <div>
              <div
                class="px-2 py-1 text-xs font-semibold text-fg-muted bg-muted border-b border-edge"
              >
                Generated (A)
              </div>
              <pre class="text-xs font-mono p-2 overflow-x-auto"><template
                  v-for="line in getContextLines(entry, 'a', 'gen')"
                  :key="'ga' + line.lineNum"
                ><span
                    :class="line.isTarget ? 'bg-amber-100 dark:bg-amber-900/30 font-semibold' : 'text-fg-muted'"
                  ><span class="inline-block w-8 text-right pr-2 text-fg-muted select-none">{{ line.lineNum }}</span>{{ line.text }}
</span></template></pre>
              <div
                class="px-2 py-1 text-xs font-semibold text-fg-muted bg-muted border-y border-edge"
              >
                Original (A) → {{ entry.a ? sourcesA[entry.a.sourceIndex] : "" }}
              </div>
              <pre class="text-xs font-mono p-2 overflow-x-auto"><template
                  v-for="line in getContextLines(entry, 'a', 'orig')"
                  :key="'oa' + line.lineNum"
                ><span
                    :class="line.isTarget ? 'bg-amber-100 dark:bg-amber-900/30 font-semibold' : 'text-fg-muted'"
                  ><span class="inline-block w-8 text-right pr-2 text-fg-muted select-none">{{ line.lineNum }}</span>{{ line.text }}
</span></template></pre>
            </div>

            <!-- Side B -->
            <div>
              <div
                class="px-2 py-1 text-xs font-semibold text-fg-muted bg-muted border-b border-edge"
              >
                Generated (B)
              </div>
              <pre class="text-xs font-mono p-2 overflow-x-auto"><template
                  v-for="line in getContextLines(entry, 'b', 'gen')"
                  :key="'gb' + line.lineNum"
                ><span
                    :class="line.isTarget ? 'bg-amber-100 dark:bg-amber-900/30 font-semibold' : 'text-fg-muted'"
                  ><span class="inline-block w-8 text-right pr-2 text-fg-muted select-none">{{ line.lineNum }}</span>{{ line.text }}
</span></template></pre>
              <div
                class="px-2 py-1 text-xs font-semibold text-fg-muted bg-muted border-y border-edge"
              >
                Original (B) → {{ entry.b ? sourcesB[entry.b.sourceIndex] : "" }}
              </div>
              <pre class="text-xs font-mono p-2 overflow-x-auto"><template
                  v-for="line in getContextLines(entry, 'b', 'orig')"
                  :key="'ob' + line.lineNum"
                ><span
                    :class="line.isTarget ? 'bg-amber-100 dark:bg-amber-900/30 font-semibold' : 'text-fg-muted'"
                  ><span class="inline-block w-8 text-right pr-2 text-fg-muted select-none">{{ line.lineNum }}</span>{{ line.text }}
</span></template></pre>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
