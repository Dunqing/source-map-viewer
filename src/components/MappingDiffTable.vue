<script setup lang="ts">
import { computed, ref, watch } from "vue";
import {
  findExactMappingInSameSource,
  findNearestMappingInSameSource,
  normalizeSourceName,
} from "../core/diff";
import type { DiffEntry, DiffSummary } from "../core/diff";
import type { MappingSegment } from "../core/types";
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
  rawMappingsA: MappingSegment[];
  rawMappingsB: MappingSegment[];
}>();

const showSame = ref(false);
const expandedIndex = ref<string | null>(null);

const CONTEXT_LINES = 3;
const EMPTY_PREVIEW_SIDE_DATA = {
  exactRaw: null,
  nearestRaw: null,
  previewSegment: null,
} as const;

interface PreviewSideData {
  exactRaw: MappingSegment | null;
  nearestRaw: MappingSegment | null;
  previewSegment: MappingSegment | null;
}

interface EntryPreviewData {
  a: PreviewSideData;
  b: PreviewSideData;
}

const filteredEntries = computed(() =>
  showSame.value ? props.entries : props.entries.filter((e) => e.status !== "same"),
);

function segmentKey(seg: MappingSegment | null): string {
  if (!seg) return "none";
  return [
    seg.generatedLine,
    seg.generatedColumn,
    seg.originalLine,
    seg.originalColumn,
    seg.sourceIndex,
    seg.nameIndex ?? "null",
  ].join(":");
}

