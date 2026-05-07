<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { replaceCurrentPath } from "../composables/navigation";
import IconArrowLeft from "~icons/carbon/arrow-left";
import IconLogoGithub from "~icons/carbon/logo-github";
import IconSun from "~icons/carbon/sun";
import IconMoon from "~icons/carbon/moon";
import IconScreen from "~icons/carbon/screen";
import { parseSourceMap } from "../core/parser";
import { buildMappingIndex, buildVisibleGeneratedMappingIndex } from "../core/mapper";
import { validateMappings } from "../core/validator";
import { diffMappings } from "../core/diff";
import { detectPatterns } from "../core/patterns";
import MappingDiffTable from "../components/MappingDiffTable.vue";
import PatternSummary from "../components/PatternSummary.vue";
import CompareCodePane from "../components/CompareCodePane.vue";
import { provideCrossPaneHover } from "../composables/useCrossPaneHover";
import { provideCrossPaneScroll } from "../composables/useCrossPaneScroll";
import { useTheme } from "../composables/useTheme";
import { APP_NAME, LINE_HEIGHT } from "../constants";

const { theme, toggleTheme } = useTheme();
const themeTitle = {
  light: "Light mode (click for dark)",
  dark: "Dark mode (click for system)",
  system: "System mode (click for light)",
} as const;

// Shared "which source position is currently hovered" ref, scoped to the
// compare page subtree. Both `CompareCodePane` instances read/write here
// to mirror hover state from one side to the other in source-coord terms.
provideCrossPaneHover();

// Sister to the hover sync: shared top-line index so scrolling A's
// generated pane scrolls B's to the same line, and vice versa.
provideCrossPaneScroll();

type CompareTab = "table" | "code";

const props = defineProps<{
  entryA: { generatedCode: string; sourceMapJson: string; label: string };
  entryB: { generatedCode: string; sourceMapJson: string; label: string };
  slugA?: string;
  slugB?: string;
}>();

const selectedPatternKey = ref<string | null>(null);

// Tab choice and the "ignore source filename" toggle persist via query
// params so that compare URLs are shareable with the same view a user is
// looking at. `ignoreSourceName` defaults to `true` because comparing two
// builds of the same project usually only differs in source paths
// (`./src/...` vs `src/...`, absolute vs relative), and matching by name
// would mark the entire diff as renamed noise. Default values are omitted
// from the URL so the common case stays clean.
const TAB_PARAM = "tab";
const IGNORE_NAME_PARAM = "ignore-source-name";

interface CompareUrlState {
  tab: CompareTab;
  ignoreSourceName: boolean;
}

function readCompareUrlState(): CompareUrlState {
  if (typeof window === "undefined") return { tab: "table", ignoreSourceName: true };
  const params = new URLSearchParams(window.location.search);
  const tabRaw = params.get(TAB_PARAM);
  const tab: CompareTab = tabRaw === "code" || tabRaw === "table" ? tabRaw : "table";
  const ignoreSourceName = params.get(IGNORE_NAME_PARAM) !== "0";
  return { tab, ignoreSourceName };
}

const initialUrlState = readCompareUrlState();
const ignoreSourceName = ref(initialUrlState.ignoreSourceName);
const activeTab = ref<CompareTab>(initialUrlState.tab);

// `watch` is lazy by default — it only fires on changes after setup, so
// the initial assignment from URL doesn't stomp params, and nothing else
// here mutates these refs during mount.
watch([activeTab, ignoreSourceName], () => {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams(window.location.search);
  if (activeTab.value === "code") params.set(TAB_PARAM, "code");
  else params.delete(TAB_PARAM);
  if (!ignoreSourceName.value) params.set(IGNORE_NAME_PARAM, "0");
  else params.delete(IGNORE_NAME_PARAM);
  const search = params.toString();
  replaceCurrentPath(`${window.location.pathname}${search ? `?${search}` : ""}`);
});

const parsedA = computed(() => parseSourceMap(props.entryA.sourceMapJson));
const parsedB = computed(() => parseSourceMap(props.entryB.sourceMapJson));

