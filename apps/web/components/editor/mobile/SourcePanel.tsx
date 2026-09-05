"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatTime } from "@/lib/format-time";
import { VideoPlayerControls } from "@/components/editor/shared/VideoPlayerControls";
import type { CropZone, MobileLayout } from "@/lib/mobile-layout";
import { SourceStage } from "./SourceStage";
import { ZoneCard } from "./ZoneCard";
import { TrimControls } from "./TrimControls";
import type { ZoneId } from "./types";

type SourcePanelProps = {
  layout: MobileLayout;
  selected: ZoneId;
  onSelect: (id: ZoneId) => void;
  onModeChange: (v: string | null) => void;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  mediaUrl: string | null;
  volume: number;
  setVolume: (v: number) => void;
  isMuted: boolean;
  setIsMuted: (v: boolean) => void;
  sourceLabel: string;
  currentTime: number;
  duration: number;
  trimStart: number;
  trimEnd: number;
  trimmedDuration: number;
  onMove: (id: string, nx: number, ny: number) => void;
  onResize: (id: string, zone: CropZone) => void;
  onZoom: (id: string, z: number) => void;
  onResetZone: (id: string) => void;
  onToggleLock: (id: string) => void;
  onRole: (id: string, role: CropZone["role"]) => void;
  onSeekTo: (t: number) => void;
  onTogglePlay: () => void;
  isPlaying: boolean;
  onSeekStart: () => void;
  isLoopTrim: boolean;
  setIsLoopTrim: (v: boolean) => void;
  onSetTrimRange: (range: [number, number]) => void;
  onSetStartToCurrent: () => void;
  onSetEndToCurrent: () => void;
  ignoreTrim: boolean;
  validationError: string | null;
};

export function SourcePanel(props: SourcePanelProps) {
  const {
    layout,
    selected,
    onSelect,
    onModeChange,
    videoRef,
    mediaUrl,
    volume,
    setVolume,
    isMuted,
    setIsMuted,
    sourceLabel,
    currentTime,
    duration,
    trimStart,
    trimEnd,
    trimmedDuration,
    onMove,
    onResize,
    onZoom,
    onResetZone,
    onToggleLock,
    onRole,
    onSeekTo,
    onTogglePlay,
    isPlaying,
    onSeekStart,
    isLoopTrim,
    setIsLoopTrim,
    onSetTrimRange,
    onSetStartToCurrent,
    onSetEndToCurrent,
    ignoreTrim,
    validationError,
  } = props;

  return (
    <Card className="overflow-hidden border-kumo-line shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
      <CardHeader className="py-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold tracking-normal">
            Source
            <span className="ml-1.5 font-mono text-[11px] font-normal tabular-nums text-kumo-subtle">
              16:9 · {sourceLabel}
            </span>
          </CardTitle>
          <div className="flex items-center gap-2">
            <Select value={layout.mode} onValueChange={onModeChange}>
              <SelectTrigger className="h-7 w-28 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="stacked">Stacked</SelectItem>
                <SelectItem value="full">Full</SelectItem>
              </SelectContent>
            </Select>
            <Button
              size="xs"
              variant={selected === "zone-1" ? "default" : "outline"}
              onClick={() => onSelect("zone-1")}
            >
              Zone 1
            </Button>
            <Button
              size="xs"
              variant={selected === "zone-2" ? "default" : "outline"}
              onClick={() => onSelect("zone-2")}
              disabled={layout.mode === "full"}
            >
              Zone 2
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <SourceStage
          layout={layout}
          selected={selected}
          onSelect={onSelect}
          onMove={onMove}
          onResize={onResize}
          onZoom={onZoom}
          videoRef={videoRef}
          mediaUrl={mediaUrl}
          volume={volume}
          isMuted={isMuted}
        />
        <VideoPlayerControls
          isPlaying={isPlaying}
          currentTime={currentTime}
          duration={duration}
          onTogglePlay={onTogglePlay}
          onSeek={onSeekTo}
          volume={volume}
          onVolumeChange={(v) => setVolume(v)}
          muted={isMuted}
          onToggleMute={() => setIsMuted(!isMuted)}
          loop={isLoopTrim}
          onToggleLoop={() => setIsLoopTrim(!isLoopTrim)}
          onPlayFromStart={onSeekStart}
          playFromStartLabel={`Seek to trim start ${formatTime(trimStart)}`}
          playFromStartDisabled={!duration}
        />
        <TrimControls
          trimStart={trimStart}
          trimEnd={trimEnd}
          trimmedDuration={trimmedDuration}
          duration={duration}
          currentTime={currentTime}
          ignoreTrim={ignoreTrim}
          isLoopTrim={isLoopTrim}
          setIsLoopTrim={setIsLoopTrim}
          onSetTrimRange={onSetTrimRange}
          onSetStartToCurrent={onSetStartToCurrent}
          onSetEndToCurrent={onSetEndToCurrent}
        />
        <div className="grid grid-cols-2 gap-2">
          {layout.zones.map((z) => (
            <ZoneCard
              key={z.id}
              zone={z}
              isSelected={selected === z.id}
              onReset={onResetZone}
              onToggleLock={onToggleLock}
              onZoom={onZoom}
              onRole={onRole}
            />
          ))}
        </div>
        {validationError ? (
          <p className="text-xs text-destructive">{validationError}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}
