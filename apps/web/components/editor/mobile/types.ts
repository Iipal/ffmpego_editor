import type { CropZone, MobileLayout } from "@/lib/mobile-layout";

export type ZoneId = "zone-1" | "zone-2";

export type EditorHistory = {
  layout: MobileLayout;
  past: MobileLayout[];
  future: MobileLayout[];
};

export type ZoneOverlayProps = {
  zone: CropZone;
  isSelected: boolean;
  onSelect: (id: ZoneId) => void;
  onPointerDownMove: (e: React.PointerEvent, id: string) => void;
  onPointerDownHandle: (
    e: React.PointerEvent,
    id: string,
    handle: string,
  ) => void;
  onZoom: (id: string, z: number) => void;
};

export type SourceStageProps = {
  layout: MobileLayout;
  selected: string | null;
  onSelect: (id: ZoneId) => void;
  onMove: (id: string, nx: number, ny: number) => void;
  onResize: (id: string, zone: CropZone) => void;
  onZoom: (id: string, z: number) => void;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  mediaUrl: string | null;
  volume: number;
  isMuted: boolean;
};

export type PortraitPreviewProps = {
  layout: MobileLayout;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  onSplit: (v: number) => void;
  safe: boolean;
  useWatermark: boolean;
};

export type PlaybackTimelineProps = {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  duration: number;
  trimRange: [number, number];
  isLoopTrim: boolean;
  onTimeUpdate?: (t: number) => void;
};

export type ZoneCardProps = {
  zone: CropZone;
  isSelected: boolean;
  onReset: (id: string) => void;
  onToggleLock: (id: string) => void;
  onZoom: (id: string, v: number) => void;
  onRole: (id: string, role: CropZone["role"]) => void;
};

export type MobileAreaProps = {
  layout: MobileLayout;
  selected: ZoneId;
  modeBadge: string;
  splitLabel: string;
  sourceLabel: string;
  outputLabel: string;
  trimLabel: string;
  timeLabel: string;
  filterPreview: string;
  validationError: string | null;
  isStale: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onSave: () => void;
};