const genLinesA = computed(() => props.entryA.generatedCode.split("\n"));
const genLinesB = computed(() => props.entryB.generatedCode.split("\n"));

// The non-table views render every line of generated code as DOM. For a
// 50k-line minified bundle this would freeze the browser. Gate the heavy
// views with a soft cap and let the user explicitly opt in for large files.
const HEAVY_VIEW_LINE_LIMIT = 5000;
const totalGenLines = computed(() => Math.max(genLinesA.value.length, genLinesB.value.length));
const heavyViewBypassed = ref(false);
const heavyViewBlocked = computed(
  () => totalGenLines.value > HEAVY_VIEW_LINE_LIMIT && !heavyViewBypassed.value,
);

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
    namesA: parsedA.value.names,
    namesB: parsedB.value.names,
    ignoreSourceName: ignoreSourceName.value,
  }),
);

const origLinesA = computed(() => parsedA.value.sourcesContent.map((c) => (c ?? "").split("\n")));
const origLinesB = computed(() => parsedB.value.sourcesContent.map((c) => (c ?? "").split("\n")));

const patterns = computed(() =>
  detectPatterns(diffResult.value.entries, {
    sourcesA: parsedA.value.sources,
    sourcesB: parsedB.value.sources,
    ignoreSourceName: ignoreSourceName.value,
  }),
);

const filterEntries = computed(() => {
  if (!selectedPatternKey.value) return null;
  const target = patterns.value.find((pattern) => pattern.key === selectedPatternKey.value);
  return target?.members ?? null;
});

function handlePatternSelect(key: string | null) {
  selectedPatternKey.value = key;
}

/**
 * Per-line aggregation of diff statuses for the gutter markers in the Code
 * panes view. For each side, walks the diff entries and records the
 * "strongest" status anchored on each generated line. Status priority:
 * removed/added > shifted > changed (so a line with both a same and an
 * added entry shows as added). Pattern-filtered when a pattern is selected.
 */
type GutterStatus = "shifted" | "changed" | "removed" | "added";

const STATUS_PRIORITY: Record<GutterStatus, number> = {
  added: 4,
  removed: 4,
  shifted: 2,
  changed: 1,
};

function buildLineStatuses(
  side: "a" | "b",
  entries: import("../core/diff").DiffEntry[],
): Map<number, GutterStatus> {
  const result = new Map<number, GutterStatus>();
  for (const entry of entries) {
    if (entry.status === "same") continue;
    const seg = side === "a" ? entry.a : entry.b;
    if (!seg) continue;
    const line = seg.generatedLine;
    const next = entry.status as GutterStatus;
    const current = result.get(line);
    if (!current || STATUS_PRIORITY[next] > STATUS_PRIORITY[current]) {
      result.set(line, next);
    }
  }
  return result;
}

const visibleEntries = computed(() => filterEntries.value ?? diffResult.value.entries);
const lineStatusesA = computed(() => buildLineStatuses("a", visibleEntries.value));
const lineStatusesB = computed(() => buildLineStatuses("b", visibleEntries.value));

/**
 * Per-pane diff breakdown shown inline in the Code-pane header, e.g.
 * "5 lines · 3 shifted · 2 added". Counts the *entries* that anchor on
 * each side, not lines (a line can host several entries — surfacing
 * just the line count would hide multi-entry density).
 */
interface DiffBreakdown {
  total: number;
  shifted: number;
  changed: number;
  added: number;
  removed: number;
  affectedLines: number;
}

function buildBreakdown(
  side: "a" | "b",
  entries: import("../core/diff").DiffEntry[],
  lineStatuses: Map<number, GutterStatus>,
): DiffBreakdown {
  const breakdown: DiffBreakdown = {
    total: 0,
    shifted: 0,
    changed: 0,
    added: 0,
    removed: 0,
    affectedLines: lineStatuses.size,
  };
  for (const entry of entries) {
    if (entry.status === "same") continue;
    const seg = side === "a" ? entry.a : entry.b;
    if (!seg) continue;
    breakdown.total += 1;
    breakdown[entry.status as keyof Omit<DiffBreakdown, "total" | "affectedLines">] += 1;
  }
  return breakdown;
}

