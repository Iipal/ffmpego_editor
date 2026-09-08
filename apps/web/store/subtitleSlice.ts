import { createStore } from "@tanstack/store";
import { useSelector } from "@tanstack/react-store";
import type { Subtitle } from "@repo/types";

export interface SubtitleSlice {
  subtitles: Subtitle[];
  selectedSubtitleId: string | null;
  subtitleTrackCountExplicit: number;
}

export const initialSubtitleSlice: SubtitleSlice = {
  subtitles: [],
  selectedSubtitleId: null,
  subtitleTrackCountExplicit: 1,
};

export const subtitleStore = createStore<SubtitleSlice>(initialSubtitleSlice);

export function useSubtitleStore() {
  return useSelector(subtitleStore);
}

export function setSubtitleState(
  updater: (previous: SubtitleSlice) => SubtitleSlice,
) {
  subtitleStore.setState(updater);
}