function entryKey(entry: DiffEntry): string {
  return `${entry.status}:${segmentKey(entry.a)}:${segmentKey(entry.b)}`;
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

function generatedPos(entry: DiffEntry, side: "a" | "b"): string {
  const seg = entry[side];
  if (!seg) return "";
  return formatPos(seg.generatedLine, seg.generatedColumn);
}

function genSnippet(entry: DiffEntry, side: "a" | "b"): string {
  const seg = entry[side];
  if (!seg) return "";
  const lines = side === "a" ? props.genLinesA : props.genLinesB;
  return extractGeneratedSnippet(lines, seg.generatedLine, seg.generatedColumn);
}

function formatVisibleWhitespace(text: string): string {
  return text.replace(/\t/g, "⇥").replace(/ /g, "·");
}

function clampColumn(lineText: string, column: number): number {
  return Math.max(0, Math.min(lineText.length, column));
}

function formatPointSnippet(
  lineText: string,
  column: number,
  { visibleWhitespace = false, radius = 18 }: { visibleWhitespace?: boolean; radius?: number } = {},
): string {
  const clamped = clampColumn(lineText, column);
  const start = Math.max(0, clamped - Math.floor(radius / 2));
  const end = Math.min(lineText.length, clamped + radius);
  const before = lineText.slice(start, clamped);
  const point = lineText.slice(clamped, Math.min(lineText.length, clamped + 1)) || " ";
  const after = lineText.slice(Math.min(lineText.length, clamped + 1), end);
  const format = visibleWhitespace ? formatVisibleWhitespace : (s: string) => s;
  const prefix = start > 0 ? "..." : "";
  const suffix = end < lineText.length ? "..." : "";
  return `${prefix}${format(before)}[${format(point)}]${format(after)}${suffix}`;
}

function generatedDiffSnippet(entry: DiffEntry, side: "a" | "b"): string {
  const seg = entry[side];
  if (!seg) return "";
  const lines = side === "a" ? props.genLinesA : props.genLinesB;
  const line = lines[seg.generatedLine] ?? "";
  return formatPointSnippet(line, seg.generatedColumn, { visibleWhitespace: true });
}

function normalizedSourceLabel(source: string | undefined, sourceIndex: number): string {
  return source ? normalizeSourceName(source) : `#${sourceIndex}`;
}

function originalSourceName(entry: DiffEntry, side: "a" | "b"): string {
  const seg = entry[side];
  if (!seg) {
    const otherSide = side === "a" ? "b" : "a";
    const otherSeg = entry[otherSide];
    if (!otherSeg) return "";
    const otherSources = otherSide === "a" ? props.sourcesA : props.sourcesB;
    return normalizedSourceLabel(otherSources[otherSeg.sourceIndex], otherSeg.sourceIndex);
  }
  const sources = side === "a" ? props.sourcesA : props.sourcesB;
  return normalizedSourceLabel(sources[seg.sourceIndex], seg.sourceIndex);
}

function isGeneratedChanged(entry: DiffEntry): boolean {
  return !!(
    entry.status === "changed" &&
    entry.a &&
    entry.b &&
    (entry.a.generatedLine !== entry.b.generatedLine ||
      entry.a.generatedColumn !== entry.b.generatedColumn)
  );
}

function isOriginalChanged(entry: DiffEntry): boolean {
  return !!(
    entry.status === "changed" &&
    entry.a &&
    entry.b &&
    (entry.a.originalLine !== entry.b.originalLine ||
      entry.a.originalColumn !== entry.b.originalColumn ||
      originalSourceName(entry, "a") !== originalSourceName(entry, "b"))
  );
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

function originalDiffSnippet(entry: DiffEntry, side: "a" | "b"): string {
  const seg = entry[side];
  if (!seg) return "";
  const allLines = side === "a" ? props.origLinesA : props.origLinesB;
  const sourceLines = allLines[seg.sourceIndex] ?? [];
  const line = sourceLines[seg.originalLine] ?? "";
  return formatPointSnippet(line, seg.originalColumn);
}

function rawMappingsForSide(side: "a" | "b"): MappingSegment[] {
  return side === "a" ? props.rawMappingsA : props.rawMappingsB;
}

function sourcesForSide(side: "a" | "b"): string[] {
  return side === "a" ? props.sourcesA : props.sourcesB;
}

function buildPreviewSideData(entry: DiffEntry, side: "a" | "b"): PreviewSideData {
  const current = entry[side];
  if (current) {
    return {
      exactRaw: null,
      nearestRaw: null,
      previewSegment: current,
    };
  }

  if (!isDisappearedEntry(entry)) {
    return EMPTY_PREVIEW_SIDE_DATA;
  }

  const otherSide = side === "a" ? "b" : "a";
  const target = entry[otherSide];
  if (!target) return EMPTY_PREVIEW_SIDE_DATA;

  const exactRaw = findExactMappingInSameSource(
    target,
    sourcesForSide(otherSide),
    rawMappingsForSide(side),
    sourcesForSide(side),
  );
  const nearestRaw =
    exactRaw ??
    findNearestMappingInSameSource(
      target,
      sourcesForSide(otherSide),
      rawMappingsForSide(side),
      sourcesForSide(side),
    );

  return {
    exactRaw,
    nearestRaw,
    previewSegment: nearestRaw,
  };
}

let previewDataCache = new WeakMap<DiffEntry, EntryPreviewData>();

watch(
  [
    () => props.entries,
    () => props.rawMappingsA,
    () => props.rawMappingsB,
    () => props.sourcesA,
    () => props.sourcesB,
  ],
  () => {
    previewDataCache = new WeakMap();
  },
);

function getEntryPreviewData(entry: DiffEntry): EntryPreviewData {
  const cached = previewDataCache.get(entry);
  if (cached) return cached;

  const data = {
    a: buildPreviewSideData(entry, "a"),
    b: buildPreviewSideData(entry, "b"),
  };
  previewDataCache.set(entry, data);
  return data;
}

function previewData(entry: DiffEntry, side: "a" | "b"): PreviewSideData {
  return getEntryPreviewData(entry)[side] ?? EMPTY_PREVIEW_SIDE_DATA;
}

function nearestRawMapping(entry: DiffEntry, side: "a" | "b"): MappingSegment | null {
  return previewData(entry, side).nearestRaw;
}

function exactRawCounterpart(entry: DiffEntry, side: "a" | "b"): MappingSegment | null {
  return previewData(entry, side).exactRaw;
}

function previewSegment(entry: DiffEntry, side: "a" | "b"): MappingSegment | null {
  return previewData(entry, side).previewSegment;
}

function previewReference(
  entry: DiffEntry,
  side: "a" | "b",
  type: "gen" | "orig",
): { line: number; column: number; sourceIndex?: number } | null {
  const seg = previewSegment(entry, side);
  if (seg) {
    return type === "gen"
      ? { line: seg.generatedLine, column: seg.generatedColumn }
      : { line: seg.originalLine, column: seg.originalColumn, sourceIndex: seg.sourceIndex };
  }

  return null;
}

function getContextLines(
  entry: DiffEntry,
  side: "a" | "b",
  type: "gen" | "orig",
): { lineNum: number; text: string; isTarget: boolean }[] {
  const ref = previewReference(entry, side, type);
  if (!ref) return [];

  let lines: string[];
  let targetLine: number;

  if (type === "gen") {
    lines = side === "a" ? props.genLinesA : props.genLinesB;
    targetLine = ref.line;
  } else {
    const allLines = side === "a" ? props.origLinesA : props.origLinesB;
    lines = allLines[ref.sourceIndex ?? -1] ?? [];
    targetLine = ref.line;
  }

  const start = Math.max(0, targetLine - CONTEXT_LINES);
  const end = Math.min(lines.length, targetLine + CONTEXT_LINES + 1);
  const result: { lineNum: number; text: string; isTarget: boolean }[] = [];

  for (let i = start; i < end; i++) {
    result.push({ lineNum: i + 1, text: lines[i], isTarget: i === targetLine });
  }
  return result;
}

function contextLineText(
  entry: DiffEntry,
  side: "a" | "b",
  type: "gen" | "orig",
  line: { text: string; isTarget: boolean },
): string {
  if (type === "gen" && line.isTarget && entry[side] && entry.status !== "same") {
    return formatVisibleWhitespace(line.text);
  }
  return line.text;
}

function shouldShowPreviewPoint(entry: DiffEntry, side: "a" | "b", type: "gen" | "orig"): boolean {
  if (!previewReference(entry, side, type)) return false;
  return type === "gen" ? entry.status !== "same" : entry.status !== "same";
}

function previewPointColumn(
  entry: DiffEntry,
  side: "a" | "b",
  type: "gen" | "orig",
  line: { isTarget: boolean },
): number | null {
  if (!line.isTarget || !shouldShowPreviewPoint(entry, side, type)) return null;
  const ref = previewReference(entry, side, type);
  if (!ref) return null;
  return ref.column;
}

function previewPointParts(
  entry: DiffEntry,
  side: "a" | "b",
  type: "gen" | "orig",
  line: { text: string; isTarget: boolean },
): { before: string; point: string; after: string } | null {
  const column = previewPointColumn(entry, side, type, line);
  if (column == null) return null;
  const text = contextLineText(entry, side, type, line);
  const clamped = clampColumn(text, column);
  return {
    before: text.slice(0, clamped),
    point: text.slice(clamped, clamped + 1) || "∎",
    after: text.slice(Math.min(clamped + 1, text.length)),
  };
}

function previewLineClass(entry: DiffEntry, side: "a" | "b", line: { isTarget: boolean }): string {
  if (!line.isTarget) return "text-fg-muted";
  return previewSegment(entry, side) === entry[side]
    ? "bg-amber-100 dark:bg-amber-900/30 font-semibold"
    : "bg-muted/80 font-semibold dark:bg-white/5";
}

function previewPointClass(entry: DiffEntry, side: "a" | "b"): string {
  return previewSegment(entry, side) === entry[side]
    ? "rounded border border-amber-400 bg-amber-300 text-amber-950 dark:border-amber-500/70 dark:bg-amber-700/70 dark:text-amber-50"
    : "rounded border border-red-300 bg-red-100 text-red-700 dark:border-red-700/60 dark:bg-red-900/30 dark:text-red-200";
}

function previewMarkerText(
  entry: DiffEntry,
  side: "a" | "b",
  type: "gen" | "orig",
  line: { isTarget: boolean },
): string | null {
  const column = previewPointColumn(entry, side, type, line);
  if (column == null) return null;
  if (entry[side]) {
    return `mapped here · col ${column}`;
  }
  return `${exactRawCounterpart(entry, side) ? "matching raw mapping" : "closest raw mapping"} · col ${column}`;
}

function markerChipClass(entry: DiffEntry, side: "a" | "b"): string {
  return previewSegment(entry, side) === entry[side]
    ? "border-amber-500/30 bg-amber-500/12 text-amber-700 dark:text-amber-300"
    : "border-red-300 bg-red-100 text-red-700 dark:border-red-700/60 dark:bg-red-900/30 dark:text-red-200";
}

function isDisappearedEntry(entry: DiffEntry): boolean {
  return entry.status === "removed" || entry.status === "added";
}

function mappedSide(entry: DiffEntry): "a" | "b" {
  return entry.status === "added" ? "b" : "a";
}

function missingSide(entry: DiffEntry): "a" | "b" {
  return mappedSide(entry) === "a" ? "b" : "a";
}

function sideTitle(side: "a" | "b"): string {
  return side.toUpperCase();
}

function disappearedMappingTitle(entry: DiffEntry): string {
  return `Mapping present in ${sideTitle(mappedSide(entry))}`;
}

function disappearedContextTitle(entry: DiffEntry): string {
  return `${exactRawCounterpart(entry, missingSide(entry)) ? "Matching raw mapping" : "Closest raw mapping"} in ${sideTitle(missingSide(entry))}`;
}

function disappearedMissingSummary(entry: DiffEntry): string {
  const mapped = entry[mappedSide(entry)];
  const exactRaw = exactRawCounterpart(entry, missingSide(entry));
  const nearest = nearestRawMapping(entry, missingSide(entry));
  if (!mapped || !nearest) {
    return `${sideTitle(missingSide(entry))} has no raw mapping for this point in the same source file.`;
  }

  if (exactRaw) {
    return `${sideTitle(missingSide(entry))} still has the same raw mapping at ${exactRaw.originalLine + 1}:${exactRaw.originalColumn} → ${exactRaw.generatedLine + 1}:${exactRaw.generatedColumn}, but compare hides it because another mapping owns that visible generated span.`;
  }

  const sameOriginalLine = mapped.originalLine === nearest.originalLine;
  const sameGeneratedLine = mapped.generatedLine === nearest.generatedLine;

  if (sameOriginalLine && sameGeneratedLine) {
    return `${sideTitle(missingSide(entry))} maps the same lines, but starts at original ${nearest.originalLine + 1}:${nearest.originalColumn} and generated ${nearest.generatedLine + 1}:${nearest.generatedColumn} instead of ${mapped.originalLine + 1}:${mapped.originalColumn} → ${mapped.generatedLine + 1}:${mapped.generatedColumn}.`;
  }

  if (sameOriginalLine) {
    return `${sideTitle(missingSide(entry))} still maps original line ${nearest.originalLine + 1}, but it connects it to a different generated point.`;
  }

  if (sameGeneratedLine) {
    return `${sideTitle(missingSide(entry))} still maps generated line ${nearest.generatedLine + 1}, but it comes from a different original point.`;
  }

  return `${sideTitle(missingSide(entry))} has no matching mapping for this point; the closest real mapping is original ${nearest.originalLine + 1}:${nearest.originalColumn} → generated ${nearest.generatedLine + 1}:${nearest.generatedColumn}.`;
}

function previewSectionTitle(entry: DiffEntry, side: "a" | "b", type: "orig" | "gen"): string {
  const ref = previewReference(entry, side, type);
  const label = type === "orig" ? "Original" : "Generated";
  const owner = sideTitle(side);
  if (!ref) return `${label} (${owner})`;
  return `${label} (${owner}) @ ${formatPos(ref.line, ref.column)}`;
}

function previewEmptyText(type: "orig" | "gen", side: "a" | "b"): string {
  const label = type === "orig" ? "original" : "generated";
  return `No ${label} code is available for ${sideTitle(side)} at this coordinate.`;
}

function collapsedStatusLabel(entry: DiffEntry): string | null {
  if (entry.status === "removed") return "only in A";
  if (entry.status === "added") return "only in B";
  return null;
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
          <div class="mt-0.5 shrink-0 flex items-center gap-1.5">
            <span class="font-bold w-4 text-center" :class="statusTextClass(entry.status)">
              {{ statusIcon(entry.status) }}
            </span>
            <span
              v-if="collapsedStatusLabel(entry)"
              class="rounded-full border border-edge px-1.5 py-0.5 text-[10px] font-sans uppercase tracking-wide text-fg-muted"
            >
              {{ collapsedStatusLabel(entry) }}
            </span>
          </div>

          <!-- Original -->
          <div class="flex-1 min-w-0 mt-0.5">
            <template v-if="entry.status === 'changed'">
              <div v-if="isOriginalChanged(entry)" class="space-y-0.5">
                <div class="flex items-center gap-1.5">
                  <span class="text-red-500 font-semibold w-6">A:</span>
                  <span class="text-fg-muted">{{ origPos(entry, "a") }}</span>
                  <code class="text-red-500 line-through truncate">{{
                    originalDiffSnippet(entry, "a")
                  }}</code>
                </div>
                <div class="flex items-center gap-1.5">
                  <span class="text-green-600 dark:text-green-400 font-semibold w-6">B:</span>
                  <span class="text-fg-muted">{{ origPos(entry, "b") }}</span>
                  <code class="text-green-600 dark:text-green-400 truncate">{{
                    originalDiffSnippet(entry, "b")
                  }}</code>
                </div>
              </div>
              <div v-else class="flex items-center gap-1.5">
                <span class="text-fg-muted">{{ origPos(entry, "a") }}</span>
                <code class="text-fg-dim truncate">{{ origCode(entry, "a") }}</code>
                <span class="text-fg-muted shrink-0">(same original target)</span>
              </div>
            </template>
            <template v-else-if="entry.status === 'removed'">
              <div class="flex items-center gap-1.5">
                <span class="text-fg-muted">{{ origPos(entry, "a") }}</span>
                <code class="text-red-500 truncate">{{ originalDiffSnippet(entry, "a") }}</code>
              </div>
            </template>
            <template v-else-if="entry.status === 'added'">
              <div class="flex items-center gap-1.5">
                <span class="text-fg-muted">{{ origPos(entry, "b") }}</span>
                <code class="text-green-600 dark:text-green-400 truncate">{{
                  originalDiffSnippet(entry, "b")
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

          <span class="text-fg-muted shrink-0 mt-0.5">→</span>

          <!-- Generated position -->
          <div class="text-fg-muted w-16 shrink-0 mt-0.5">
            <template v-if="isGeneratedChanged(entry)">
              <div class="flex items-center gap-1">
                <span class="text-red-500 font-semibold">A:</span>
                <span>{{ generatedPos(entry, "a") }}</span>
              </div>
              <div class="flex items-center gap-1">
                <span class="text-green-600 dark:text-green-400 font-semibold">B:</span>
                <span>{{ generatedPos(entry, "b") }}</span>
              </div>
            </template>
            <template v-else>
              {{
                entry.a
                  ? formatPos(entry.a.generatedLine, entry.a.generatedColumn)
                  : entry.b
                    ? formatPos(entry.b.generatedLine, entry.b.generatedColumn)
                    : ""
              }}
            </template>
          </div>

          <!-- Generated code snippet -->
          <div class="max-w-56 mt-0.5 shrink-0 min-w-0">
            <template v-if="isGeneratedChanged(entry)">
              <div class="flex items-center gap-1.5 min-w-0">
                <span class="text-red-500 font-semibold w-4 shrink-0">A:</span>
                <code class="text-red-500 truncate">{{ generatedDiffSnippet(entry, "a") }}</code>
              </div>
              <div class="flex items-center gap-1.5 min-w-0">
                <span class="text-green-600 dark:text-green-400 font-semibold w-4 shrink-0"
                  >B:</span
                >
                <code class="text-green-600 dark:text-green-400 truncate">{{
                  generatedDiffSnippet(entry, "b")
                }}</code>
              </div>
            </template>
            <template v-else-if="entry.status === 'removed'">
              <code class="text-red-500 truncate block">
                {{ generatedDiffSnippet(entry, "a") }}
              </code>
            </template>
            <template v-else-if="entry.status === 'added'">
              <code class="text-green-600 dark:text-green-400 truncate block">
                {{ generatedDiffSnippet(entry, "b") }}
              </code>
            </template>
            <template v-else>
              <code class="text-fg-dim truncate block">
                {{ genSnippet(entry, entry.a ? "a" : "b") }}
              </code>
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
          <template v-if="isDisappearedEntry(entry)">
            <div class="border-b border-edge bg-muted/40 px-3 py-2">
              <div class="text-sm font-semibold text-fg">
                This mapping exists in {{ sideTitle(mappedSide(entry)) }} but not in
                {{ sideTitle(missingSide(entry)) }}.
              </div>
              <div class="mt-0.5 text-xs text-fg-muted">
                {{ disappearedMissingSummary(entry) }}
              </div>
            </div>

            <div class="grid gap-3 p-3 xl:grid-cols-2">
              <section class="overflow-hidden rounded-lg border border-edge bg-panel">
                <div class="border-b border-edge bg-muted/60 px-3 py-2">
                  <div class="text-xs font-semibold text-fg">
                    {{ disappearedMappingTitle(entry) }}
                  </div>
                  <div class="mt-1 text-[11px] text-fg-muted">
                    Original {{ origPos(entry, mappedSide(entry)) }} → Generated
                    {{ generatedPos(entry, mappedSide(entry)) }}
                  </div>
                </div>

                <div
                  class="px-2 py-1 text-xs font-semibold text-fg-muted bg-muted border-b border-edge"
                >
                  {{ previewSectionTitle(entry, mappedSide(entry), "orig") }}
                </div>
                <div
                  v-if="getContextLines(entry, mappedSide(entry), 'orig').length === 0"
                  class="px-3 py-6 text-center text-xs font-mono text-fg-muted"
                >
                  {{ previewEmptyText("orig", mappedSide(entry)) }}
                </div>
                <pre v-else class="text-xs font-mono p-2 overflow-x-auto"><template
                    v-for="line in getContextLines(entry, mappedSide(entry), 'orig')"
                    :key="'mapped-orig-' + line.lineNum"
                  ><span
                      :class="previewLineClass(entry, mappedSide(entry), line)"
                    ><span class="inline-block w-8 text-right pr-2 text-fg-muted select-none">{{ line.lineNum }}</span><template v-if="previewPointParts(entry, mappedSide(entry), 'orig', line)"
                      ><span>{{ previewPointParts(entry, mappedSide(entry), "orig", line)!.before }}</span><span :class="previewPointClass(entry, mappedSide(entry))">{{ previewPointParts(entry, mappedSide(entry), "orig", line)!.point }}</span><span>{{ previewPointParts(entry, mappedSide(entry), "orig", line)!.after }}</span></template
                    ><template v-else>{{ line.text }}</template>
</span><span
                      v-if="previewMarkerText(entry, mappedSide(entry), 'orig', line)"
                      class="block"
                    ><span class="inline-block w-8 text-right pr-2 text-fg-muted select-none"> </span><span class="inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-sans tracking-wide" :class="markerChipClass(entry, mappedSide(entry))">{{ previewMarkerText(entry, mappedSide(entry), "orig", line) }}</span>
</span></template></pre>

                <div
                  class="px-2 py-1 text-xs font-semibold text-fg-muted bg-muted border-y border-edge"
                >
                  {{ previewSectionTitle(entry, mappedSide(entry), "gen") }}
                </div>
                <div
                  v-if="getContextLines(entry, mappedSide(entry), 'gen').length === 0"
                  class="px-3 py-6 text-center text-xs font-mono text-fg-muted"
                >
                  {{ previewEmptyText("gen", mappedSide(entry)) }}
                </div>
                <pre v-else class="text-xs font-mono p-2 overflow-x-auto"><template
                    v-for="line in getContextLines(entry, mappedSide(entry), 'gen')"
                    :key="'mapped-gen-' + line.lineNum"
                  ><span
                      :class="previewLineClass(entry, mappedSide(entry), line)"
                    ><span class="inline-block w-8 text-right pr-2 text-fg-muted select-none">{{ line.lineNum }}</span><template v-if="previewPointParts(entry, mappedSide(entry), 'gen', line)"
                      ><span>{{ previewPointParts(entry, mappedSide(entry), "gen", line)!.before }}</span><span :class="previewPointClass(entry, mappedSide(entry))">{{ previewPointParts(entry, mappedSide(entry), "gen", line)!.point }}</span><span>{{ previewPointParts(entry, mappedSide(entry), "gen", line)!.after }}</span></template
                    ><template v-else>{{ contextLineText(entry, mappedSide(entry), "gen", line) }}</template>
</span><span
                      v-if="previewMarkerText(entry, mappedSide(entry), 'gen', line)"
                      class="block"
                    ><span class="inline-block w-8 text-right pr-2 text-fg-muted select-none"> </span><span class="inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-sans tracking-wide" :class="markerChipClass(entry, mappedSide(entry))">{{ previewMarkerText(entry, mappedSide(entry), "gen", line) }}</span>
</span></template></pre>
              </section>

              <section class="overflow-hidden rounded-lg border border-dashed border-edge bg-panel">
                <div class="border-b border-edge bg-muted/40 px-3 py-2">
                  <div class="text-xs font-semibold text-fg">
                    {{ disappearedContextTitle(entry) }}
                  </div>
                  <div class="mt-1 text-[11px] text-fg-muted">
                    {{ disappearedMissingSummary(entry) }}
                  </div>
                </div>

                <div
                  class="px-2 py-1 text-xs font-semibold text-fg-muted bg-muted border-b border-edge"
                >
                  {{ previewSectionTitle(entry, missingSide(entry), "orig") }}
                </div>
                <div
                  v-if="getContextLines(entry, missingSide(entry), 'orig').length === 0"
                  class="px-3 py-6 text-center text-xs font-mono text-fg-muted"
                >
                  {{ previewEmptyText("orig", missingSide(entry)) }}
                </div>
                <pre v-else class="text-xs font-mono p-2 overflow-x-auto"><template
                    v-for="line in getContextLines(entry, missingSide(entry), 'orig')"
                    :key="'missing-orig-' + line.lineNum"
                  ><span
                      :class="previewLineClass(entry, missingSide(entry), line)"
                    ><span class="inline-block w-8 text-right pr-2 text-fg-muted select-none">{{ line.lineNum }}</span><template v-if="previewPointParts(entry, missingSide(entry), 'orig', line)"
                      ><span>{{ previewPointParts(entry, missingSide(entry), "orig", line)!.before }}</span><span :class="previewPointClass(entry, missingSide(entry))">{{ previewPointParts(entry, missingSide(entry), "orig", line)!.point }}</span><span>{{ previewPointParts(entry, missingSide(entry), "orig", line)!.after }}</span></template
                    ><template v-else>{{ line.text }}</template>
</span><span
                      v-if="previewMarkerText(entry, missingSide(entry), 'orig', line)"
                      class="block"
                    ><span class="inline-block w-8 text-right pr-2 text-fg-muted select-none"> </span><span class="inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-sans tracking-wide" :class="markerChipClass(entry, missingSide(entry))">{{ previewMarkerText(entry, missingSide(entry), "orig", line) }}</span>
</span></template></pre>

                <div
                  class="px-2 py-1 text-xs font-semibold text-fg-muted bg-muted border-y border-edge"
                >
                  {{ previewSectionTitle(entry, missingSide(entry), "gen") }}
                </div>
                <div
                  v-if="getContextLines(entry, missingSide(entry), 'gen').length === 0"
                  class="px-3 py-6 text-center text-xs font-mono text-fg-muted"
                >
                  {{ previewEmptyText("gen", missingSide(entry)) }}
                </div>
                <pre v-else class="text-xs font-mono p-2 overflow-x-auto"><template
                    v-for="line in getContextLines(entry, missingSide(entry), 'gen')"
                    :key="'missing-gen-' + line.lineNum"
                  ><span
                      :class="previewLineClass(entry, missingSide(entry), line)"
                    ><span class="inline-block w-8 text-right pr-2 text-fg-muted select-none">{{ line.lineNum }}</span><template v-if="previewPointParts(entry, missingSide(entry), 'gen', line)"
                      ><span>{{ previewPointParts(entry, missingSide(entry), "gen", line)!.before }}</span><span :class="previewPointClass(entry, missingSide(entry))">{{ previewPointParts(entry, missingSide(entry), "gen", line)!.point }}</span><span>{{ previewPointParts(entry, missingSide(entry), "gen", line)!.after }}</span></template
                    ><template v-else>{{ contextLineText(entry, missingSide(entry), "gen", line) }}</template>
</span><span
                      v-if="previewMarkerText(entry, missingSide(entry), 'gen', line)"
                      class="block"
                    ><span class="inline-block w-8 text-right pr-2 text-fg-muted select-none"> </span><span class="inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-sans tracking-wide" :class="markerChipClass(entry, missingSide(entry))">{{ previewMarkerText(entry, missingSide(entry), "gen", line) }}</span>
</span></template></pre>
              </section>
            </div>
          </template>

          <template v-else>
            <div class="grid grid-cols-2 divide-x divide-edge">
              <!-- Side A -->
              <div>
                <div
                  class="px-2 py-1 text-xs font-semibold text-fg-muted bg-muted border-b border-edge"
                >
                  Original (A) → {{ originalSourceName(entry, "a") }}
                </div>
                <div
                  v-if="getContextLines(entry, 'a', 'orig').length === 0"
                  class="px-3 py-6 text-center text-xs font-mono text-fg-muted"
                >
                  {{ previewEmptyText("orig", "a") }}
                </div>
                <pre v-else class="text-xs font-mono p-2 overflow-x-auto"><template
                    v-for="line in getContextLines(entry, 'a', 'orig')"
                    :key="'oa' + line.lineNum"
                  ><span
                      :class="previewLineClass(entry, 'a', line)"
                    ><span class="inline-block w-8 text-right pr-2 text-fg-muted select-none">{{ line.lineNum }}</span><template v-if="previewPointParts(entry, 'a', 'orig', line)"
                      ><span>{{ previewPointParts(entry, "a", "orig", line)!.before }}</span><span :class="previewPointClass(entry, 'a')">{{ previewPointParts(entry, "a", "orig", line)!.point }}</span><span>{{ previewPointParts(entry, "a", "orig", line)!.after }}</span></template
                    ><template v-else>{{ line.text }}</template>
</span><span
                      v-if="previewMarkerText(entry, 'a', 'orig', line)"
                      class="block"
                    ><span class="inline-block w-8 text-right pr-2 text-fg-muted select-none"> </span><span class="inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-sans tracking-wide" :class="markerChipClass(entry, 'a')">{{ previewMarkerText(entry, "a", "orig", line) }}</span>
</span></template></pre>
                <div
                  class="px-2 py-1 text-xs font-semibold text-fg-muted bg-muted border-y border-edge"
                >
                  Generated (A)
                </div>
                <div
                  v-if="getContextLines(entry, 'a', 'gen').length === 0"
                  class="px-3 py-6 text-center text-xs font-mono text-fg-muted"
                >
                  {{ previewEmptyText("gen", "a") }}
                </div>
                <pre v-else class="text-xs font-mono p-2 overflow-x-auto"><template
                    v-for="line in getContextLines(entry, 'a', 'gen')"
                    :key="'ga' + line.lineNum"
                  ><span
                      :class="previewLineClass(entry, 'a', line)"
                    ><span class="inline-block w-8 text-right pr-2 text-fg-muted select-none">{{ line.lineNum }}</span><template v-if="previewPointParts(entry, 'a', 'gen', line)"
                      ><span>{{ previewPointParts(entry, "a", "gen", line)!.before }}</span><span :class="previewPointClass(entry, 'a')">{{ previewPointParts(entry, "a", "gen", line)!.point }}</span><span>{{ previewPointParts(entry, "a", "gen", line)!.after }}</span></template
                    ><template v-else>{{ contextLineText(entry, "a", "gen", line) }}</template>
</span><span
                      v-if="previewMarkerText(entry, 'a', 'gen', line)"
                      class="block"
                    ><span class="inline-block w-8 text-right pr-2 text-fg-muted select-none"> </span><span class="inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-sans tracking-wide" :class="markerChipClass(entry, 'a')">{{ previewMarkerText(entry, "a", "gen", line) }}</span>
</span></template></pre>
              </div>

              <!-- Side B -->
              <div>
                <div
                  class="px-2 py-1 text-xs font-semibold text-fg-muted bg-muted border-b border-edge"
                >
                  Original (B) → {{ originalSourceName(entry, "b") }}
                </div>
                <div
                  v-if="getContextLines(entry, 'b', 'orig').length === 0"
                  class="px-3 py-6 text-center text-xs font-mono text-fg-muted"
                >
                  {{ previewEmptyText("orig", "b") }}
                </div>
                <pre v-else class="text-xs font-mono p-2 overflow-x-auto"><template
                    v-for="line in getContextLines(entry, 'b', 'orig')"
                    :key="'ob' + line.lineNum"
                  ><span
                      :class="previewLineClass(entry, 'b', line)"
                    ><span class="inline-block w-8 text-right pr-2 text-fg-muted select-none">{{ line.lineNum }}</span><template v-if="previewPointParts(entry, 'b', 'orig', line)"
                      ><span>{{ previewPointParts(entry, "b", "orig", line)!.before }}</span><span :class="previewPointClass(entry, 'b')">{{ previewPointParts(entry, "b", "orig", line)!.point }}</span><span>{{ previewPointParts(entry, "b", "orig", line)!.after }}</span></template
                    ><template v-else>{{ line.text }}</template>
</span><span
                      v-if="previewMarkerText(entry, 'b', 'orig', line)"
                      class="block"
                    ><span class="inline-block w-8 text-right pr-2 text-fg-muted select-none"> </span><span class="inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-sans tracking-wide" :class="markerChipClass(entry, 'b')">{{ previewMarkerText(entry, "b", "orig", line) }}</span>
</span></template></pre>
                <div
                  class="px-2 py-1 text-xs font-semibold text-fg-muted bg-muted border-y border-edge"
                >
                  Generated (B)
                </div>
                <div
                  v-if="getContextLines(entry, 'b', 'gen').length === 0"
                  class="px-3 py-6 text-center text-xs font-mono text-fg-muted"
                >
                  {{ previewEmptyText("gen", "b") }}
                </div>
                <pre v-else class="text-xs font-mono p-2 overflow-x-auto"><template
                    v-for="line in getContextLines(entry, 'b', 'gen')"
                    :key="'gb' + line.lineNum"
                  ><span
                      :class="previewLineClass(entry, 'b', line)"
                    ><span class="inline-block w-8 text-right pr-2 text-fg-muted select-none">{{ line.lineNum }}</span><template v-if="previewPointParts(entry, 'b', 'gen', line)"
                      ><span>{{ previewPointParts(entry, "b", "gen", line)!.before }}</span><span :class="previewPointClass(entry, 'b')">{{ previewPointParts(entry, "b", "gen", line)!.point }}</span><span>{{ previewPointParts(entry, "b", "gen", line)!.after }}</span></template
                    ><template v-else>{{ contextLineText(entry, "b", "gen", line) }}</template>
</span><span
                      v-if="previewMarkerText(entry, 'b', 'gen', line)"
                      class="block"
                    ><span class="inline-block w-8 text-right pr-2 text-fg-muted select-none"> </span><span class="inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-sans tracking-wide" :class="markerChipClass(entry, 'b')">{{ previewMarkerText(entry, "b", "gen", line) }}</span>
</span></template></pre>
              </div>
            </div>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>
