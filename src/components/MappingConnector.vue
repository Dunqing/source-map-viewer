<script setup lang="ts">
import { ref, watch, onUnmounted } from "vue";
import { useSourceMapStore } from "../stores/sourceMap";
import { clampOriginalPosition } from "../core/mapper";
import type { MappingSegment } from "../core/types";

type Panel = {
  getViewportPosition: (
    line: number,
    col: number,
  ) => { x: number; y: number; top: number; height: number } | null;
  getCharWidth: () => number;
} | null;

const props = defineProps<{
  originalPanel: Panel;
  generatedPanel: Panel;
}>();

const store = useSourceMapStore();

const curveColor = "var(--connector-curve)";

const endColCache = new WeakMap<MappingSegment, { orig: number; gen: number }>();

function getSegmentEndColumns(seg: MappingSegment): { orig: number; gen: number } {
  const cached = endColCache.get(seg);
  if (cached) return cached;

  function findNext(side: "original" | "generated"): number {
    const col = side === "generated" ? seg.generatedColumn : seg.originalColumn;
    const line = side === "generated" ? seg.generatedLine : seg.originalLine;
    const segments =
      side === "generated"
        ? store.mappingIndex
        : (store.inverseMappingIndex.get(seg.sourceIndex) ?? []);

    // Binary search for segment at (line, col)
    let lo = 0,
      hi = segments.length - 1;
    let idx = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >>> 1;
      const mLine = side === "generated" ? segments[mid].generatedLine : segments[mid].originalLine;
      const mCol =
        side === "generated" ? segments[mid].generatedColumn : segments[mid].originalColumn;
      if (mLine < line || (mLine === line && mCol < col)) lo = mid + 1;
      else if (mLine > line || (mLine === line && mCol > col)) hi = mid - 1;
      else {
        idx = mid;
        break;
      }
    }

    if (idx >= 0 && idx + 1 < segments.length) {
      const next = segments[idx + 1];
      const nextLine = side === "generated" ? next.generatedLine : next.originalLine;
      const nextCol = side === "generated" ? next.generatedColumn : next.originalColumn;
      if (nextLine === line) return nextCol;
    }

    // Fallback: end of line
    const code =
      side === "generated"
        ? store.generatedCode
        : store.parsedData?.sourcesContent[seg.sourceIndex];
    if (code) {
      const lines = code.split("\n");
      return lines[line]?.length ?? col + 1;
    }
    return col + 1;
  }

  const result = { orig: findNext("original"), gen: findNext("generated") };
  endColCache.set(seg, result);
  return result;
}

interface ConnectorData {
  origBox: { x: number; y: number; w: number; h: number };
  genBox: { x: number; y: number; w: number; h: number };
}

const connector = ref<ConnectorData | null>(null);
const curvePath = ref("");
const isClamped = ref(false);
let rafId = 0;
let prevConnector: ConnectorData | null = null;

/**
 * Compute the visual column of the first non-whitespace character,
 * accounting for tabs (rendered at 8-space tab stops in `whitespace: pre`).
 * Returns the original column if it's already past the indentation.
 */
function visualColSkippingIndent(code: string | undefined, line: number, col: number): number {
  if (!code) return col;
  const lineText = code.split("\n")[line];
  if (!lineText) return col;
  const firstCode = lineText.search(/\S/);
  if (firstCode < 0) return col; // all-whitespace line

  // Calculate visual width of the indentation
  let visualIndent = 0;
  for (let i = 0; i < firstCode; i++) {
    if (lineText[i] === "\t") {
      // Tab stop at multiples of 8 (CSS default tab-size)
      visualIndent = Math.ceil((visualIndent + 1) / 8) * 8;
    } else {
      visualIndent++;
    }
  }

  // Also calculate visual column for the requested col
  let visualCol = 0;
  for (let i = 0; i < Math.min(col, lineText.length); i++) {
    if (lineText[i] === "\t") {
      visualCol = Math.ceil((visualCol + 1) / 8) * 8;
    } else {
      visualCol++;
    }
  }

  return Math.max(visualCol, visualIndent);
}

function calcConnector(seg: MappingSegment): ConnectorData | null {
  if (!props.originalPanel || !props.generatedPanel) return null;

  // Use clamped positions for the original side to avoid pointing into empty space
  const sourceContent = store.parsedData?.sourcesContent[seg.sourceIndex];
  const sourceLines = sourceContent ? sourceContent.split("\n") : [];
  const clamped = clampOriginalPosition(seg.originalLine, seg.originalColumn, sourceLines);

  // Skip leading whitespace so connector starts at actual code, not tabs/spaces
  const origVisualCol = visualColSkippingIndent(sourceContent, clamped.line, clamped.column);
  const genVisualCol = visualColSkippingIndent(
    store.generatedCode,
    seg.generatedLine,
    seg.generatedColumn,
  );

  const origPos = props.originalPanel.getViewportPosition(clamped.line, origVisualCol);
  const genPos = props.generatedPanel.getViewportPosition(seg.generatedLine, genVisualCol);
  if (!origPos || !genPos) return null;

  const origCharW = props.originalPanel.getCharWidth();
  const genCharW = props.generatedPanel.getCharWidth();
  const endCols = getSegmentEndColumns(seg);

  // Convert end columns to visual columns for correct width
  const origEndCol = Math.min(endCols.orig, sourceLines[clamped.line]?.length ?? endCols.orig);
  const origEndVisual = visualColSkippingIndent(sourceContent, clamped.line, origEndCol);
  const genEndVisual = visualColSkippingIndent(store.generatedCode, seg.generatedLine, endCols.gen);
  const origWidth = Math.max(origCharW, (origEndVisual - origVisualCol) * origCharW);
  const genWidth = Math.max(genCharW, (genEndVisual - genVisualCol) * genCharW);

  return {
    origBox: { x: origPos.x, y: origPos.top, w: origWidth, h: origPos.height },
    genBox: { x: genPos.x, y: genPos.top, w: genWidth, h: genPos.height },
  };
}

