# Source Map Diff Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `/compare` page that shows a diff between two source maps, highlighting added/removed/changed mappings.

**Architecture:** New `/compare` page with its own landing (two file drop zones or URL input) and diff view. The diff algorithm matches mappings by generated position and classifies them as same/changed/removed/added. Reuses existing `CodePanel` for generated code display and `useFileLoader` for input handling.

**Tech Stack:** Vue 3, Void SDK pages, existing core modules

---

### Task 1: Implement mapping diff algorithm

**Files:**

- Create: `src/core/diff.ts`
- Create: `src/__tests__/diff.test.ts`

- [ ] **Step 1: Write tests for the diff algorithm**

Create `src/__tests__/diff.test.ts`:

```ts
import { describe, it, expect } from "vite-plus/test";
import { diffMappings, type DiffEntry } from "../core/diff";
import type { MappingSegment } from "../core/types";

function seg(genLine: number, genCol: number, origLine: number, origCol: number): MappingSegment {
  return {
    generatedLine: genLine,
    generatedColumn: genCol,
    originalLine: origLine,
    originalColumn: origCol,
    sourceIndex: 0,
    nameIndex: null,
  };
}

describe("diffMappings", () => {
  it("marks identical mappings as same", () => {
    const a = [seg(0, 0, 0, 0), seg(0, 4, 0, 4)];
    const b = [seg(0, 0, 0, 0), seg(0, 4, 0, 4)];
    const result = diffMappings(a, b);
    expect(result.entries.every((e) => e.status === "same")).toBe(true);
    expect(result.summary.same).toBe(2);
  });

  it("detects changed mappings (same gen position, different orig)", () => {
    const a = [seg(0, 0, 0, 0)];
    const b = [seg(0, 0, 0, 5)]; // different original column
    const result = diffMappings(a, b);
    expect(result.entries[0].status).toBe("changed");
    expect(result.summary.changed).toBe(1);
  });

  it("detects removed mappings (in A but not B)", () => {
    const a = [seg(0, 0, 0, 0), seg(0, 4, 0, 4)];
    const b = [seg(0, 0, 0, 0)];
    const result = diffMappings(a, b);
    expect(result.entries.filter((e) => e.status === "removed")).toHaveLength(1);
    expect(result.summary.removed).toBe(1);
  });

  it("detects added mappings (in B but not A)", () => {
    const a = [seg(0, 0, 0, 0)];
    const b = [seg(0, 0, 0, 0), seg(0, 8, 0, 8)];
    const result = diffMappings(a, b);
    expect(result.entries.filter((e) => e.status === "added")).toHaveLength(1);
    expect(result.summary.added).toBe(1);
  });

  it("handles empty inputs", () => {
    expect(diffMappings([], []).summary.same).toBe(0);
    expect(diffMappings([seg(0, 0, 0, 0)], []).summary.removed).toBe(1);
    expect(diffMappings([], [seg(0, 0, 0, 0)]).summary.added).toBe(1);
  });

  it("handles mixed diff", () => {
    const a = [seg(0, 0, 0, 0), seg(0, 4, 0, 4), seg(0, 8, 0, 8)];
    const b = [seg(0, 0, 0, 0), seg(0, 4, 0, 10), seg(0, 12, 0, 12)];
    const result = diffMappings(a, b);
    expect(result.summary.same).toBe(1);
    expect(result.summary.changed).toBe(1);
    expect(result.summary.removed).toBe(1);
    expect(result.summary.added).toBe(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
vp test src/__tests__/diff.test.ts --run
```

- [ ] **Step 3: Implement the diff algorithm**

Create `src/core/diff.ts`:

