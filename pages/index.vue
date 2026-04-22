<script setup lang="ts">
import { ref, nextTick, onMounted, onUnmounted } from "vue";
import { useSourceMapStore } from "../src/stores/sourceMap";
import { resolveSlug } from "../src/composables/useShareableUrl";
import LandingPage from "../src/pages/LandingPage.vue";
import VisualizationPage from "../src/pages/VisualizationPage.vue";

const store = useSourceMapStore();
const resolved = ref(false);
const showVisualization = ref(false);
let currentSlug = "";

function getSlugFromUrl(): string {
  const pathMatch = window.location.pathname.match(/^\/(.+)$/);
  return pathMatch ? pathMatch[1] : "";
}

async function handleNavigation() {
  const slug = getSlugFromUrl();
  if (slug) {
    if (slug === currentSlug && store.parsedData) {
      // Same slug already loaded — skip redundant fetch
    } else {
      currentSlug = slug;
      const data = await resolveSlug(slug);
      if (data) {
        store.loadSourceMap(data.generatedCode, data.sourceMapJson);
      }
    }
    // Let Vue flush all store reactive updates before mounting VisualizationPage.
    // Without this, mounting happens in the same flush cycle as loadSourceMap,
    // and the cascading reactive reads during render trigger Void's update queue
    // to loop infinitely.
    await nextTick();
    showVisualization.value = !!store.parsedData;
  } else {
    currentSlug = "";
    showVisualization.value = false;
  }
  resolved.value = true;
  document.documentElement.classList.remove("has-share-slug");
}

onMounted(() => {
  handleNavigation();
  window.addEventListener("popstate", handleNavigation);
  window.addEventListener("smv-navigate", handleNavigation);
});

onUnmounted(() => {
  window.removeEventListener("popstate", handleNavigation);
  window.removeEventListener("smv-navigate", handleNavigation);
});
</script>

<template>
  <VisualizationPage v-if="showVisualization" />
  <LandingPage v-else-if="resolved" />
</template>