const breakdownA = computed(() => buildBreakdown("a", visibleEntries.value, lineStatusesA.value));
const breakdownB = computed(() => buildBreakdown("b", visibleEntries.value, lineStatusesB.value));

/**
 * Format a `DiffBreakdown` as "5 lines · 3 shifted · 2 added" (drops
 * zero-count buckets). Returns null when there are no diffs at all so
 * the caller can render nothing instead of "0 lines".
 */
function formatBreakdown(b: DiffBreakdown): string | null {
  if (b.total === 0) return null;
  const parts: string[] = [];
  parts.push(`${b.affectedLines} line${b.affectedLines === 1 ? "" : "s"}`);
  if (b.shifted) parts.push(`${b.shifted} shifted`);
  if (b.changed) parts.push(`${b.changed} changed`);
  if (b.added) parts.push(`${b.added} added`);
  if (b.removed) parts.push(`${b.removed} removed`);
  return parts.join(" · ");
}

/**
 * Counts shown alongside the tab button labels — "Diff table (17)" and
 * "Code panes (5 diff lines)" — so the user knows whether the active
 * tab actually has anything interesting to show before clicking it.
 */
const diffTableCount = computed(
  () => visibleEntries.value.filter((e) => e.status !== "same").length,
);
const codePanesCount = computed(() => Math.max(lineStatusesA.value.size, lineStatusesB.value.size));

/**
 * Each Code-pane row's natural height is `max(generated lines, longest
 * source's lines) * LINE_HEIGHT` plus chrome (header + border + the
 * SourceTabs strip when there are multiple sources). Cap at half the
 * viewport so large files still scroll inside a bounded box.
 */
const PANE_CHROME = 56;

function paneNaturalHeight(genLines: string[], origLines: string[][]): number {
  const longestSource = origLines.reduce((max, lines) => Math.max(max, lines.length), 0);
  const contentLines = Math.max(genLines.length, longestSource);
  return contentLines * LINE_HEIGHT + PANE_CHROME;
}

const paneHeightA = computed(
  () => `min(${paneNaturalHeight(genLinesA.value, origLinesA.value)}px, calc(50vh - 24px))`,
);
const paneHeightB = computed(
  () => `min(${paneNaturalHeight(genLinesB.value, origLinesB.value)}px, calc(50vh - 24px))`,
);

function viewerHref(slug?: string): string | null {
  return slug ? `/${slug}` : null;
}

function displayId(slug: string | undefined, fallback: string): string {
  if (!slug) return fallback;
  return slug.length > 12 ? `${slug.slice(0, 12)}...` : slug;
}

/**
 * Pane title shown next to the side pill (A/B). Preference order:
 *   1. the sourcemap's `file` field (e.g. `before.js`) — most informative
 *   2. the slug, truncated like the top header chip — short and stable
 *   3. the share-flow label as a final fallback
 *
 * Skipping the share-flow label when a slug is available avoids the
 * "A A (slug...)" duplication, since `entryA.label` is itself
 * `"A (slug...)"` and the pill already shows the side.
 */
function paneLabel(
  parsedFile: string | undefined,
  slug: string | undefined,
  entryLabel: string,
): string {
  if (parsedFile && parsedFile.length > 0) return parsedFile;
  if (slug) return slug.length > 12 ? `${slug.slice(0, 12)}...` : slug;
  return entryLabel;
}

function compareCountLabel(visibleCount: number, rawCount: number): string {
  return visibleCount === rawCount
    ? `${visibleCount} mappings`
    : `${visibleCount} compared, ${rawCount} raw`;
}
</script>