```ts
import type { MappingSegment } from "./types";

export type DiffStatus = "same" | "changed" | "removed" | "added";

export interface DiffEntry {
  status: DiffStatus;
  a: MappingSegment | null;
  b: MappingSegment | null;
}

export interface DiffSummary {
  same: number;
  changed: number;
  removed: number;
  added: number;
}

export interface DiffResult {
  entries: DiffEntry[];
  summary: DiffSummary;
}

function makeKey(seg: MappingSegment): string {
  return `${seg.generatedLine}:${seg.generatedColumn}`;
}

export function diffMappings(a: MappingSegment[], b: MappingSegment[]): DiffResult {
  const bByKey = new Map<string, MappingSegment>();
  for (const seg of b) {
    bByKey.set(makeKey(seg), seg);
  }

  const matched = new Set<string>();
  const entries: DiffEntry[] = [];
  const summary: DiffSummary = { same: 0, changed: 0, removed: 0, added: 0 };

  // Walk through A: match against B
  for (const aSeg of a) {
    const key = makeKey(aSeg);
    const bSeg = bByKey.get(key);

    if (!bSeg) {
      entries.push({ status: "removed", a: aSeg, b: null });
      summary.removed++;
    } else {
      matched.add(key);
      if (
        aSeg.originalLine === bSeg.originalLine &&
        aSeg.originalColumn === bSeg.originalColumn &&
        aSeg.sourceIndex === bSeg.sourceIndex
      ) {
        entries.push({ status: "same", a: aSeg, b: bSeg });
        summary.same++;
      } else {
        entries.push({ status: "changed", a: aSeg, b: bSeg });
        summary.changed++;
      }
    }
  }

  // Remaining in B that weren't matched
  for (const bSeg of b) {
    if (!matched.has(makeKey(bSeg))) {
      entries.push({ status: "added", a: null, b: bSeg });
      summary.added++;
    }
  }

  // Sort by generated position for display
  entries.sort((x, y) => {
    const xSeg = x.a ?? x.b!;
    const ySeg = y.a ?? y.b!;
    if (xSeg.generatedLine !== ySeg.generatedLine) return xSeg.generatedLine - ySeg.generatedLine;
    return xSeg.generatedColumn - ySeg.generatedColumn;
  });

  return { entries, summary };
}
```

- [ ] **Step 4: Run tests**

```bash
vp test src/__tests__/diff.test.ts --run
```

All 6 tests should pass.

- [ ] **Step 5: Commit**

```bash
git add src/core/diff.ts src/__tests__/diff.test.ts
git commit -m "feat: add source map mapping diff algorithm"
```

---

### Task 2: Update middleware to skip /compare

**Files:**

- Modify: `middleware/01.ai-markdown.ts`

- [ ] **Step 1: Add /compare to the skip list**

In `middleware/01.ai-markdown.ts`, update the path skip check (around line 58):

```ts
if (
  path === "/" ||
  path.includes(".") ||
  path.startsWith("/__") ||
  path.startsWith("/api/") ||
  path === "/compare"
) {
  return next();
}
```

- [ ] **Step 2: Commit**

```bash
git add middleware/01.ai-markdown.ts
git commit -m "fix: skip /compare path in AI middleware"
```

---

### Task 3: Create compare page entry point

**Files:**

- Create: `pages/compare.vue`
- Create: `src/pages/CompareView.vue` (stub)

- [ ] **Step 1: Create pages/compare.vue**

```vue
<script setup lang="ts">
import { ref, onMounted } from "vue";
import { decompressFromHash } from "../src/composables/useShareableUrl";
import { parseSourceMap } from "../src/core/parser";
import { buildMappingIndex } from "../src/core/mapper";
import { useTheme } from "../src/composables/useTheme";
import CompareView from "../src/pages/CompareView.vue";

useTheme();

interface SourceMapEntry {
  generatedCode: string;
  sourceMapJson: string;
  label: string;
}

const entryA = ref<SourceMapEntry | null>(null);
const entryB = ref<SourceMapEntry | null>(null);
const loading = ref(false);
const error = ref<string | null>(null);

async function resolveSlug(slug: string): Promise<SourceMapEntry | null> {
  const inline = await decompressFromHash(slug);
  if (inline) return { ...inline, label: "A" };
  try {
    const res = await fetch(`/api/share/${slug}`);
    if (res.ok) {
      const data = await res.json();
      return { ...data, label: slug };
    }
  } catch {}
  return null;
}

onMounted(async () => {
  const params = new URLSearchParams(window.location.search);
  const a = params.get("a");
  const b = params.get("b");

  if (a && b) {
    loading.value = true;
    try {
      const [dataA, dataB] = await Promise.all([resolveSlug(a), resolveSlug(b)]);
      if (!dataA || !dataB) {
        error.value = "Failed to load one or both source maps";
        return;
      }
      entryA.value = { ...dataA, label: a };
      entryB.value = { ...dataB, label: b };
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Failed to load";
    } finally {
      loading.value = false;
    }
  }
});
</script>

<template>
  <div v-if="loading" class="min-h-screen flex items-center justify-center bg-base text-fg-muted">
    Loading source maps...
  </div>
  <div v-else-if="error" class="min-h-screen flex items-center justify-center bg-base text-red-500">
    {{ error }}
  </div>
  <CompareView v-else-if="entryA && entryB" :entry-a="entryA" :entry-b="entryB" />
  <div v-else class="min-h-screen flex items-center justify-center bg-base">
    <p class="text-fg-muted">Compare page — TODO: add file upload landing</p>
  </div>
</template>
```

