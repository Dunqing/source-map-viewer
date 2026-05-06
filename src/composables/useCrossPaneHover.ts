import { inject, provide, ref, type InjectionKey, type Ref } from "vue";
import type { DiffEntry } from "../core/diff";

/**
 * The currently-hovered diff entry, shared across the two `CompareCodePane`
 * instances on the compare page. Pairing is by `DiffEntry` identity rather
 * than by source position — the bipartite matcher already established
 * which `entry.a` segment pairs with which `entry.b` segment, including
 * across renamed sources where source names differ. Source-position
 * lookups would miss those rename cases entirely.
 */
const KEY: InjectionKey<Ref<DiffEntry | null>> = Symbol("crossPaneHover");

export function provideCrossPaneHover(): Ref<DiffEntry | null> {
  const hover = ref<DiffEntry | null>(null);
  provide(KEY, hover);
  return hover;
}

/**
 * Returns null when not under a `provideCrossPaneHover` ancestor — that's
 * the main viewer's case, where cross-pane sync is irrelevant.
 */
export function useCrossPaneHover(): Ref<DiffEntry | null> | null {
  return inject(KEY, null);
}
