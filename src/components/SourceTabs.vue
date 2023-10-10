<script setup lang="ts">
import { useSourceMapStore } from "../stores/sourceMap";

const store = useSourceMapStore();
</script>

<template>
  <div class="flex items-center gap-1 px-2 py-1 border-b border-edge overflow-x-auto">
    <button
      v-for="(source, i) in store.parsedData?.sources ?? []"
      :key="i"
      class="px-2 py-1 rounded text-xs whitespace-nowrap transition"
      :class="
        store.activeSourceIndex === i
          ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-medium'
          : 'hover:bg-surface text-fg-dim'
      "
      @click="store.setActiveSource(i)"
    >
      {{ source }}
    </button>
  </div>
</template>