- [ ] **Step 2: Create stub CompareView.vue**

Create `src/pages/CompareView.vue`:

```vue
<script setup lang="ts">
const props = defineProps<{
  entryA: { generatedCode: string; sourceMapJson: string; label: string };
  entryB: { generatedCode: string; sourceMapJson: string; label: string };
}>();
</script>

<template>
  <div class="min-h-screen bg-base p-4 text-fg">
    <h1 class="text-lg font-bold mb-4">
      Source Map Diff: {{ entryA.label }} vs {{ entryB.label }}
    </h1>
    <p class="text-fg-muted">TODO: implement diff view</p>
  </div>
</template>
```

- [ ] **Step 3: Test**

Start dev server, navigate to `/compare` — should show the TODO landing. Navigate to `/compare?a=<id>&b=<id>` with two valid short IDs — should show the stub diff view.

- [ ] **Step 4: Commit**

```bash
git add pages/compare.vue src/pages/CompareView.vue
git commit -m "feat: add compare page entry point with URL param loading"
```

---

### Task 4: Implement MappingDiffTable component

**Files:**

- Create: `src/components/MappingDiffTable.vue`

- [ ] **Step 1: Create MappingDiffTable.vue**

```vue
<script setup lang="ts">
import { computed } from "vue";
import type { DiffEntry, DiffSummary } from "../core/diff";

const props = defineProps<{
  entries: DiffEntry[];
  summary: DiffSummary;
  sourcesA: string[];
  sourcesB: string[];
}>();

const emit = defineEmits<{
  clickEntry: [entry: DiffEntry];
}>();

const filteredEntries = computed(() => props.entries);

function formatPos(seg: { generatedLine: number; generatedColumn: number } | null): string {
  if (!seg) return "—";
  return `${seg.generatedLine + 1}:${seg.generatedColumn}`;
}

function formatOrig(
  seg: { originalLine: number; originalColumn: number; sourceIndex: number } | null,
  sources: string[],
): string {
  if (!seg) return "—";
  const src = sources[seg.sourceIndex] ?? "?";
  return `${src} ${seg.originalLine + 1}:${seg.originalColumn}`;
}

function statusClass(status: string): string {
  switch (status) {
    case "changed":
      return "bg-amber-100 dark:bg-amber-900/30";
    case "removed":
      return "bg-red-100 dark:bg-red-900/30";
    case "added":
      return "bg-green-100 dark:bg-green-900/30";
    default:
      return "";
  }
}

function statusIcon(status: string): string {
  switch (status) {
    case "same":
      return "=";
    case "changed":
      return "~";
    case "removed":
      return "-";
    case "added":
      return "+";
    default:
      return "";
  }
}
</script>

<template>
  <div class="overflow-auto">
    <!-- Summary -->
    <div class="flex gap-4 px-3 py-2 text-xs text-fg-muted border-b border-edge bg-muted">
      <span>{{ summary.same }} same</span>
      <span class="text-amber-600 dark:text-amber-400">{{ summary.changed }} changed</span>
      <span class="text-red-600 dark:text-red-400">{{ summary.removed }} removed</span>
      <span class="text-green-600 dark:text-green-400">{{ summary.added }} added</span>
    </div>

    <!-- Table -->
    <table class="w-full text-xs font-mono">
      <thead>
        <tr class="border-b border-edge text-fg-muted">
          <th class="px-2 py-1 text-left w-8"></th>
          <th class="px-2 py-1 text-left">Gen</th>
          <th class="px-2 py-1 text-left">A → Original</th>
          <th class="px-2 py-1 text-left">B → Original</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="(entry, i) in filteredEntries"
          :key="i"
          :class="statusClass(entry.status)"
          class="border-b border-edge/50 cursor-pointer hover:bg-surface transition"
          @click="emit('clickEntry', entry)"
        >
          <td class="px-2 py-0.5 text-fg-muted">{{ statusIcon(entry.status) }}</td>
          <td class="px-2 py-0.5">{{ formatPos(entry.a ?? entry.b) }}</td>
          <td class="px-2 py-0.5">{{ entry.a ? formatOrig(entry.a, sourcesA) : "—" }}</td>
          <td class="px-2 py-0.5">{{ entry.b ? formatOrig(entry.b, sourcesB) : "—" }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
```

- [ ] **Step 2: Commit**

```bash
git add src/components/MappingDiffTable.vue
git commit -m "feat: add MappingDiffTable component for source map diff"
```

