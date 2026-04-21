<script setup lang="ts">
import IconShare from "~icons/carbon/share";
import IconDebug from "~icons/carbon/debug";
import IconChartBar from "~icons/carbon/chart-bar";
import IconDataTable from "~icons/carbon/data-table";
import IconSun from "~icons/carbon/sun";
import IconMoon from "~icons/carbon/moon";
import IconScreen from "~icons/carbon/screen";
import IconLogoGithub from "~icons/carbon/logo-github";
import { useTheme } from "../composables/useTheme";
import { APP_NAME } from "../constants";

const { theme, toggleTheme } = useTheme();

const themeTitle = {
  light: "Light mode (click for dark)",
  dark: "Dark mode (click for system)",
  system: "System mode (click for light)",
} as const;

defineProps<{
  showStats: boolean;
  showMappings: boolean;
}>();

const emit = defineEmits<{
  "update:showStats": [value: boolean];
  "update:showMappings": [value: boolean];
  home: [];
  aiDebug: [];
  share: [];
}>();
</script>

<template>
  <div class="flex items-center gap-1.5 px-3 py-1.5 border-b border-edge bg-surface">
    <a
      class="flex items-center gap-1.5 cursor-pointer hover:opacity-70 transition mr-1"
      title="Back to home"
      @click="emit('home')"
    >
      <img src="/logo.svg" alt="Logo" class="h-5 w-5" />
      <span class="text-sm font-semibold text-fg">{{ APP_NAME }}</span>
    </a>
    <div class="flex-1" />
    <button
      class="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium text-fg-dim hover:bg-muted transition"
      @click="emit('share')"
    >
      <IconShare class="w-3.5 h-3.5" />
      Share
    </button>
    <button
      class="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium text-fg-dim hover:bg-muted transition"
      @click="emit('aiDebug')"
    >
      <IconDebug class="w-3.5 h-3.5" />
      AI Debug
    </button>
    <div class="w-px h-4 bg-edge mx-0.5" />
    <button
      class="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition"
      :class="showStats ? 'bg-muted text-fg' : 'text-fg-dim hover:bg-muted'"
      @click="emit('update:showStats', !showStats)"
    >
      <IconChartBar class="w-3.5 h-3.5" />
      Stats
    </button>
    <button
      class="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition"
      :class="showMappings ? 'bg-muted text-fg' : 'text-fg-dim hover:bg-muted'"
      @click="emit('update:showMappings', !showMappings)"
    >
      <IconDataTable class="w-3.5 h-3.5" />
      Mappings
    </button>
    <div class="w-px h-4 bg-edge mx-0.5" />
    <a
      href="https://github.com/Dunqing/source-map-visualization"
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
</template>
