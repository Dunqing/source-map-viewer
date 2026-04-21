import { ref, computed, watch, onMounted } from "vue";

type Theme = "light" | "dark" | "system";
type ResolvedTheme = "light" | "dark";
const STORAGE_KEY = "source-map-viz-theme";
const theme = ref<Theme>("system");
const systemPrefersDark = ref(false);
let initialized = false;

const resolvedTheme = computed<ResolvedTheme>(() => {
  if (theme.value === "system") return systemPrefersDark.value ? "dark" : "light";
  return theme.value;
});

function applyTheme(t: ResolvedTheme) {
  if (typeof document !== "undefined") {
    document.documentElement.classList.toggle("dark", t === "dark");
    document.documentElement.style.colorScheme = t;
  }
}

// Module-level watcher — not tied to any component's lifecycle,
// so it survives when LandingPage unmounts on navigation.
watch(resolvedTheme, (newTheme) => {
  applyTheme(newTheme);
});

watch(theme, (newTheme) => {
  if (newTheme === "system") {
    localStorage.removeItem(STORAGE_KEY);
  } else {
    localStorage.setItem(STORAGE_KEY, newTheme);
  }
});

export function useTheme() {
  // Defer browser-only initialization to onMounted to avoid
  // SSR hydration mismatches (server has no localStorage/matchMedia)
  onMounted(() => {
    if (initialized) return;
    initialized = true;

    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    systemPrefersDark.value = mql.matches;

    const stored = localStorage.getItem(STORAGE_KEY) as Theme | null;
    if (stored === "light" || stored === "dark") {
      theme.value = stored;
    } else {
      theme.value = "system";
    }
    applyTheme(resolvedTheme.value);

    // Listener lives for page lifetime (singleton pattern — initialized guard
    // ensures only one listener exists). No cleanup needed.
    mql.addEventListener("change", (e) => {
      systemPrefersDark.value = e.matches;
    });
  });

  function toggleTheme() {
    const order: Theme[] = ["light", "dark", "system"];
    const idx = order.indexOf(theme.value);
    theme.value = order[(idx + 1) % order.length];
  }

  return { theme, resolvedTheme, toggleTheme };
}
