export interface ViewerUrlState {
  activeGeneratedEntryIndex: number;
  activeSourceIndex: number;
  selectedSegmentIndex: number | null;
  showMappings: boolean;
  showStats: boolean;
}

function parsePositiveIndex(value: string | null): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
}

function parseSegmentIndex(value: string | null): number | null {
  if (value == null) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

export function readViewerUrlState(search: string): ViewerUrlState {
  const params = new URLSearchParams(search);

  return {
    activeGeneratedEntryIndex: parsePositiveIndex(params.get("entry")),
    activeSourceIndex: parsePositiveIndex(params.get("tab")),
    selectedSegmentIndex: parseSegmentIndex(params.get("seg")),
    showMappings: params.has("seg"),
    showStats: params.get("stats") === "1",
  };
}

export function buildViewerUrl(
  pathname: string,
  state: Omit<ViewerUrlState, "showMappings">,
): string {
  const params = new URLSearchParams();
  if (state.activeGeneratedEntryIndex > 0) {
    params.set("entry", String(state.activeGeneratedEntryIndex));
  }
  if (state.activeSourceIndex > 0) {
    params.set("tab", String(state.activeSourceIndex));
  }
  if (state.showStats) {
    params.set("stats", "1");
  }
  if (state.selectedSegmentIndex != null) {
    params.set("seg", String(state.selectedSegmentIndex));
  }
  const search = params.toString();
  return `${pathname}${search ? `?${search}` : ""}`;
}
