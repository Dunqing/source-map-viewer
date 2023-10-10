import { ref, watch, onMounted } from "vue";

type Theme = "light" | "dark";
const STORAGE_KEY = "source-map-viz-theme";
const theme = ref<Theme>("light");
let initialized = false;

function applyTheme(t: Theme) {
  if (typeof document !== "undefined") {
    document.documentElement.classList.toggle("dark", t === "dark");
    document.documentElement.style.colorScheme = t;
  }
}

// Module-level watcher — not tied to any component's lifecycle,
// so it survives when LandingPage unmounts on navigation.
watch(theme, (newTheme) => {
  localStorage.setItem(STORAGE_KEY, newTheme);
  applyTheme(newTheme);
});

export function useTheme() {
  // Defer browser-only initialization to onMounted to avoid
  // SSR hydration mismatches (server has no localStorage/matchMedia)
  onMounted(() => {
    if (initialized) return;
    initialized = true;

    const stored = localStorage.getItem(STORAGE_KEY) as Theme | null;
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    if (stored) {
      theme.value = stored;
    } else if (mql.matches) {
      theme.value = "dark";
    }
    applyTheme(theme.value);

    // Listener lives for page lifetime (singleton pattern — initialized guard
    // ensures only one listener exists). No cleanup needed.
    mql.addEventListener("change", (e) => {
      if (!localStorage.getItem(STORAGE_KEY)) {
        theme.value = e.matches ? "dark" : "light";
      }
    });
  });

  function toggleTheme() {
    theme.value = theme.value === "light" ? "dark" : "light";
  }

  return { theme, toggleTheme };
}
