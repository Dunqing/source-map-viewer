<script setup lang="ts">
import { computed, ref, nextTick, onMounted, onUnmounted } from "vue";
import { useVirtualScroll } from "../composables/useVirtualScroll";
import { useHighlighter } from "../composables/useHighlighter";
import { useSourceMapStore } from "../stores/sourceMap";
import {
  SEGMENT_COLOR_COUNT,
  LINE_HEIGHT,
  LINE_NUMBER_WIDTH,
  FALLBACK_CHAR_WIDTH,
} from "../constants";
import { useTheme } from "../composables/useTheme";
import type { MappingSegment } from "../core/types";
import type { ThemedToken } from "shiki/core";

const props = defineProps<{
  code: string;
  filename: string;
  side: "original" | "generated";
  searchQuery?: string;
}>();

const emit = defineEmits<{
  segmentClick: [segment: MappingSegment];
}>();

const store = useSourceMapStore();
const { resolvedTheme } = useTheme();
const { tokenizeLines, detectLanguage, loading: highlighterLoading } = useHighlighter();

const containerRef = ref<HTMLElement | null>(null);
const containerHeight = ref(400);

const lines = computed(() => props.code.split("\n"));
const totalLines = computed(() => lines.value.length);

const {
  startLine,
  endLine,
  offsetY,
  totalHeight,
  onScroll: onVirtualScroll,
} = useVirtualScroll(totalLines, containerHeight);

const allTokens = computed<ThemedToken[][]>(() => {
  if (!props.code) return [];
  void resolvedTheme.value; // explicit dependency — re-tokenize on theme change
  const lang = detectLanguage(props.filename);
  return tokenizeLines(props.code, lang);
});

const lineSegmentsMap = computed(() => {
  const map = new Map<number, MappingSegment[]>();

  if (props.side === "generated") {
    for (const seg of store.mappingIndex) {
      if (!map.has(seg.generatedLine)) {
        map.set(seg.generatedLine, []);
      }
      map.get(seg.generatedLine)!.push(seg);
    }
  } else {
    const sourceSegs = store.inverseMappingIndex.get(store.activeSourceIndex);
    if (sourceSegs) {
      for (const seg of sourceSegs) {
        if (!map.has(seg.originalLine)) {
          map.set(seg.originalLine, []);
        }
        map.get(seg.originalLine)!.push(seg);
      }
    }
  }

  return map;
});

function getSegmentColorIndex(segment: MappingSegment): number {
  return (segment.generatedLine * 7 + segment.generatedColumn) % SEGMENT_COLOR_COUNT;
}

function isSegmentHovered(segment: MappingSegment): boolean {
  return segment === store.hoveredSegment;
}

interface RenderSpan {
  text: string;
  textColor: string | undefined;
  colorIndex: number | null;
  segment: MappingSegment | null;
  isBad: boolean;
}

const searchMatchLines = computed(() => {
  const set = new Set<number>();
  const q = props.searchQuery;
  if (!q) return set;
  const lower = q.toLowerCase();
  lines.value.forEach((line, idx) => {
    if (line.toLowerCase().includes(lower)) {
      set.add(idx);
    }
  });
  return set;
});

