import { defineSlice } from "./slice";
import {
  DEFAULT_VISUAL_FILTERS,
  type VisualFilters,
} from "@repo/ffmpeg-filters";

export type { VisualFilters };
export { DEFAULT_VISUAL_FILTERS };

function cloneDefaults(): VisualFilters {
  return structuredClone(DEFAULT_VISUAL_FILTERS);
}

export const {
  store: filterStore,
  useStore: useFilterStore,
  setState: setFilterState,
} = defineSlice<VisualFilters>(cloneDefaults());

export function resetFilters() {
  filterStore.setState(() => cloneDefaults());
}
