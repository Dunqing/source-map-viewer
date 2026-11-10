<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { replaceCurrentPath } from "../composables/navigation";
import Toolbar from "../components/Toolbar.vue";
import WorkspaceDialog from "../components/WorkspaceDialog.vue";
import { parseSourceMap } from "../core/parser";
import { buildMappingIndex } from "../core/mapper";
import { validateMappings } from "../core/validator";
import { diffMappings, findDuplicateGeneratedPositions, normalizeSourceName } from "../core/diff";
import { detectPatterns } from "../core/patterns";
import MappingDiffTable from "../components/MappingDiffTable.vue";
import PatternSummary from "../components/PatternSummary.vue";
import CompareCodePane from "../components/CompareCodePane.vue";
import { provideCrossPaneHover } from "../composables/useCrossPaneHover";
import { provideCrossPaneScroll } from "../composables/useCrossPaneScroll";
import { LINE_HEIGHT } from "../constants";

const showFiles = ref(false);
const showDetails = ref(false);

function handleOpen() {
  window.location.href = "/";
}

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
  if (typeof window === "undefined") return { tab: "code", ignoreSourceName: true };
  const params = new URLSearchParams(window.location.search);
  const tabRaw = params.get(TAB_PARAM);
  const defaultTab: CompareTab = window.matchMedia("(max-width: 680px)").matches ? "table" : "code";
  const tab: CompareTab = tabRaw === "code" || tabRaw === "table" ? tabRaw : defaultTab;
  const ignoreSourceName = params.get(IGNORE_NAME_PARAM) !== "0";
  return { tab, ignoreSourceName };
}

const ignoreSourceName = ref(true);
const activeTab = ref<CompareTab>("code");
function selectTab(tab: CompareTab) {
  activeTab.value = tab;
  if (window.matchMedia("(max-width: 680px)").matches) showDetails.value = false;
}
const urlStateReady = ref(false);
onMounted(() => {
  const state = readCompareUrlState();
  ignoreSourceName.value = state.ignoreSourceName;
  activeTab.value = state.tab;
  urlStateReady.value = true;
});

