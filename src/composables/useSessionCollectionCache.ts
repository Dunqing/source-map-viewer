import type { ResolvedFileCollection } from "../core/inputResolver";

const STORAGE_PREFIX = "smv-session-collection:";

function normalizeSlug(slug: string): string {
  return slug.split("?")[0];
}

function storageKey(slug: string): string {
  return `${STORAGE_PREFIX}${normalizeSlug(slug)}`;
}

function isResolvedFileCollection(value: unknown): value is ResolvedFileCollection {
  if (typeof value !== "object" || value == null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.generatedCode === "string" &&
    typeof record.sourceMapJson === "string" &&
    typeof record.label === "string" &&
    typeof record.entryPath === "string"
  );
}

export function cacheSessionCollection(slug: string, entries: ResolvedFileCollection[]): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(storageKey(slug), JSON.stringify(entries));
  } catch {
    /* best effort */
  }
}

export function getCachedSessionCollection(slug: string): ResolvedFileCollection[] | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(storageKey(slug));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || !parsed.every(isResolvedFileCollection)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}