<template>
  <div class="min-h-screen bg-base">
    <!-- Header — same chrome as `Toolbar.vue` for visual consistency with
         the main viewer: single-row, bg-surface, border-b, with the logo
         on the left and the theme/GitHub icons on the right. The compare-
         specific bits (A/B chips and "Ignore source filename" toggle) sit
         in the middle. -->
    <div class="flex items-center gap-1.5 px-3 py-1.5 border-b border-edge bg-surface">
      <a
        href="/"
        class="flex items-center gap-1.5 cursor-pointer hover:opacity-70 transition mr-1"
        title="Back to home"
      >
        <IconArrowLeft class="w-4 h-4 text-fg-muted" />
        <img src="/logo.svg" alt="Logo" class="h-5 w-5" />
        <span class="text-sm font-semibold text-fg">{{ APP_NAME }}</span>
      </a>
      <span class="text-xs text-fg-muted ml-1">Compare</span>
      <div class="w-px h-4 bg-edge mx-1" />
      <div
        class="inline-flex items-center gap-2 rounded-full border border-edge bg-base px-2.5 py-0.5 min-w-0 text-xs"
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
        class="inline-flex items-center gap-2 rounded-full border border-edge bg-base px-2.5 py-0.5 min-w-0 text-xs"
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
      <div class="flex-1" />
      <label
        class="inline-flex items-center gap-1.5 cursor-pointer text-fg-muted hover:text-fg-dim text-xs"
        title="Treat segments as the same when only their source filename differs (e.g. before.js vs after.js for the same logical input)"
      >
        <input v-model="ignoreSourceName" type="checkbox" class="rounded" />
        Ignore source filename
      </label>
      <div class="w-px h-4 bg-edge mx-1" />
      <a
        href="https://github.com/Dunqing/source-map-viewer"
        target="_blank"
        rel="noopener"
        class="p-1.5 rounded text-fg-muted hover:text-fg-dim hover:bg-muted transition"
        title="GitHub"
      >
        <IconLogoGithub class="w-4 h-4" />
      </a>
      <button
        class="p-1.5 rounded text-fg-muted hover:text-fg-dim hover:bg-muted transition"
        :title="themeTitle[theme]"
        @click="toggleTheme"
      >
        <IconMoon v-if="theme === 'light'" class="w-4 h-4" />
        <IconSun v-else-if="theme === 'dark'" class="w-4 h-4" />
        <IconScreen v-else class="w-4 h-4" />
      </button>
    </div>

    <!-- Tabs + (Diff table | Code panes). PatternSummary has been moved
         inside the Diff table panel since pattern selection only filters
         the table — the Code panes view ignored the filter anyway. -->
    <div class="max-w-6xl mx-auto p-4">
      <!-- Tab switcher: same button-bar pattern as EntrypointTabs.vue -->
      <div
        class="flex items-center gap-2 px-2 py-1 mb-3 rounded-lg border border-edge bg-muted overflow-x-auto"
      >
        <span
          class="shrink-0 pl-1 text-[11px] font-semibold uppercase tracking-widest text-fg-muted"
        >
          View
        </span>
        <button
          v-for="tab in ['table', 'code'] as CompareTab[]"
          :key="tab"
          class="px-2 py-1 rounded text-xs whitespace-nowrap transition flex items-center gap-1.5"
          :class="
            activeTab === tab
              ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-medium'
              : 'hover:bg-surface text-fg-dim'
          "
          @click="activeTab = tab"
        >
          <span>{{ tab === "table" ? "Diff table" : "Code panes" }}</span>
          <span
            v-if="tab === 'table' && diffTableCount > 0"
            class="rounded-full bg-base border border-edge px-1.5 py-0.5 text-[10px] font-mono leading-none text-fg-muted"
          >
            {{ diffTableCount }}
          </span>
          <span
            v-else-if="tab === 'code' && codePanesCount > 0"
            class="rounded-full bg-base border border-edge px-1.5 py-0.5 text-[10px] font-mono leading-none text-fg-muted"
          >
            {{ codePanesCount }}
          </span>
        </button>
      </div>

      <div v-show="activeTab === 'table'">
        <PatternSummary
          :patterns="patterns"
          :selected-pattern-key="selectedPatternKey"
          @select="handlePatternSelect"
        />
        <MappingDiffTable
          :ignore-source-name="ignoreSourceName"
          :entries="diffResult.entries"
          :summary="diffResult.summary"
          :sources-a="parsedA.sources"
          :sources-b="parsedB.sources"
          :names-a="parsedA.names"
          :names-b="parsedB.names"
          :gen-lines-a="genLinesA"
          :gen-lines-b="genLinesB"
          :orig-lines-a="origLinesA"
          :orig-lines-b="origLinesB"
          :raw-mappings-a="indexA"
          :raw-mappings-b="indexB"
          :filter-entries="filterEntries"
        />
      </div>

      <!-- Heavy-view bypass prompt for large files. -->
      <div
        v-if="activeTab === 'code' && heavyViewBlocked"
        class="rounded border border-edge bg-surface px-3 py-3 text-xs flex items-start gap-3 flex-wrap"
      >
        <div class="flex flex-col gap-1 min-w-0 flex-1">
          <span class="font-semibold text-fg">Heads up — large file</span>
          <span class="text-fg-dim">
            This view renders every line of generated code as DOM. The current file has
            {{ totalGenLines }} lines, above the {{ HEAVY_VIEW_LINE_LIMIT }}-line cap, so loading it
            could freeze your browser. Use the Diff table tab for large inputs, or click below to
            load anyway.
          </span>
        </div>
        <button
          type="button"
          class="shrink-0 rounded bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 text-xs font-medium"
          @click="heavyViewBypassed = true"
        >
          Load anyway
        </button>
      </div>

      <!-- A and B stack vertically: each gets full page width so the inner
           source/generated split is readable. Per-pane natural height (with
           a half-viewport cap) so small fixtures don't sit with a void
           below them and large files still scroll inside a bounded box. -->
      <div v-if="activeTab === 'code' && !heavyViewBlocked" class="flex flex-col gap-2">
        <div
          :style="{ height: paneHeightA }"
          class="rounded border border-edge bg-surface overflow-hidden flex flex-col min-h-0"
        >
          <div
            class="px-3 py-2 border-b border-edge bg-muted text-xs font-mono shrink-0 flex items-center gap-2"
          >
            <span class="text-[11px] font-semibold uppercase tracking-widest text-fg-muted">A</span>
            <span class="text-fg truncate">{{ paneLabel(parsedA.file, slugA, entryA.label) }}</span>
            <span v-if="formatBreakdown(breakdownA)" class="text-fg-muted truncate">
              · {{ formatBreakdown(breakdownA) }}
            </span>
          </div>
          <CompareCodePane
            class="flex-1 min-h-0"
            :generated-code="entryA.generatedCode"
            :source-map-json="entryA.sourceMapJson"
            :filename="parsedA.file ?? entryA.label"
            :gen-line-statuses="lineStatusesA"
            side="a"
            :entries="diffResult.entries"
          />
        </div>
        <div
          :style="{ height: paneHeightB }"
          class="rounded border border-edge bg-surface overflow-hidden flex flex-col min-h-0"
        >
          <div
            class="px-3 py-2 border-b border-edge bg-muted text-xs font-mono shrink-0 flex items-center gap-2"
          >
            <span class="text-[11px] font-semibold uppercase tracking-widest text-fg-muted">B</span>
            <span class="text-fg truncate">{{ paneLabel(parsedB.file, slugB, entryB.label) }}</span>
            <span v-if="formatBreakdown(breakdownB)" class="text-fg-muted truncate">
              · {{ formatBreakdown(breakdownB) }}
            </span>
          </div>
          <CompareCodePane
            class="flex-1 min-h-0"
            :generated-code="entryB.generatedCode"
            :source-map-json="entryB.sourceMapJson"
            :filename="parsedB.file ?? entryB.label"
            :gen-line-statuses="lineStatusesB"
            side="b"
            :entries="diffResult.entries"
          />
        </div>
      </div>
    </div>
  </div>
</template>
