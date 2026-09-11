import { createStore } from "@tanstack/store";
import { useSelector } from "@tanstack/react-store";

/**
 * Collapse the per-slice boilerplate triplet
 * (`createStore` + `useXStore` + `setXState`) into one line per slice:
 *
 *   export const { store: cropStore, useStore: useCropStore, setState: setCropState } =
 *     defineSlice(initialCropSlice);
 *
 * Sync UI state only — never move async/Query work in here (Store-vs-Query split).
 */
export function defineSlice<T>(initial: T) {
  const store = createStore<T>(initial);
  const useStore = () => useSelector(store);
  const setState = (updater: (previous: T) => T) => store.setState(updater);
  return { store, useStore, setState };
}
