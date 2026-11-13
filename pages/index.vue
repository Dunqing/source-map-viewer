<script setup lang="ts">
import { ref, nextTick, onMounted, onUnmounted } from "vue";
import { useSourceMapStore } from "../src/stores/sourceMap";
import { getInlineSlug, getPathSlug, NAVIGATION_EVENT } from "../src/composables/navigation";
import { decompressFromHash, resolveSlug } from "../src/composables/useShareableUrl";
import { getCachedSession, isLocalSessionSlug } from "../src/composables/useSessionCollectionCache";
import { scheduleCommonHighlighterPrewarm } from "../src/composables/useHighlighter";
import LandingPage from "../src/pages/LandingPage.vue";
import VisualizationPage from "../src/pages/VisualizationPage.vue";

const store = useSourceMapStore();
const resolved = ref(false);
const showVisualization = ref(false);
let currentSlug = "";
let navigationGeneration = 0;
let cancelHighlighterWarmup = () => {};

async function handleNavigation() {
  const generation = ++navigationGeneration;
  // Fragments stay in the browser, so large inline payloads never hit HTTP URL limits.
  const inlineSlug = window.location.pathname === "/" ? getInlineSlug() : "";
  const slug = inlineSlug || getPathSlug();
  if (slug) {
    if ((slug === currentSlug || slug === store.sessionSlug) && store.parsedData) {
      // Same slug already loaded — skip redundant fetch
      currentSlug = slug;
    } else {
      const cachedSession = getCachedSession(slug);
      if (cachedSession) {
        store.loadSourceMapCollection(cachedSession.entries, 0, slug, cachedSession.label);
      } else if (isLocalSessionSlug(slug)) {
        // Local sessions never fall back to a remote lookup. They are scoped to
        // this tab and may no longer exist after the tab has been closed.
        store.reset();
      } else {
        const data = inlineSlug ? await decompressFromHash(inlineSlug) : await resolveSlug(slug);
        if (generation !== navigationGeneration) return;
        if (data) {
          store.loadSourceMap(data.generatedCode, data.sourceMapJson);
        } else {
          store.reset();
        }
      }
      currentSlug = slug;
    }
    // Let Vue flush all store reactive updates before mounting VisualizationPage.
    // Without this, mounting happens in the same flush cycle as loadSourceMap,
    // and the cascading reactive reads during render trigger Void's update queue
    // to loop infinitely.
    await nextTick();
    if (generation !== navigationGeneration) return;
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
  window.addEventListener("hashchange", handleNavigation);
  window.addEventListener(NAVIGATION_EVENT, handleNavigation);
  cancelHighlighterWarmup = scheduleCommonHighlighterPrewarm();
});

onUnmounted(() => {
  window.removeEventListener("popstate", handleNavigation);
  window.removeEventListener("hashchange", handleNavigation);
  window.removeEventListener(NAVIGATION_EVENT, handleNavigation);
  cancelHighlighterWarmup();
});
</script>

<template>
  <VisualizationPage v-if="showVisualization" />
  <LandingPage v-else-if="resolved" />
</template>
