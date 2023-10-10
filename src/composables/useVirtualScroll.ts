import { computed, ref, type Ref } from "vue";
import { LINE_HEIGHT, VIRTUAL_SCROLL_BUFFER } from "../constants";

export function useVirtualScroll(totalLines: Ref<number>, containerHeight: Ref<number>) {
  const scrollTop = ref(0);

  const visibleLineCount = computed(() => Math.ceil(containerHeight.value / LINE_HEIGHT) + 1);

  const startLine = computed(() =>
    Math.max(0, Math.floor(scrollTop.value / LINE_HEIGHT) - VIRTUAL_SCROLL_BUFFER),
  );

  const endLine = computed(() =>
    Math.min(
      totalLines.value,
      startLine.value + visibleLineCount.value + VIRTUAL_SCROLL_BUFFER * 2,
    ),
  );

  const offsetY = computed(() => startLine.value * LINE_HEIGHT);
  const totalHeight = computed(() => totalLines.value * LINE_HEIGHT);

  function onScroll(event: Event) {
    const target = event.target as HTMLElement;
    scrollTop.value = target.scrollTop;
  }

  function scrollToLine(line: number) {
    scrollTop.value = Math.max(0, (line - Math.floor(visibleLineCount.value / 2)) * LINE_HEIGHT);
  }

  return { scrollTop, startLine, endLine, offsetY, totalHeight, onScroll, scrollToLine };
}