const visibleLineSpans = computed<RenderSpan[][]>(() => {
  const result: RenderSpan[][] = [];

  for (let lineIdx = startLine.value; lineIdx < endLine.value; lineIdx++) {
    const lineText = lines.value[lineIdx];
    if (!lineText) {
      result.push([]);
      continue;
    }

    const shikiTokens = allTokens.value[lineIdx] ?? [];
    const mappingsOnLine = lineSegmentsMap.value.get(lineIdx);

    if (!mappingsOnLine || mappingsOnLine.length === 0) {
      if (shikiTokens.length > 0) {
        result.push(
          shikiTokens.map((t) => ({
            text: t.content,
            textColor: t.color,
            colorIndex: null,
            segment: null,
            isBad: false,
          })),
        );
      } else {
        result.push([
          { text: lineText, textColor: undefined, colorIndex: null, segment: null, isBad: false },
        ]);
      }
      continue;
    }

    // Build per-character mapping assignment
    const charMapping: (MappingSegment | null)[] = Array.from<MappingSegment | null>(
      { length: lineText.length },
      () => null,
    );
    for (let i = 0; i < mappingsOnLine.length; i++) {
      const seg = mappingsOnLine[i];
      const startCol = props.side === "generated" ? seg.generatedColumn : seg.originalColumn;
      const endCol =
        i + 1 < mappingsOnLine.length
          ? props.side === "generated"
            ? mappingsOnLine[i + 1].generatedColumn
            : mappingsOnLine[i + 1].originalColumn
          : lineText.length;

      for (let c = startCol; c < endCol && c < lineText.length; c++) {
        charMapping[c] = seg;
      }
    }

    // Merge Shiki tokens with mapping boundaries
    const spans: RenderSpan[] = [];
    let col = 0;

    if (shikiTokens.length > 0) {
      for (const token of shikiTokens) {
        const tokenEnd = col + token.content.length;
        let pos = col;
        while (pos < tokenEnd) {
          const currentSeg = charMapping[pos];
          let segEnd = pos + 1;
          while (segEnd < tokenEnd && charMapping[segEnd] === currentSeg) {
            segEnd++;
          }
          spans.push({
            text: lineText.slice(pos, segEnd),
            textColor: token.color,
            colorIndex: currentSeg ? getSegmentColorIndex(currentSeg) : null,
            segment: currentSeg,
            isBad: currentSeg ? store.badSegmentSet.has(currentSeg) : false,
          });
          pos = segEnd;
        }
        col = tokenEnd;
      }
    } else {
      // Fallback: no Shiki tokens
      let pos = 0;
      while (pos < lineText.length) {
        const currentSeg = charMapping[pos];
        let segEnd = pos + 1;
        while (segEnd < lineText.length && charMapping[segEnd] === currentSeg) {
          segEnd++;
        }
        spans.push({
          text: lineText.slice(pos, segEnd),
          textColor: undefined,
          colorIndex: currentSeg ? getSegmentColorIndex(currentSeg) : null,
          segment: currentSeg,
          isBad: currentSeg ? store.badSegmentSet.has(currentSeg) : false,
        });
        pos = segEnd;
      }
    }

    result.push(spans);
  }

  return result;
});

function getLineSpans(visibleIdx: number): RenderSpan[] {
  return visibleLineSpans.value[visibleIdx] ?? [];
}

function getSpanBgColor(span: RenderSpan): string | undefined {
  if (!span.segment) return undefined;
  if (isSegmentHovered(span.segment)) {
    return "var(--seg-hover)";
  }
  if (span.colorIndex === null) return undefined;
  return `var(--seg-${span.colorIndex})`;
}

function handleSegmentHover(segment: MappingSegment | null) {
  store.setHoveredSegment(segment);
}

function handleMouseLeave() {
  store.setHoveredSegment(null);
}

function handleClick() {
  // Stop any ongoing smooth scroll on this panel
  if (containerRef.value) {
    containerRef.value.scrollTo({ top: containerRef.value.scrollTop });
  }
  if (store.hoveredSegment) {
    emit("segmentClick", store.hoveredSegment);
  }
}

function isLineVisible(line: number): boolean {
  if (!containerRef.value) return false;
  const scrollY = containerRef.value.scrollTop;
  const y = line * LINE_HEIGHT - scrollY;
  return y >= 0 && y < containerHeight.value - LINE_HEIGHT;
}

function doScrollToLine(line: number) {
  if (containerRef.value) {
    const targetScrollTop = Math.max(
      0,
      (line - Math.floor(containerHeight.value / LINE_HEIGHT / 2)) * LINE_HEIGHT,
    );
    containerRef.value.scrollTo({ top: targetScrollTop, behavior: "smooth" });
  }
}

function scrollToLineIfNeeded(line: number) {
  if (!isLineVisible(line)) {
    doScrollToLine(line);
  }
}

let resizeObserver: ResizeObserver | null = null;

