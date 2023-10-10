import { describe, it, expect, beforeEach } from "vite-plus/test";
import { mount } from "@vue/test-utils";
import { defineComponent } from "vue";
import { useHistory, type HistoryEntry } from "../composables/useHistory";

function withSetup<T>(composable: () => T): { result: T; wrapper: ReturnType<typeof mount> } {
  let result!: T;
  const wrapper = mount(
    defineComponent({
      setup() {
        result = composable();
        return {};
      },
      template: "<div />",
    }),
  );
  return { result, wrapper };
}

const STORAGE_KEY = "smv-history";

describe("useHistory", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns empty array when no history exists", () => {
    const { result } = withSetup(useHistory);
    expect(result.entries.value).toEqual([]);
  });

  it("adds an entry", () => {
    const { result } = withSetup(useHistory);
    result.addEntry({ label: "bundle.js", hash: "abc123", timestamp: 1000 });
    expect(result.entries.value).toHaveLength(1);
    expect(result.entries.value[0].label).toBe("bundle.js");
  });

  it("deduplicates by hash, moving existing to top", () => {
    const { result } = withSetup(useHistory);
    result.addEntry({ label: "first", hash: "aaa", timestamp: 1000 });
    result.addEntry({ label: "second", hash: "bbb", timestamp: 2000 });
    result.addEntry({ label: "first-updated", hash: "aaa", timestamp: 3000 });
    expect(result.entries.value).toHaveLength(2);
    expect(result.entries.value[0].label).toBe("first-updated");
    expect(result.entries.value[0].timestamp).toBe(3000);
  });

  it("caps at 5 entries", () => {
    const { result } = withSetup(useHistory);
    for (let i = 0; i < 7; i++) {
      result.addEntry({ label: `entry-${i}`, hash: `hash-${i}`, timestamp: i * 1000 });
    }
    expect(result.entries.value).toHaveLength(5);
    expect(result.entries.value[0].label).toBe("entry-6");
  });

  it("persists to localStorage", () => {
    const { result } = withSetup(useHistory);
    result.addEntry({ label: "test", hash: "xyz", timestamp: 1000 });
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(stored).toHaveLength(1);
    expect(stored[0].hash).toBe("xyz");
  });

  it("loads from localStorage on init", () => {
    const data: HistoryEntry[] = [{ label: "loaded", hash: "def", timestamp: 5000 }];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    const { result } = withSetup(useHistory);
    expect(result.entries.value).toHaveLength(1);
    expect(result.entries.value[0].label).toBe("loaded");
  });

  it("clears all entries", () => {
    const { result } = withSetup(useHistory);
    result.addEntry({ label: "test", hash: "xyz", timestamp: 1000 });
    result.clearHistory();
    expect(result.entries.value).toEqual([]);
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("handles corrupted localStorage gracefully", () => {
    localStorage.setItem(STORAGE_KEY, "not-json");
    const { result } = withSetup(useHistory);
    expect(result.entries.value).toEqual([]);
  });
});
