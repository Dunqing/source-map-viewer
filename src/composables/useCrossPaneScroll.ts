import { inject, provide, ref, type InjectionKey, type Ref } from "vue";

/**
 * Shared scroll position across the two `CompareCodePane` instances on the
 * compare page. The unit is **top line index** rather than pixel scrollTop
 * — each pane parses its own copy of the sourcemap with its own line
 * count, but `LINE_HEIGHT` is constant in `CodePanel.vue`, so syncing by
 * line is unambiguous and avoids drift if line heights ever diverge.
 *
 * The `side` tag distinguishes which pane originated the write so the
 * receiver can no-op when echoing back its own value (preventing the
 * feedback loop both panes starting at line 0 would otherwise cause).
 */
export interface CrossPaneScrollState {
  side: "a" | "b";
  topLine: number;
}

const KEY: InjectionKey<Ref<CrossPaneScrollState | null>> = Symbol("crossPaneScroll");

export function provideCrossPaneScroll(): Ref<CrossPaneScrollState | null> {
  const scroll = ref<CrossPaneScrollState | null>(null);
  provide(KEY, scroll);
  return scroll;
}

/**
 * Returns null when not under a `provideCrossPaneScroll` ancestor — the
 * main viewer's case, where there's only one pane to scroll.
 */
export function useCrossPaneScroll(): Ref<CrossPaneScrollState | null> | null {
  return inject(KEY, null);
}