---

### Task 5: Wire up CompareView with diff logic

**Files:**

- Modify: `src/pages/CompareView.vue`

- [ ] **Step 1: Implement full CompareView**

Replace the stub in `src/pages/CompareView.vue`:

```vue
<script setup lang="ts">
import { computed } from "vue";
import { parseSourceMap } from "../core/parser";
import { buildMappingIndex } from "../core/mapper";
import { validateMappings } from "../core/validator";
import { diffMappings } from "../core/diff";
import MappingDiffTable from "../components/MappingDiffTable.vue";
import IconArrowLeft from "~icons/carbon/arrow-left";

const props = defineProps<{
  entryA: { generatedCode: string; sourceMapJson: string; label: string };
  entryB: { generatedCode: string; sourceMapJson: string; label: string };
}>();

const parsedA = computed(() => {
  const data = parseSourceMap(props.entryA.sourceMapJson);
  const index = buildMappingIndex(data.mappings);
  const diagnostics = validateMappings(data);
  return { data, index, diagnostics };
});

const parsedB = computed(() => {
  const data = parseSourceMap(props.entryB.sourceMapJson);
  const index = buildMappingIndex(data.mappings);
  const diagnostics = validateMappings(data);
  return { data, index, diagnostics };
});

const diff = computed(() => diffMappings(parsedA.value.index, parsedB.value.index));
</script>

<template>
  <div class="h-screen flex flex-col bg-panel text-fg">
    <!-- Header -->
    <div class="flex items-center gap-3 px-4 py-2 border-b border-edge bg-muted">
      <a href="/" class="text-fg-muted hover:text-fg transition">
        <IconArrowLeft class="w-4 h-4" />
      </a>
      <h1 class="text-sm font-semibold">Source Map Diff</h1>
      <span class="text-xs text-fg-muted">{{ entryA.label }} vs {{ entryB.label }}</span>

      <div class="ml-auto flex gap-4 text-xs text-fg-muted">
        <span>A: {{ parsedA.index.length }} mappings ({{ parsedA.diagnostics.length }} bad)</span>
        <span>B: {{ parsedB.index.length }} mappings ({{ parsedB.diagnostics.length }} bad)</span>
      </div>
    </div>

    <!-- Diff table -->
    <div class="flex-1 overflow-auto">
      <MappingDiffTable
        :entries="diff.entries"
        :summary="diff.summary"
        :sources-a="parsedA.data.sources"
        :sources-b="parsedB.data.sources"
      />
    </div>
  </div>
</template>
```

- [ ] **Step 2: Test**

Start dev server. Create two short URLs with different source maps (use the share API or examples). Navigate to `/compare?a=<id1>&b=<id2>`. Should show the diff table with colored rows.

- [ ] **Step 3: Commit**

```bash
git add src/pages/CompareView.vue
git commit -m "feat: implement CompareView with diff table"
```

---

### Task 6: Add compare file upload landing

**Files:**

- Modify: `src/pages/CompareView.vue` (or create `src/pages/CompareLanding.vue`)
- Modify: `pages/compare.vue`

- [ ] **Step 1: Create CompareLanding.vue**

Create `src/pages/CompareLanding.vue`:

