<script setup lang="ts">
/**
 * Renders a `PointSnippet` from MappingDiffTable. The "point" character
 * (the mapping target) gets an underline + faint background tint so the
 * cursor is visible without colliding with the natural `()` / `[]`
 * punctuation of the surrounding code — the previous `[char]` literal-
 * bracket form was unreadable inside JS expressions.
 *
 * `tone` selects the color family: red for A-side / removed, green for
 * B-side / added, neutral for unchanged previews. The line-through
 * decoration is applied only when `lineThrough` is set, so this same
 * component can render both the "removed text in A" case and the
 * "current text in B" case.
 */
defineProps<{
  snippet: {
    prefix: string;
    before: string;
    point: string;
    after: string;
    suffix: string;
  };
  tone?: "red" | "green" | "muted";
  lineThrough?: boolean;
}>();
</script>

<template>
  <span>
    <span class="text-fg-muted">{{ snippet.prefix }}</span>
    <span :class="{ 'line-through': lineThrough }">{{ snippet.before }}</span>
    <span
      class="rounded-sm px-px"
      :class="{
        'line-through': lineThrough,
        'bg-red-500/25 underline decoration-red-500 decoration-2 underline-offset-2':
          tone === 'red',
        'bg-green-500/25 underline decoration-green-500 decoration-2 underline-offset-2':
          tone === 'green',
        'bg-amber-400/30 underline decoration-amber-500 decoration-2 underline-offset-2':
          tone === 'muted' || !tone,
      }"
      >{{ snippet.point }}</span
    >
    <span :class="{ 'line-through': lineThrough }">{{ snippet.after }}</span>
    <span class="text-fg-muted">{{ snippet.suffix }}</span>
  </span>
</template>
