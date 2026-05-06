<script setup lang="ts">
import { computed, ref } from "vue";
import type { Pattern, PatternKind } from "../core/patterns";
import type { DiffEntry } from "../core/diff";

const props = defineProps<{
  patterns: Pattern[];
  /**
   * Optional: when set, the matching pattern row gets a highlighted state.
   * Used so consumers can drive selection from outside (e.g. clicking a
   * row in the diff table that belongs to a pattern).
   */
  selectedPatternKey?: string | null;
}>();

const emit = defineEmits<{
  /** Fired when a pattern row is clicked. Consumers can use this to filter
   *  the diff table to the pattern's members. */
  select: [patternKey: string | null];
}>();

const expanded = ref<Set<string>>(new Set());

function patternKey(pattern: Pattern): string {
  return pattern.key;
}

function toggleExpand(key: string) {
  const next = new Set(expanded.value);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  expanded.value = next;
}

function selectPattern(key: string) {
  emit("select", props.selectedPatternKey === key ? null : key);
}

const kindMeta: Record<PatternKind, { label: string; classes: string; iconClass: string }> = {
  shift: {
    label: "shift",
    classes:
      "bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800",
    iconClass: "bg-blue-500",
  },
  rename: {
    label: "rename",
    classes:
      "bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-300 border-violet-200 dark:border-violet-800",
    iconClass: "bg-violet-500",
  },
  "added-block": {
    label: "added",
    classes:
      "bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800",
    iconClass: "bg-green-500",
  },
  "removed-block": {
    label: "removed",
    classes:
      "bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800",
    iconClass: "bg-red-500",
  },
};

function memberPosition(member: DiffEntry, kind: PatternKind): string {
  const seg = kind === "added-block" ? member.b : (member.a ?? member.b);
  if (!seg) return "?";
  return `${seg.generatedLine + 1}:${seg.generatedColumn}`;
}

const totalMembers = computed(() =>
  props.patterns.reduce((sum, pattern) => sum + pattern.members.length, 0),
);
</script>

<template>
  <div
    v-if="patterns.length > 0"
    class="rounded-lg border border-edge bg-surface mb-3 overflow-hidden"
  >
    <div class="flex items-center gap-2 px-3 py-2 border-b border-edge bg-muted text-xs font-mono">
      <span class="text-[11px] font-semibold uppercase tracking-widest text-fg-muted">
        Patterns
      </span>
      <span class="text-fg-muted">
        {{ patterns.length }} {{ patterns.length === 1 ? "story" : "stories" }} grouping
        {{ totalMembers }} {{ totalMembers === 1 ? "mapping" : "mappings" }}
      </span>
    </div>
    <ul class="divide-y divide-edge">
      <li
        v-for="pattern in patterns"
        :key="patternKey(pattern)"
        class="px-3 py-2 text-xs"
        :class="
          selectedPatternKey === patternKey(pattern)
            ? 'bg-blue-50/50 dark:bg-blue-900/10'
            : 'hover:bg-muted/50'
        "
      >
        <div class="flex items-center gap-2">
          <span
            class="inline-flex shrink-0 items-center gap-1 rounded border px-1.5 py-0.5 font-semibold uppercase tracking-wide"
            :class="kindMeta[pattern.kind].classes"
          >
            <span class="w-1.5 h-1.5 rounded-full" :class="kindMeta[pattern.kind].iconClass" />
            {{ kindMeta[pattern.kind].label }}
          </span>
          <button
            type="button"
            class="flex-1 min-w-0 text-left text-fg hover:text-fg-dim transition truncate font-mono"
            :title="pattern.description"
            @click="selectPattern(patternKey(pattern))"
          >
            {{ pattern.description }}
          </button>
          <span
            class="shrink-0 rounded-full bg-base border border-edge px-1.5 py-0.5 text-fg-muted"
          >
            ×{{ pattern.members.length }}
          </span>
          <button
            type="button"
            class="shrink-0 text-fg-muted hover:text-fg-dim transition px-1"
            :aria-expanded="expanded.has(patternKey(pattern))"
            :aria-label="expanded.has(patternKey(pattern)) ? 'Collapse members' : 'Expand members'"
            @click="toggleExpand(patternKey(pattern))"
          >
            {{ expanded.has(patternKey(pattern)) ? "▾" : "▸" }}
          </button>
        </div>
        <div
          v-if="expanded.has(patternKey(pattern))"
          class="mt-2 pl-7 flex flex-wrap gap-1.5 font-mono"
        >
          <span
            v-for="(member, mi) in pattern.members"
            :key="mi"
            class="rounded bg-base border border-edge px-1.5 py-0.5 text-fg-muted"
          >
            {{ memberPosition(member, pattern.kind) }}
          </span>
        </div>
      </li>
    </ul>
  </div>
</template>