function wobbly(x1: number, y1: number, x2: number, y2: number, amp: number): string {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 1) return `L ${x2} ${y2}`;
  const nx = -dy / len;
  const ny = dx / len;
  return `C ${x1 + dx * 0.3 + nx * amp} ${y1 + dy * 0.3 + ny * amp}, ${x1 + dx * 0.7 - nx * amp * 0.6} ${y1 + dy * 0.7 - ny * amp * 0.6}, ${x2} ${y2}`;
}

function sketchRect(
  bx: number,
  by: number,
  bw: number,
  bh: number,
  side: "right" | "left",
): string {
  const bottom = by + bh;

  const tlx = bx - 1,
    tly = by - 0.5;
  const trx = bx + bw + 0.8,
    try_ = by - 0.8;
  const brx = bx + bw + 0.5,
    bry = bottom + 0.8;
  const blx = bx - 0.5,
    bly = bottom + 0.5;

  if (side === "right") {
    const cx = bx + bw,
      cy = by + bh / 2;
    return `${wobbly(cx, cy, trx, try_, 1.5)} ${wobbly(trx, try_, tlx, tly, -1.2)} ${wobbly(tlx, tly, blx, bly, 1.3)} ${wobbly(blx, bly, brx, bry, -1.4)} ${wobbly(brx, bry, cx, cy + 1, 1.2)}`;
  }

  const cx = bx,
    cy = by + bh / 2;
  return `${wobbly(cx, cy, tlx, tly, -1.5)} ${wobbly(tlx, tly, trx, try_, 1.2)} ${wobbly(trx, try_, brx, bry, -1.3)} ${wobbly(brx, bry, blx, bly, 1.4)} ${wobbly(blx, bly, cx, cy + 1, -1.2)}`;
}

function calcCurvePath(c: ConnectorData): string {
  const { origBox: ob, genBox: gb } = c;

  const ocx = ob.x + ob.w;
  const ocy = ob.y + ob.h / 2;
  const gcx = gb.x;
  const gcy = gb.y + gb.h / 2;

  const dipY = Math.max(ob.y + ob.h, gb.y + gb.h) + 20;
  const cx1 = ocx + (gcx - ocx) * 0.3;
  const cx2 = ocx + (gcx - ocx) * 0.7;

  return [
    `M ${ocx} ${ocy}`,
    sketchRect(ob.x, ob.y, ob.w, ob.h, "right"),
    `C ${cx1} ${dipY}, ${cx2} ${dipY}, ${gcx} ${gcy}`,
    sketchRect(gb.x, gb.y, gb.w, gb.h, "left"),
  ].join(" ");
}

function updateLoop() {
  const seg = store.hoveredSegment;
  if (!seg) {
    connector.value = null;
    curvePath.value = "";
    isClamped.value = false;
    return;
  }
  isClamped.value = store.clampedSegmentSet.has(seg);
  const c = calcConnector(seg);
  if (c) {
    const prev = prevConnector;
    if (
      !prev ||
      c.origBox.x !== prev.origBox.x ||
      c.origBox.y !== prev.origBox.y ||
      c.origBox.w !== prev.origBox.w ||
      c.origBox.h !== prev.origBox.h ||
      c.genBox.x !== prev.genBox.x ||
      c.genBox.y !== prev.genBox.y ||
      c.genBox.w !== prev.genBox.w ||
      c.genBox.h !== prev.genBox.h
    ) {
      prevConnector = c;
      connector.value = c;
      curvePath.value = calcCurvePath(c);
    }
  } else {
    prevConnector = null;
    connector.value = null;
    curvePath.value = "";
  }
  rafId = requestAnimationFrame(updateLoop);
}

// Start/stop the rAF loop when hover state changes
watch(
  () => store.hoveredSegment,
  (seg) => {
    cancelAnimationFrame(rafId);
    if (seg) {
      updateLoop();
    } else {
      connector.value = null;
      curvePath.value = "";
      isClamped.value = false;
    }
  },
);

onUnmounted(() => cancelAnimationFrame(rafId));
</script>

<template>
  <Teleport to="body">
    <svg
      style="
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        pointer-events: none;
        z-index: 9999;
      "
      :style="{ opacity: connector ? 1 : 0, transition: 'opacity 0.1s' }"
    >
      <path
        v-if="connector"
        :d="curvePath"
        fill="none"
        :stroke="isClamped ? 'var(--connector-clamped, #ef4444)' : curveColor"
        :stroke-width="isClamped ? 1 : 1.5"
        stroke-linecap="round"
        stroke-linejoin="round"
        :stroke-dasharray="isClamped ? '4 3' : 'none'"
      />
    </svg>
  </Teleport>
</template>