onMounted(() => {
  if (containerRef.value) {
    resizeObserver = new ResizeObserver((entries) => {
      containerHeight.value = entries[0].contentRect.height;
      cachedCharWidth = 0; // re-measure on zoom/resize
    });
    resizeObserver.observe(containerRef.value);
  }
});

onUnmounted(() => {
  resizeObserver?.disconnect();
});

function getViewportPosition(
  line: number,
  column: number,
): { x: number; y: number; top: number; height: number } | null {
  if (!containerRef.value) return null;

  const lineEl = containerRef.value.querySelector(`[data-line="${line}"]`) as HTMLElement | null;
  if (!lineEl) return null;

  const lineRect = lineEl.getBoundingClientRect();
  const charWidth = getCharWidth();
  const x = LINE_NUMBER_WIDTH + column * charWidth;

  return {
    x: lineRect.left + x,
    y: lineRect.bottom,
    top: lineRect.top,
    height: lineRect.height,
  };
}

let cachedCharWidth = 0;
function getCharWidth(): number {
  if (cachedCharWidth > 0) return cachedCharWidth;
  if (!containerRef.value) return FALLBACK_CHAR_WIDTH;
  const span = document.createElement("span");
  span.style.font = getComputedStyle(containerRef.value).font;
  span.style.visibility = "hidden";
  span.style.position = "absolute";
  span.textContent = "X";
  document.body.appendChild(span);
  cachedCharWidth = span.getBoundingClientRect().width;
  document.body.removeChild(span);
  return cachedCharWidth || FALLBACK_CHAR_WIDTH;
}

defineExpose({
  scrollToLine: doScrollToLine,
  scrollToLineIfNeeded,
  getViewportPosition,
  getCharWidth,
  containerRef,
});
</script>

<template>
  <div
    ref="containerRef"
    class="h-full overflow-auto font-mono text-sm bg-panel text-fg"
    @scroll="onVirtualScroll"
    @mouseleave="handleMouseLeave"
    @click="handleClick"
  >
    <div :style="{ height: `${totalHeight}px`, position: 'relative' }">
      <div :style="{ transform: `translateY(${offsetY}px)` }">
        <div
          v-for="(_line, i) in endLine - startLine"
          :key="startLine + i"
          :data-line="startLine + i"
          class="flex items-center"
          :style="{ height: `${LINE_HEIGHT}px`, lineHeight: `${LINE_HEIGHT}px` }"
          :class="[searchMatchLines.has(startLine + i) ? 'search-match-line' : '']"
        >
          <!-- Line number -->
          <span
            class="inline-block w-12 text-right pr-3 text-fg-muted select-none shrink-0 text-xs"
          >
            {{ startLine + i + 1 }}
          </span>
          <!-- Code with syntax highlighting + mapping segment colors -->
          <span class="flex-1 whitespace-pre">
            <span
              v-for="(span, j) in getLineSpans(i)"
              :key="j"
              :style="{
                color: span.textColor,
                backgroundColor: getSpanBgColor(span),
              }"
              :class="{
                'cursor-pointer rounded-sm': span.segment !== null,
                'unmapped-original':
                  !highlighterLoading && span.segment === null && side === 'original',
                'unmapped-generated':
                  !highlighterLoading && span.segment === null && side === 'generated',
                'bad-mapping': span.isBad,
              }"
              @mouseenter="handleSegmentHover(span.segment)"
              >{{ span.text }}</span
            >
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.unmapped-original {
  opacity: 0.35;
  transition: opacity 0.3s ease-in;
}

html.dark .unmapped-original {
  opacity: 0.4;
}

.unmapped-generated {
  opacity: 0.7;
  transition: opacity 0.3s ease-in;
}

.bad-mapping {
  background-image: repeating-linear-gradient(
    -45deg,
    transparent,
    transparent 2px,
    rgba(255, 0, 0, 0.15) 2px,
    rgba(255, 0, 0, 0.15) 4px
  ) !important;
}

.search-match-line {
  border-left: 3px solid #f59e0b;
  background-color: rgba(245, 158, 11, 0.08);
}

html.dark .search-match-line {
  background-color: rgba(245, 158, 11, 0.15);
}
</style>
