<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";
import IconOverflow from "~icons/carbon/overflow-menu-horizontal";
import { useTheme } from "../composables/useTheme";
import { APP_NAME } from "../constants";

const { theme, toggleTheme } = useTheme();
const themeTitle = {
  light: "Light mode (click for dark)",
  dark: "Dark mode (click for system)",
  system: "System mode (click for light)",
} as const;

withDefaults(
  defineProps<{
    mode?: "inspect" | "compare";
    inspectHref?: string;
    showStats?: boolean;
    showMappings?: boolean;
    showPositionLookup?: boolean;
    showFiles?: boolean;
  }>(),
  { mode: "inspect", inspectHref: "/" },
);

const emit = defineEmits<{
  "update:showStats": [value: boolean];
  "update:showMappings": [value: boolean];
  home: [];
  files: [];
  search: [];
  aiDebug: [];
  share: [];
  compare: [];
  positionLookup: [];
}>();

const showMore = ref(false);
const menu = ref<HTMLElement | null>(null);
const moreButton = ref<HTMLButtonElement | null>(null);
function closeMore() {
  showMore.value = false;
}
function handleOutside(event: MouseEvent) {
  if (!menu.value?.contains(event.target as Node)) closeMore();
}
function handleEscape(event: KeyboardEvent) {
  if (event.key === "Escape" && showMore.value) {
    closeMore();
    moreButton.value?.focus();
  }
}
onMounted(() => {
  document.addEventListener("pointerdown", handleOutside);
  document.addEventListener("keydown", handleEscape);
});
onUnmounted(() => {
  document.removeEventListener("pointerdown", handleOutside);
  document.removeEventListener("keydown", handleEscape);
});
</script>

<template>
  <header class="workspace-toolbar">
    <a class="workspace-brand" href="/" @click.prevent="emit('home')">{{ APP_NAME }}</a>
    <nav class="workspace-modes" aria-label="Workspace mode">
      <a v-if="mode === 'compare'" :href="inspectHref">Inspect</a>
      <span v-else aria-current="page">Inspect</span>
      <span v-if="mode === 'compare'" aria-current="page">Compare</span>
      <button v-else type="button" @click="emit('compare')">Compare</button>
    </nav>
    <div class="workspace-tools">
      <button type="button" class="workspace-button" @click="emit('home')">Open</button>
      <button
        type="button"
        class="workspace-button"
        :aria-expanded="showFiles ?? false"
        aria-haspopup="dialog"
        @click="emit('files')"
      >
        Files
      </button>
      <button
        v-if="mode === 'inspect'"
        type="button"
        class="workspace-button"
        id="position-lookup-toggle"
        :aria-expanded="showPositionLookup ?? false"
        aria-controls="position-lookup-panel"
        title="Find position (Ctrl/Cmd+G)"
        @click="emit('positionLookup')"
      >
        Find<span class="workspace-position-label"> position</span>
      </button>
      <button
        type="button"
        class="workspace-button"
        :aria-expanded="showStats ?? false"
        @click="emit('update:showStats', !showStats)"
      >
        Details
      </button>
      <div ref="menu" class="workspace-more">
        <button
          ref="moreButton"
          type="button"
          class="workspace-icon"
          aria-label="More tools"
          :aria-expanded="showMore"
          @click="showMore = !showMore"
        >
          <IconOverflow />
        </button>
        <div v-show="showMore" class="workspace-menu">
          <template v-if="mode === 'inspect'">
            <button
              type="button"
              @click="
                emit('search');
                closeMore();
              "
            >
              Search code <kbd>⌘ / Ctrl F</kbd>
            </button>
            <button
              type="button"
              @click="
                emit('update:showMappings', !showMappings);
                closeMore();
              "
            >
              {{ showMappings ? "Hide mappings" : "Mapping table" }}
            </button>
            <button
              type="button"
              @click="
                emit('aiDebug');
                closeMore();
              "
            >
              AI Debug
            </button>
            <button
              type="button"
              @click="
                emit('share');
                closeMore();
              "
            >
              Share
            </button>
          </template>
          <slot name="options" />
          <button type="button" :title="themeTitle[theme]" @click="toggleTheme">
            Theme: {{ theme }}
          </button>
          <a href="https://github.com/Dunqing/source-map-viewer" target="_blank" rel="noopener"
            >GitHub</a
          >
        </div>
      </div>
    </div>
  </header>
</template>
