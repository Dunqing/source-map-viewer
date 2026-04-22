<script setup lang="ts">
import { ref, watch, onUnmounted } from "vue";
import { useSourceMapStore } from "../stores/sourceMap";
import {
  clampOriginalPosition,
  getRenderedColumnRange,
  type RenderedColumnRange,
} from "../core/mapper";
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

interface SegmentDisplayColumns {
  orig: RenderedColumnRange;
  gen: RenderedColumnRange;
}

const displayColCache = new WeakMap<MappingSegment, SegmentDisplayColumns>();

function getDisplayRange(
  columns: number[],
  index: number,
  lineText: string,
  fallbackColumn: number,
): RenderedColumnRange {
  return getRenderedColumnRange(
    index >= 0 ? columns : [fallbackColumn],
    Math.max(index, 0),
    lineText,
    {
      skipIndent: true,
    },
  );
}

function getSegmentDisplayColumns(
  seg: MappingSegment,
  sourceLines: string[],
  genLines: string[],
): SegmentDisplayColumns {
  const cached = displayColCache.get(seg);
  if (cached) return cached;

  const clamped = clampOriginalPosition(seg.originalLine, seg.originalColumn, sourceLines);
  const origLineText = sourceLines[clamped.line] ?? "";
  const genLineText = genLines[seg.generatedLine] ?? "";

  const originalColumns: number[] = [];
  let originalIndex = -1;
  for (const candidate of store.inverseMappingIndex.get(seg.sourceIndex) ?? []) {
    const candidateClamped = clampOriginalPosition(
      candidate.originalLine,
      candidate.originalColumn,
      sourceLines,
    );
    if (candidateClamped.line !== clamped.line) continue;
    if (candidate === seg) {
      originalIndex = originalColumns.length;
    }
    originalColumns.push(candidateClamped.column);
  }

  const generatedColumns: number[] = [];
  let generatedIndex = -1;
  for (const candidate of store.mappingIndex) {
    if (candidate.generatedLine > seg.generatedLine) break;
    if (candidate.generatedLine !== seg.generatedLine) continue;
    if (candidate === seg) {
      generatedIndex = generatedColumns.length;
    }
    generatedColumns.push(candidate.generatedColumn);
  }

  const result = {
    orig: getDisplayRange(originalColumns, originalIndex, origLineText, clamped.column),
    gen: getDisplayRange(generatedColumns, generatedIndex, genLineText, seg.generatedColumn),
  };

  displayColCache.set(seg, result);
  return result;
}

interface ConnectorData {
  origBox: { x: number; y: number; w: number; h: number };
  genBox: { x: number; y: number; w: number; h: number };
}

const connector = ref<ConnectorData | null>(null);
const curvePath = ref("");
const isClamped = ref(false);
const isSplitToken = ref(false);
let rafId = 0;
let prevConnector: ConnectorData | null = null;

// Cached line splits — avoids re-splitting at 60fps in the rAF loop
let cachedGenCode: string | undefined;
let cachedGenLines: string[] = [];
function getGenLines(): string[] {
  const code = store.generatedCode;
  if (code !== cachedGenCode) {
    cachedGenCode = code;
    cachedGenLines = code ? code.split("\n") : [];
  }
  return cachedGenLines;
}

function calcConnector(seg: MappingSegment): ConnectorData | null {
  if (!props.originalPanel || !props.generatedPanel) return null;

  const sourceContent = store.parsedData?.sourcesContent[seg.sourceIndex];
  const sourceLines = sourceContent ? sourceContent.split("\n") : [];
  const genLines = getGenLines();
  const clamped = clampOriginalPosition(seg.originalLine, seg.originalColumn, sourceLines);
  const displayCols = getSegmentDisplayColumns(seg, sourceLines, genLines);

  const origPos = props.originalPanel.getViewportPosition(clamped.line, displayCols.orig.start);
  const genPos = props.generatedPanel.getViewportPosition(seg.generatedLine, displayCols.gen.start);
  if (!origPos || !genPos) return null;

  const origCharW = props.originalPanel.getCharWidth();
  const genCharW = props.generatedPanel.getCharWidth();

  const origEndPos = props.originalPanel.getViewportPosition(clamped.line, displayCols.orig.end);
  const genEndPos = props.generatedPanel.getViewportPosition(
    seg.generatedLine,
    displayCols.gen.end,
  );
  const origWidth = Math.max(origCharW, origEndPos ? origEndPos.x - origPos.x : origCharW);
  const genWidth = Math.max(genCharW, genEndPos ? genEndPos.x - genPos.x : genCharW);

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
    isSplitToken.value = false;
    return;
  }
  isClamped.value = store.clampedSegmentSet.has(seg);
  isSplitToken.value = store.splitTokenSegmentSet.has(seg);
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
      prevConnector = null;
      connector.value = null;
      curvePath.value = "";
      isClamped.value = false;
      isSplitToken.value = false;
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
        :stroke="
          isClamped
            ? 'var(--connector-clamped, #ef4444)'
            : isSplitToken
              ? 'var(--connector-suspicious, #f59e0b)'
              : curveColor
        "
        :stroke-width="isClamped ? 1 : 1.5"
        stroke-linecap="round"
        stroke-linejoin="round"
        :stroke-dasharray="isClamped || isSplitToken ? '4 3' : 'none'"
        style="transition: d 150ms ease-out"
      />
    </svg>
  </Teleport>
</template>
