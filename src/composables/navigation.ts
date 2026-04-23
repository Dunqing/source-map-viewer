export const NAVIGATION_EVENT = "smv-navigate";

export function getPathSlug(pathname = window.location.pathname): string {
  const pathMatch = pathname.match(/^\/(.+)$/);
  return pathMatch ? pathMatch[1] : "";
}

export function navigateToPath(path: string): void {
  window.history.pushState(null, "", path);
  window.dispatchEvent(new CustomEvent(NAVIGATION_EVENT));
}

export function replaceCurrentPath(path: string): void {
  window.history.replaceState(null, "", path);
}

export function extractShareSlug(input: string): string {
  const trimmed = input.trim();
  try {
    return new URL(trimmed).pathname.slice(1);
  } catch {
    return trimmed;
  }
}

export function buildComparePath(slugA: string, slugB?: string): string {
  const params = new URLSearchParams();
  if (slugA) params.set("a", slugA);
  if (slugB) params.set("b", slugB);
  const search = params.toString();
  return `/compare${search ? `?${search}` : ""}`;
}
