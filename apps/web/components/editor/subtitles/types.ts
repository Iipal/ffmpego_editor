import type { Subtitle } from "@/lib/subtitles/subtitleTypes";

export type SubtitleRowProps = {
  sub: Subtitle;
  isSelected: boolean;
  isVisible: boolean;
  onSelect: (id: string) => void;
};

export type OverlaySubtitleProps = {
  sub: Subtitle;
  isSelected: boolean;
  onSelect: (id: string) => void;
};

export type TimelineVisualProps = {
  duration: number;
  trimStart: number;
  trimEnd: number;
  currentTime: number;
  subtitles: Subtitle[];
  selectedId: string | null;
  trackCount: number;
  onSeek: (t: number) => void;
  onSelect: (id: string) => void;
  onUpdateSubtitle: (id: string, start: number, end: number) => void;
  onUpdateTrack: (id: string, newTrack: number) => void;
  onAddTrack: () => void;
};

export type SubtitleAreaProps = {
  count: number;
  trackCount: number;
  layoutMode: string;
  selected: Subtitle | null;
  trimLabel: string;
  durationLabel: string;
  fileName: string;
  sourceLabel: string;
  exportName: string;
  canDelete: boolean;
  onAdd: () => void;
  onDelete: () => void;
};
