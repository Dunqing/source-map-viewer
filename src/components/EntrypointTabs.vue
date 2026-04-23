<script setup lang="ts">
defineProps<{
  entries: string[];
  activeIndex: number;
}>();

const emit = defineEmits<{
  select: [index: number];
}>();

function handleSelect(index: number) {
  emit("select", index);
}
</script>

<template>
  <div class="flex items-center gap-2 px-2 py-1 border-b border-edge bg-muted overflow-x-auto">
    <span class="shrink-0 pl-1 text-[11px] font-semibold uppercase tracking-widest text-fg-muted">
      Entrypoint
    </span>
    <button
      v-for="(entry, i) in entries"
      :key="entry"
      class="px-2 py-1 rounded text-xs whitespace-nowrap transition"
      :class="
        activeIndex === i
          ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-medium'
          : 'hover:bg-surface text-fg-dim'
      "
      :title="entry"
      @click="handleSelect(i)"
    >
      {{ entry }}
    </button>
  </div>
</template>
