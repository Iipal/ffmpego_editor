import { createStore } from "@tanstack/store";
import { useSelector } from "@tanstack/react-store";
import {
  DEFAULT_VISUAL_FILTERS,
  type VisualFilters,
} from "@repo/ffmpeg-filters";

export type { VisualFilters };
export { DEFAULT_VISUAL_FILTERS };

function cloneDefaults(): VisualFilters {
  return structuredClone(DEFAULT_VISUAL_FILTERS);
}

export const filterStore = createStore<VisualFilters>(cloneDefaults());

export function useFilterStore() {
  return useSelector(filterStore);
}

export function setFilterState(
  updater: (previous: VisualFilters) => VisualFilters,
) {
  filterStore.setState(updater);
}

export function resetFilters() {
  filterStore.setState(() => cloneDefaults());
}
