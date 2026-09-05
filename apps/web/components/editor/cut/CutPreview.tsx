"use client";

import type { ReactNode, RefObject } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MobilePreviewShared } from "@/components/editor/MobilePreviewShared";
import { VideoPlayerControls } from "@/components/editor/shared/VideoPlayerControls";
import { cn } from "@/lib/utils";
import type { MobileLayout } from "@/lib/mobile-layout";
import type { CutMode } from "./types";

export function CutPreview({
  mode,
  onModeChange,
  modeBadge,
  videoRef,
  mediaUrl,
  activeLayout,
  isPlaying,
  onTogglePlay,
  onPlayAllCuts,
  playAllDisabled,
  currentTime,
  duration,
  onSeek,
  volume,
  onVolumeChange,
  muted,
  onToggleMute,
  loop,
  onToggleLoop,
  children,
}: {
  mode: CutMode;
  onModeChange: (v: CutMode) => void;
  modeBadge: string;
  videoRef: RefObject<HTMLVideoElement | null>;
  mediaUrl: string | null;
  activeLayout: MobileLayout | null;
  isPlaying: boolean;
  onTogglePlay: () => void;
  onPlayAllCuts: () => void;
  playAllDisabled: boolean;
  currentTime: number;
  duration: number;
  onSeek: (t: number) => void;
  volume: number;
  onVolumeChange: (v: number) => void;
  muted: boolean;
  onToggleMute: () => void;
  loop: boolean;
  onToggleLoop: () => void;
  children: ReactNode;
}) {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-sm font-semibold tracking-normal">
            Preview
            <span className="ml-1.5 font-mono text-[11px] font-normal tabular-nums text-kumo-subtle">
              {modeBadge}
            </span>
          </CardTitle>
          <Select value={mode} onValueChange={(v) => onModeChange(v as CutMode)}>
            <SelectTrigger className="h-7 w-40 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="full-size">Full-size</SelectItem>
              <SelectItem value="2-stack">9:16 2-Stack</SelectItem>
              <SelectItem value="1-stack">9:16 1-Zone</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Single source video: visible in full-size, hidden feeder for 9:16 canvas */}
        <video
          ref={videoRef}
          src={mediaUrl ?? undefined}
          className={cn(
            "w-full overflow-hidden rounded-lg border border-kumo-line bg-black",
            mode === "full-size" ? "block aspect-video" : "hidden",
          )}
          playsInline
          preload="metadata"
        />
        {mode !== "full-size" && activeLayout ? (
          <div className="flex justify-center">
            <MobilePreviewShared
              layout={activeLayout}
              videoRef={videoRef}
              safe={false}
              showBg={false}
            />
          </div>
        ) : null}

        <VideoPlayerControls
          isPlaying={isPlaying}
          currentTime={currentTime}
          duration={duration}
          onTogglePlay={onTogglePlay}
          onSeek={onSeek}
          volume={volume}
          onVolumeChange={onVolumeChange}
          muted={muted}
          onToggleMute={onToggleMute}
          loop={loop}
          onToggleLoop={onToggleLoop}
          extraActions={
            <Button
              size="xs"
              variant="outline"
              onClick={onPlayAllCuts}
              disabled={playAllDisabled}
            >
              Play cuts
            </Button>
          }
        />

        {children}
      </CardContent>
    </Card>
  );
}