// Persist explicit choices so a code view shared from a phone also opens
// as code on desktop, and vice versa. Viewport defaults apply only on load.
watch([activeTab, ignoreSourceName], () => {
  if (!urlStateReady.value) return;
  const params = new URLSearchParams(window.location.search);
  params.set(TAB_PARAM, activeTab.value);
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
const duplicateSides = computed(() => [
  {
    side: "A",
    groups: findDuplicateGeneratedPositions(indexA.value),
    sources: parsedA.value.sources,
    names: parsedA.value.names,
  },
  {
    side: "B",
    groups: findDuplicateGeneratedPositions(indexB.value),
    sources: parsedB.value.sources,
    names: parsedB.value.names,
  },
]);
const hasDuplicates = computed(() => duplicateSides.value.some(({ groups }) => groups.length > 0));

const diagnosticsA = computed(() => validateMappings(parsedA.value));
const diagnosticsB = computed(() => validateMappings(parsedB.value));
const issueCount = computed(() => diagnosticsA.value.length + diagnosticsB.value.length);
const duplicatePositionCount = computed(() =>
  duplicateSides.value.reduce((count, side) => count + side.groups.length, 0),
);

const diffResult = computed(() =>
  // Semantic comparison uses every raw occurrence, independently of which
  // mapping owns the characters rendered by the code panes.
  diffMappings(indexA.value, indexB.value, {
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

/** Include the entry heading, filename header, and borders in each row. */
const PANE_CHROME = 64;

function paneNaturalHeight(genLines: string[], origLines: string[][]): number {
  const longestSource = origLines.reduce((max, lines) => Math.max(max, lines.length), 0);
  const contentLines = Math.max(genLines.length, longestSource);
  return contentLines * LINE_HEIGHT + PANE_CHROME;
}

const paneHeightA = computed(
  () => `min(${paneNaturalHeight(genLinesA.value, origLinesA.value)}px, calc(50dvh - 56px))`,
);
const paneHeightB = computed(
  () => `min(${paneNaturalHeight(genLinesB.value, origLinesB.value)}px, calc(50dvh - 56px))`,
);

function viewerHref(slug?: string): string | null {
  return slug ? `/${slug}` : null;
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
</script>

<template>
  <div class="workspace-shell">
    <Toolbar
      mode="compare"
      :inspect-href="viewerHref(slugA) || '/'"
      :show-stats="showDetails"
      :show-files="showFiles"
      @home="handleOpen"
      @files="showFiles = true"
      @update:show-stats="showDetails = $event"
    >
      <template #options>
        <label title="Match source coordinates even when source filenames differ"
          ><input v-model="ignoreSourceName" type="checkbox" />Ignore source filename</label
        >
      </template>
    </Toolbar>
    <WorkspaceDialog
      :open="showFiles"
      label="Comparison files"
      title="Files"
      @close="showFiles = false"
    >
      <section
        v-for="side in [
          { key: 'A', entry: entryA, slug: slugA, data: parsedA },
          { key: 'B', entry: entryB, slug: slugB, data: parsedB },
        ]"
        :key="side.key"
        class="mb-6 last:mb-0"
      >
        <h3 class="file-heading">{{ side.key === "A" ? "A · Reference" : "B · Candidate" }}</h3>
        <a
          v-if="viewerHref(side.slug)"
          :href="viewerHref(side.slug)!"
          target="_blank"
          rel="noreferrer"
          class="text-sm underline underline-offset-4"
          >{{ paneLabel(side.data.file, side.slug, side.entry.label) }}</a
        >
        <p v-else class="text-sm">{{ paneLabel(side.data.file, side.slug, side.entry.label) }}</p>
        <ul class="mt-3 space-y-2 text-xs text-fg-muted">
          <li v-for="source in side.data.sources" :key="source" class="break-all">{{ source }}</li>
        </ul>
      </section>
    </WorkspaceDialog>

    <div v-if="urlStateReady" class="compare-context" aria-label="Comparison status">
      <span>{{ ignoreSourceName ? "Source filenames ignored" : "Source filenames matched" }}</span>
      <div class="compare-warnings">
        <button v-if="issueCount" type="button" @click="showDetails = true">
          ⚠ {{ issueCount }} issue{{ issueCount === 1 ? "" : "s" }}
        </button>
        <button v-if="duplicatePositionCount" type="button" @click="showDetails = true">
          ⚠ {{ duplicatePositionCount }} duplicate position{{
            duplicatePositionCount === 1 ? "" : "s"
          }}
        </button>
      </div>
    </div>
    <main v-if="urlStateReady" class="compare-workspace" :class="{ 'show-details': showDetails }">
      <section class="compare-main" aria-label="Source map comparison">
        <div v-show="activeTab === 'table'" class="compare-table-view">
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
        <div v-if="activeTab === 'code' && heavyViewBlocked" class="compare-large-file">
          <h2>Large code view</h2>
          <p>
            This file has {{ totalGenLines.toLocaleString() }} lines. The diff table is available
            without rendering every line of code.
          </p>
          <div class="flex gap-3 mt-4">
            <button class="workspace-button" @click="activeTab = 'table'">Open diff table</button
            ><button class="workspace-button" @click="heavyViewBypassed = true">
              Load code anyway
            </button>
          </div>
        </div>
        <div v-if="activeTab === 'code' && !heavyViewBlocked" class="compare-code-view">
          <section
            class="compare-entry"
            :style="{ height: paneHeightA }"
            aria-label="A reference code"
          >
            <header class="compare-entry-heading">
              <strong>A</strong><span>{{ paneLabel(parsedA.file, slugA, entryA.label) }}</span
              ><small>Reference</small>
            </header>
            <CompareCodePane
              class="flex-1 min-h-0"
              :generated-code="entryA.generatedCode"
              :source-map-json="entryA.sourceMapJson"
              :filename="parsedA.file ?? entryA.label"
              :gen-line-statuses="lineStatusesA"
              side="a"
              :entries="diffResult.entries"
            />
          </section>
          <section
            class="compare-entry"
            :style="{ height: paneHeightB }"
            aria-label="B candidate code"
          >
            <header class="compare-entry-heading">
              <strong>B</strong><span>{{ paneLabel(parsedB.file, slugB, entryB.label) }}</span
              ><small>Candidate</small>
            </header>
            <CompareCodePane
              class="flex-1 min-h-0"
              :generated-code="entryB.generatedCode"
              :source-map-json="entryB.sourceMapJson"
              :filename="parsedB.file ?? entryB.label"
              :gen-line-statuses="lineStatusesB"
              side="b"
              :entries="diffResult.entries"
            />
          </section>
        </div>
      </section>
      <aside
        v-show="showDetails"
        class="workspace-side-panel compare-details"
        aria-label="Comparison details"
      >
        <header class="workspace-side-heading">
          <h2>Details</h2>
          <button class="workspace-icon" aria-label="Close details" @click="showDetails = false">
            ×
          </button>
        </header>
        <div class="p-4 text-xs text-fg-dim space-y-4">
          <section>
            <h3 class="font-medium mb-2">A · Reference</h3>
            <p>
              {{ indexA.length }} raw mappings<span v-if="diagnosticsA.length"
                >, {{ diagnosticsA.length }} issues</span
              >
            </p>
            <p v-if="formatBreakdown(breakdownA)" class="text-fg-muted mt-1">
              {{ formatBreakdown(breakdownA) }}
            </p>
          </section>
          <section>
            <h3 class="font-medium mb-2">B · Candidate</h3>
            <p>
              {{ indexB.length }} raw mappings<span v-if="diagnosticsB.length"
                >, {{ diagnosticsB.length }} issues</span
              >
            </p>
            <p v-if="formatBreakdown(breakdownB)" class="text-fg-muted mt-1">
              {{ formatBreakdown(breakdownB) }}
            </p>
          </section>
          <details v-if="hasDuplicates">
            <summary class="cursor-pointer font-medium">
              Duplicate generated positions{{ " "
              }}<span v-for="side in duplicateSides" :key="side.side" class="ml-2 font-mono"
                >{{ side.side }}: {{ side.groups.length }}</span
              >
            </summary>
            <p class="mt-3 text-fg-muted">
              All occurrences are compared; code highlighting may show one target. Lines start at 1,
              columns at 0.
            </p>
            <div v-for="side in duplicateSides" :key="side.side">
              <div
                v-for="group in side.groups"
                :key="`${group[0].generatedLine}:${group[0].generatedColumn}`"
                class="mt-3 font-mono"
              >
                <div>
                  {{ side.side }} · Generated {{ group[0].generatedLine + 1 }}:{{
                    group[0].generatedColumn
                  }}
                  · {{ group.length }} mappings
                </div>
                <ol class="list-decimal pl-5 mt-1">
                  <li v-for="(mapping, i) in group" :key="i">
                    {{
                      normalizeSourceName(
                        side.sources[mapping.sourceIndex] ?? `#${mapping.sourceIndex}`,
                      )
                    }}:{{ mapping.originalLine + 1 }}:{{ mapping.originalColumn
                    }}<span v-if="mapping.nameIndex !== null">
                      · name: {{ side.names[mapping.nameIndex] ?? `#${mapping.nameIndex}` }}</span
                    >
                  </li>
                </ol>
              </div>
            </div>
          </details>
        </div>
      </aside>
    </main>
    <footer class="workspace-footer">
      <span class="text-fg-muted"
        >{{ diffTableCount }} mapping difference{{ diffTableCount === 1 ? "" : "s" }}</span
      >
      <div class="footer-spacer" />
      <nav class="compare-view-tabs" aria-label="Comparison view">
        <button
          v-for="tab in ['code', 'table'] as CompareTab[]"
          :key="tab"
          :aria-pressed="activeTab === tab"
          @click="selectTab(tab)"
        >
          {{ tab === "table" ? "Diff table" : "Code panes" }}
        </button>
      </nav>
    </footer>
  </div>
</template>

<style scoped>
.compare-context {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 4px 16px;
  min-height: 28px;
  padding: 4px 22px;
  border-bottom: 1px solid var(--c-border);
  color: var(--c-text-3);
  font-size: 11px;
  flex-shrink: 0;
}
.compare-warnings {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  color: var(--c-text);
}
.compare-warnings button:hover {
  text-decoration: underline;
}
.compare-workspace {
  flex: 1;
  display: flex;
  min-height: 0;
  overflow: hidden;
}
.compare-main {
  flex: 1;
  min-width: 0;
  overflow: auto;
}
.compare-table-view {
  padding: 20px;
}
.compare-code-view {
  min-height: 100%;
  display: flex;
  flex-direction: column;
}
.compare-entry {
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  min-height: 0;
  overflow: hidden;
}
.compare-entry + .compare-entry {
  border-top: 1px solid var(--c-border);
}
.compare-entry-heading {
  height: 28px;
  display: flex;
  gap: 10px;
  align-items: center;
  padding: 0 22px;
  flex-shrink: 0;
  font-size: 12px;
}
.compare-entry-heading strong {
  font-size: 11px;
  color: var(--c-text-3);
}
.compare-entry-heading span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.compare-entry-heading small {
  margin-left: auto;
  color: var(--c-text-3);
  font-size: 11px;
}
.compare-large-file {
  padding: 35px;
  max-width: 640px;
  font-size: 13px;
}
.compare-large-file h2 {
  font-weight: 550;
  margin-bottom: 10px;
}
.compare-large-file p {
  color: var(--c-text-3);
}
.compare-view-tabs {
  display: flex;
  gap: 14px;
}
.compare-view-tabs button {
  padding: 4px 0;
}
.compare-view-tabs button[aria-pressed="true"] {
  color: var(--c-text);
}
@media (max-width: 680px) {
  .compare-entry {
    min-height: 420px;
  }
  .compare-context {
    padding: 6px 14px;
  }
  .compare-workspace.show-details > .compare-main {
    display: none;
  }
  .compare-entry-heading {
    padding: 0 16px;
  }
  .compare-table-view {
    padding: 12px;
  }
  .compare-view-tabs {
    gap: 12px;
  }
}
</style>
