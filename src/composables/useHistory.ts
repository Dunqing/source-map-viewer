import { ref, onMounted } from "vue";

export interface HistoryEntry {
  label: string;
  hash: string;
  timestamp: number;
}

const STORAGE_KEY = "smv-history";
const MAX_ENTRIES = 5;

function loadFromStorage(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
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
    const filtered = entries.value.filter((e) => e.hash !== entry.hash);
    entries.value = [entry, ...filtered].slice(0, MAX_ENTRIES);
    saveToStorage(entries.value);
  }

  function clearHistory() {
    entries.value = [];
    localStorage.removeItem(STORAGE_KEY);
  }

  return { entries, loading, addEntry, clearHistory };
}
