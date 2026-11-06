import type { ResolvedFileCollection } from "../core/inputResolver";

const STORAGE_PREFIX = "smv-session-collection:";
const LOCAL_SESSION_PREFIX = "local-";

export interface CachedSession {
  entries: ResolvedFileCollection[];
  label: string;
}

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

function parseCachedSession(value: unknown): CachedSession | null {
  const record =
    typeof value === "object" && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  const entries = Array.isArray(value) ? value : record?.entries;
  if (!Array.isArray(entries) || !entries.every(isResolvedFileCollection)) return null;

  return {
    entries,
    // Arrays are the legacy cache format, which did not store a session label.
    label: typeof record?.label === "string" ? record.label : "",
  };
}

export function isLocalSessionSlug(slug: string): boolean {
  return normalizeSlug(slug).startsWith(LOCAL_SESSION_PREFIX);
}

export function createLocalSession(entries: ResolvedFileCollection[], label: string): string {
  const id =
    typeof globalThis.crypto?.randomUUID === "function"
      ? globalThis.crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  const slug = `${LOCAL_SESSION_PREFIX}${id}`;
  cacheSessionCollection(slug, entries, label);
  return slug;
}

export function cacheSessionCollection(
  slug: string,
  entries: ResolvedFileCollection[],
  label = "",
): void {
  try {
    if (typeof sessionStorage === "undefined") return;
    sessionStorage.setItem(storageKey(slug), JSON.stringify({ entries, label }));
  } catch {
    /* best effort */
  }
}

export function getCachedSession(slug: string): CachedSession | null {
  try {
    if (typeof sessionStorage === "undefined") return null;
    const raw = sessionStorage.getItem(storageKey(slug));
    if (!raw) return null;
    return parseCachedSession(JSON.parse(raw));
  } catch {
    return null;
  }
}