```vue
<script setup lang="ts">
import { ref } from "vue";
import { useFileLoader } from "../composables/useFileLoader";
import IconUpload from "~icons/carbon/upload";
import IconArrowLeft from "~icons/carbon/arrow-left";

const { loadFromFiles } = useFileLoader();

const fileA = ref<{ generatedCode: string; sourceMapJson: string; label: string } | null>(null);
const fileB = ref<{ generatedCode: string; sourceMapJson: string; label: string } | null>(null);
const error = ref<string | null>(null);

const emit = defineEmits<{
  compare: [
    a: { generatedCode: string; sourceMapJson: string; label: string },
    b: { generatedCode: string; sourceMapJson: string; label: string },
  ];
}>();

async function handleFilesA(e: Event) {
  const input = e.target as HTMLInputElement;
  if (!input.files?.length) return;
  try {
    const result = await loadFromFiles(Array.from(input.files));
    fileA.value = { ...result, label: input.files[0].name };
    error.value = null;
  } catch (err) {
    error.value = err instanceof Error ? err.message : "Failed to load file A";
  }
}

async function handleFilesB(e: Event) {
  const input = e.target as HTMLInputElement;
  if (!input.files?.length) return;
  try {
    const result = await loadFromFiles(Array.from(input.files));
    fileB.value = { ...result, label: input.files[0].name };
    error.value = null;
  } catch (err) {
    error.value = err instanceof Error ? err.message : "Failed to load file B";
  }
}

function handleCompare() {
  if (fileA.value && fileB.value) {
    emit("compare", fileA.value, fileB.value);
  }
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-base p-4">
    <div class="max-w-lg w-full space-y-6">
      <div class="text-center">
        <a href="/" class="text-fg-muted hover:text-fg transition text-xs">
          <IconArrowLeft class="w-3 h-3 inline mr-1" />Back
        </a>
        <h1 class="text-2xl font-bold tracking-tight text-fg mt-2">Compare Source Maps</h1>
        <p class="text-sm text-fg-muted mt-1">Upload two files to diff their mappings</p>
      </div>

      <div
        v-if="error"
        class="rounded-lg bg-red-50 dark:bg-red-900/20 p-3 text-red-700 dark:text-red-400 text-sm"
      >
        {{ error }}
      </div>

      <div class="grid grid-cols-2 gap-4">
        <label
          class="flex flex-col items-center justify-center gap-2 p-6 rounded-xl border-2 border-dashed border-edge bg-surface cursor-pointer hover:bg-muted transition"
          :class="{ 'border-blue-500': fileA }"
        >
          <IconUpload class="w-5 h-5 text-fg-muted" />
          <span class="text-sm text-fg-muted">{{ fileA ? fileA.label : "File A" }}</span>
          <input
            type="file"
            accept=".js,.ts,.css,.map,.json"
            class="hidden"
            @change="handleFilesA"
          />
        </label>

        <label
          class="flex flex-col items-center justify-center gap-2 p-6 rounded-xl border-2 border-dashed border-edge bg-surface cursor-pointer hover:bg-muted transition"
          :class="{ 'border-blue-500': fileB }"
        >
          <IconUpload class="w-5 h-5 text-fg-muted" />
          <span class="text-sm text-fg-muted">{{ fileB ? fileB.label : "File B" }}</span>
          <input
            type="file"
            accept=".js,.ts,.css,.map,.json"
            class="hidden"
            @change="handleFilesB"
          />
        </label>
      </div>

      <button
        class="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition disabled:opacity-50"
        :disabled="!fileA || !fileB"
        @click="handleCompare"
      >
        Compare
      </button>
    </div>
  </div>
</template>
```

- [ ] **Step 2: Update pages/compare.vue to use CompareLanding**

Replace the `v-else` fallback in `pages/compare.vue`:

```vue
<script setup lang="ts">
// ... existing imports ...
import CompareLanding from "../src/pages/CompareLanding.vue";

// ... existing code ...

function handleFileCompare(
  a: { generatedCode: string; sourceMapJson: string; label: string },
  b: { generatedCode: string; sourceMapJson: string; label: string },
) {
  entryA.value = a;
  entryB.value = b;
}
</script>

<template>
  <!-- ... existing v-if/v-else-if blocks ... -->
  <CompareLanding v-else @compare="handleFileCompare" />
</template>
```

- [ ] **Step 3: Test**

Navigate to `/compare`, upload two .js files with different source maps, click Compare. Should show the diff view.

- [ ] **Step 4: Commit**

```bash
git add src/pages/CompareLanding.vue pages/compare.vue
git commit -m "feat: add file upload landing for source map compare"
```

---

### Task 7: Add compare link to landing page

**Files:**

- Modify: `src/pages/LandingPage.vue`

- [ ] **Step 1: Add a Compare link**

In the "How it works" section of `LandingPage.vue`, add a Compare link in the footer area (near the GitHub link):

```vue
<a href="/compare" class="flex items-center gap-1 hover:text-fg-dim transition">
  Compare source maps
</a>
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/LandingPage.vue
git commit -m "feat: add compare link to landing page"
```

---

### Task 8: Final integration test

- [ ] **Step 1: Run all tests**

```bash
vp test --run
```

All tests should pass (including the new diff tests).

- [ ] **Step 2: Test deep link end-to-end**

1. Open a visualization
2. Click a mapping → URL updates to `?seg=N`
3. Copy URL, open in new tab → same segment highlighted

- [ ] **Step 3: Test compare end-to-end**

1. Create two short URLs via the share API
2. Navigate to `/compare?a=<id1>&b=<id2>` → shows diff table
3. Navigate to `/compare` → shows file upload landing
4. Upload two files → shows diff table

- [ ] **Step 4: Build and check**

```bash
vp check --fix
vp build
```

- [ ] **Step 5: Commit if needed**

```bash
git add -A
git commit -m "chore: final integration fixes"
```
