<script setup lang="ts">
import { useSourceMapStore } from "../stores/sourceMap";

const store = useSourceMapStore();
</script>

<template>
  <div v-if="store.stats" class="p-4 border-l border-edge bg-surface w-64 overflow-y-auto text-sm">
    <h3 class="font-medium mb-3 text-fg">Source Map Stats</h3>
    <dl class="space-y-2">
      <div class="flex justify-between">
        <dt class="text-fg-muted">Mappings</dt>
        <dd class="font-mono">{{ store.stats.totalMappings.toLocaleString() }}</dd>
      </div>
      <div class="flex justify-between">
        <dt class="text-fg-muted">Coverage</dt>
        <dd class="font-mono">{{ store.stats.coveragePercent }}%</dd>
      </div>
      <div class="flex justify-between">
        <dt class="text-fg-muted">Mapped bytes</dt>
        <dd class="font-mono">{{ store.stats.mappedBytes.toLocaleString() }}</dd>
      </div>
      <div class="flex justify-between">
        <dt class="text-fg-muted">Unmapped bytes</dt>
        <dd class="font-mono">{{ store.stats.unmappedBytes.toLocaleString() }}</dd>
      </div>
      <div class="flex justify-between">
        <dt class="text-fg-muted" :class="store.stats.badMappings > 0 ? 'text-red-500' : ''">
          Bad mappings
        </dt>
        <dd class="font-mono" :class="store.stats.badMappings > 0 ? 'text-red-500' : ''">
          {{ store.stats.badMappings }}
        </dd>
      </div>
    </dl>
    <h4 class="font-medium mt-4 mb-2 text-fg">Files</h4>
    <ul class="space-y-1">
      <li
        v-for="file in store.stats.fileSizes"
        :key="file.name"
        class="flex justify-between text-xs"
      >
        <span class="text-fg-dim truncate mr-2">{{ file.name }}</span>
        <span class="font-mono text-fg-muted shrink-0">{{ (file.size / 1024).toFixed(1) }}KB</span>
      </li>
    </ul>
  </div>
</template>
