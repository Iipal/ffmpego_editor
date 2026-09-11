"use client";

import type { ReactNode } from "react";
import { Pause, Play, Repeat, SkipBack, Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatTime } from "@/lib/format-time";
import { cn, readSliderValue } from "@/lib/utils";

export type VideoPlayerControlsProps = {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  onTogglePlay: () => void;
  onSeek: (t: number) => void;
  /** Volume 0..1. Slider hidden unless both volume + onVolumeChange given. */
  volume?: number;
  onVolumeChange?: (v: number) => void;
  /** Mute toggle. Button hidden unless onToggleMute given. */
  muted?: boolean;
  onToggleMute?: () => void;
  /** Loop toggle. Button hidden unless onToggleLoop given. */
  loop?: boolean;
  onToggleLoop?: () => void;
  /** "Play from start" button. Hidden unless given. */
  onPlayFromStart?: () => void;
  playFromStartLabel?: string;
  playFromStartDisabled?: boolean;
  /** Row-level extras (e.g. "Play cuts", fullscreen). */
  extraActions?: ReactNode;
  /** Defaults to "current / total". */
  timeLabel?: string;
};

/**
 * Shared transport bar for every <video> player: Play/Pause, Loop,
 * Volume slider, Length (seek) slider, CurrentTime/TotalTime indicator.
 * Fully controlled — pair with usePlaybackEngine or any page-owned state.
 */
export function VideoPlayerControls({
  isPlaying,
  currentTime,
  duration,
  onTogglePlay,
  onSeek,
  volume,
  onVolumeChange,
  muted,
  onToggleMute,
  loop,
  onToggleLoop,
  onPlayFromStart,
  playFromStartLabel = "Play from trim start",
  playFromStartDisabled = false,
  extraActions,
  timeLabel,
}: VideoPlayerControlsProps) {
  const showVolume = volume !== undefined && onVolumeChange !== undefined;
  const showMute = onToggleMute !== undefined;
  const showLoop = loop !== undefined && onToggleLoop !== undefined;

  return (
    <div>
      <Slider
        className="mb-3"
        value={[currentTime]}
        min={0}
        max={Math.max(duration, 0.01)}
        step={0.01}
        onValueChange={(v) => onSeek(readSliderValue(v))}
        aria-label="Seek video"
      />
      <div className="flex items-center gap-3">
        {onPlayFromStart ? (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={playFromStartLabel}
                  onClick={onPlayFromStart}
                  disabled={playFromStartDisabled}
                />
              }
            >
              <SkipBack />
            </TooltipTrigger>
            <TooltipContent>{playFromStartLabel}</TooltipContent>
          </Tooltip>
        ) : null}
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                size="icon"
                variant="ghost"
                aria-label={isPlaying ? "Pause" : "Play"}
                onClick={onTogglePlay}
              />
            }
          >
            {isPlaying ? <Pause /> : <Play />}
          </TooltipTrigger>
          <TooltipContent>{isPlaying ? "Pause" : "Play"}</TooltipContent>
        </Tooltip>
        {showLoop ? (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  size="icon"
                  variant={loop ? "secondary" : "ghost"}
                  aria-label={loop ? "Disable loop" : "Enable loop"}
                  className={cn(
                    loop &&
                      "bg-kumo-brand text-white border-transparent hover:bg-kumo-brand-hover",
                  )}
                  onClick={onToggleLoop}
                />
              }
            >
              <Repeat />
            </TooltipTrigger>
            <TooltipContent>
              {loop ? "Loop enabled" : "Loop disabled"}
            </TooltipContent>
          </Tooltip>
        ) : null}
        {showMute ? (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={muted ? "Unmute" : "Mute"}
                  onClick={onToggleMute}
                />
              }
            >
              {muted ? <VolumeX /> : <Volume2 />}
            </TooltipTrigger>
            <TooltipContent>{muted ? "Unmute" : "Mute"}</TooltipContent>
          </Tooltip>
        ) : null}

        {showVolume ? (
          <Slider
            className="w-full max-w-18"
            value={[muted ? 0 : (volume ?? 0)]}
            min={0}
            max={1}
            step={0.001}
            onValueChange={(v) => onVolumeChange(readSliderValue(v))}
            aria-label="Volume"
          />
        ) : null}

        <output className="ml-auto text-xs tabular-nums text-kumo-subtle">
          {timeLabel ?? `${formatTime(currentTime)} / ${formatTime(duration)}`}
        </output>

        {extraActions}
      </div>
    </div>
  );
}
