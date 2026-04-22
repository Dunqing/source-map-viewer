# Deep Link to Segment + Source Map Diff

## Feature 1: Deep Link to Segment

### Problem

When reporting a source map bug, you have to say "look at mapping #42" in text. There's no way to link directly to a specific mapping.

### Design

Add `?seg=<index>` query param support to the visualization page.

**On page load with `?seg=42`:**

1. Set `store.hoveredSegment` to `mappingIndex[42]`
2. Scroll both code panels to the relevant lines
3. Highlight the segment (same as hover behavior)
4. Scroll the mappings panel to that row (if visible)

**On segment click:**

1. Update the URL query param to `?seg=<index>` via `replaceState`
2. Existing click behavior continues (highlight + scroll)

**On hover (no change):**

- Hover behavior stays as-is (no URL update on hover — too noisy)

**Integration with short URLs:**

- Works with both short and long URLs: `source-map-visualization.voidzero.dev/abc123?seg=42`
- The `syncUrlParams` watcher already handles query params — add `seg` to it

### Files to modify

- `src/pages/VisualizationPage.vue` — read `?seg` on mount, update on click
- `pages/index.vue` — pass through query params during navigation

---

## Feature 2: Source Map Diff

### Problem

When debugging source map issues, the question is usually "what changed?" — comparing before/after a fix, or esbuild vs Oxc output for the same input.

### Design

A diff view that shows how two source maps differ for the same (or similar) original source.

### Input modes

**1. Two URLs (query params):**

```
/compare?a=abc123&b=xyz789
```

Each is a short ID or inline hash. The compare page fetches both via `/api/share/<id>` (or inline decompression).

**2. Upload two files:**
A compare landing page with two drop zones / file pickers. User uploads two `.js` or `.map` files. After loading, shows the diff view.

### Diff view layout

```
┌──────────────────────────────────────────────────┐
│ Source Map Diff                    [A label] vs [B label] │
├──────────────────────────────────────────────────┤
│ Original code (shared, or A's version)           │
├──────────────┬───────────────────────────────────┤
│ Generated A  │ Generated B                       │
├──────────────┴───────────────────────────────────┤
│ Mapping Diff Table                               │
│ ┌───┬──────────┬───┬──────────┬────────┐        │
│ │ # │ A: gen→orig  │ B: gen→orig  │ status │        │
│ ├───┼──────────┼───┼──────────┼────────┤        │
│ │ 1 │ 1:0→1:0  │   │ 1:0→1:0  │ same   │        │
│ │ 2 │ 1:4→1:6  │   │ 1:4→1:4  │ changed│        │
│ │ 3 │ 1:8→1:10 │   │ —        │ removed│        │
│ │ 4 │ —        │   │ 1:8→1:8  │ added  │        │
│ └───┴──────────┴───┴──────────┴────────┘        │
├──────────────────────────────────────────────────┤
│ Summary: 45 same, 3 changed, 2 removed, 1 added │
└──────────────────────────────────────────────────┘
```

### Mapping diff algorithm

Two mappings "match" when they have the same `generatedLine` and `generatedColumn`. For each matched pair:

- **same** — original position is identical
- **changed** — same generated position, different original position (the bug)
- **removed** — exists in A but not in B
- **added** — exists in B but not in A

Color coding:

- Same: no highlight (default)
- Changed: yellow/amber background
- Removed: red background (only in A column)
- Added: green background (only in B column)

### Stats summary

Show at the top or bottom:

- Total mappings in A / B
- Same / Changed / Removed / Added counts
- "A has N bad mappings, B has M bad mappings" (validation results for each)

### URL scheme

- `/compare` — landing page with two file upload zones
- `/compare?a=<id>&b=<id>` — direct link to comparison
- Compare results can be shared by copying the URL

### Pages / routes

- `pages/compare.vue` — new page for the compare view (or a mode within index.vue)
- Since Void's router handles `/compare` as a page, this avoids conflicts with the `/<hash>` middleware (middleware skips paths with dots and known prefixes — add `/compare` to skip list)

### Components

- `CompareLanding.vue` — two file drop zones + "Compare" button
- `CompareView.vue` — the diff visualization (generated panels + diff table)
- `MappingDiffTable.vue` — the diff table component
- Reuse existing `CodePanel` for showing generated code side-by-side

### Files to create/modify

- Create: `pages/compare.vue`
- Create: `src/pages/CompareLanding.vue`
- Create: `src/pages/CompareView.vue`
- Create: `src/components/MappingDiffTable.vue`
- Create: `src/core/diff.ts` — mapping diff algorithm
- Modify: `middleware/01.ai-markdown.ts` — skip `/compare` path
- Modify: `src/pages/LandingPage.vue` — add "Compare" button/link
