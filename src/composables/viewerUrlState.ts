import type { PositionQuery } from "../core/positionLookup";

export interface ViewerUrlState {
  activeGeneratedEntryIndex: number;
  activeSourceIndex: number;
  selectedSegmentIndex: number | null;
  showMappings: boolean;
  showStats: boolean;
  position: PositionQuery | null;
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

function parsePosition(value: string | null): PositionQuery | null {
  if (!value) return null;
  const parts = value.split(":");
  const side = parts.shift();
  if (side !== "generated" && side !== "original") return null;
  if (parts.length !== (side === "original" ? 3 : 2)) return null;
  if (parts.some((part) => !/^\d+$/.test(part) || !Number.isSafeInteger(Number(part)))) return null;
  const sourceIndex = side === "original" ? Number(parts.shift()) : 0;
  const [line, column] = parts.map(Number);
  if (line < 1) return null;
  return { side, sourceIndex, line: line - 1, column };
}

export function readViewerUrlState(search: string): ViewerUrlState {
  const params = new URLSearchParams(search);
  const position = parsePosition(params.get("pos"));

  return {
    activeGeneratedEntryIndex: parsePositiveIndex(params.get("entry")),
    activeSourceIndex: parsePositiveIndex(params.get("tab")),
    selectedSegmentIndex: parseSegmentIndex(params.get("seg")),
    showMappings: params.has("seg") && !position,
    showStats: params.get("stats") === "1",
    position,
  };
}

export function buildViewerUrl(
  pathname: string,
  state: Omit<ViewerUrlState, "showMappings" | "position"> & { position?: PositionQuery | null },
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
  if (state.position) {
    const { side, sourceIndex, line, column } = state.position;
    params.set(
      "pos",
      side === "original"
        ? `${side}:${sourceIndex}:${line + 1}:${column}`
        : `${side}:${line + 1}:${column}`,
    );
  }
  const search = params.toString();
  return `${pathname}${search ? `?${search}` : ""}`;
}
