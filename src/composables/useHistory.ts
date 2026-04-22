import { ref, onMounted } from "vue";

export interface HistoryEntry {
  label: string;
  slug: string;
  timestamp: number;
}

const STORAGE_KEY = "smv-history";
const MAX_ENTRIES = 5;

function normalizeEntry(value: unknown): HistoryEntry | null {
  if (typeof value !== "object" || value === null) return null;

  const record = value as Record<string, unknown>;
  const slug =
    typeof record.slug === "string"
      ? record.slug
      : typeof record.hash === "string"
        ? record.hash
        : null;

  if (typeof record.label !== "string" || slug === null || typeof record.timestamp !== "number") {
    return null;
  }

  return {
    label: record.label,
    slug,
    timestamp: record.timestamp,
  };
}

function loadFromStorage(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeEntry).filter((entry): entry is HistoryEntry => entry !== null);
  } catch {
    return [];
  }
}

function saveToStorage(entries: HistoryEntry[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

export function useHistory() {
  // Start empty + loading on both server and client so SSR hydration matches.
  // Populate from localStorage after mount.
  const entries = ref<HistoryEntry[]>([]);
  const loading = ref(true);

  onMounted(() => {
    entries.value = loadFromStorage();
    loading.value = false;
  });

  function addEntry(entry: HistoryEntry) {
    const filtered = entries.value.filter((e) => e.slug !== entry.slug);
    entries.value = [entry, ...filtered].slice(0, MAX_ENTRIES);
    saveToStorage(entries.value);
  }

  function clearHistory() {
    entries.value = [];
    localStorage.removeItem(STORAGE_KEY);
  }

  return { entries, loading, addEntry, clearHistory };
}
