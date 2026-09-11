import { defineSlice } from "./slice";
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

export const {
  store: subtitleStore,
  useStore: useSubtitleStore,
  setState: setSubtitleState,
} = defineSlice<SubtitleSlice>(initialSubtitleSlice);
