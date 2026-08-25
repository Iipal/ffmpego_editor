"use client";

import type { RefObject } from "react";
import {
  Maximize,
  Pause,
  Play,
  Repeat,
  SkipBack,
  Volume2,
  VolumeX,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatTime } from "@/lib/format-time";
import { useVideoState, useVideoStore } from "@/store/useVideoStore";
import { cn } from "@/lib/utils";
import { useTheme } from "@/providers/ThemeProvider";

interface PlayerControlsProps {
  playerRef: RefObject<HTMLVideoElement | null>;
  wrapperRef: RefObject<HTMLDivElement | null>;
}

export function PlayerControls({ playerRef, wrapperRef }: PlayerControlsProps) {
  const videoStore = useVideoStore();
  const { theme } = useTheme();
  const {
    currentTime,
    duration,
    isMuted,
    isPlaying,
    volume,
    isLoopEnabled,
    trimRange,
  } = useVideoState();

  const toggleLoop = () => {
    const next = !isLoopEnabled;
    if (playerRef.current) playerRef.current.loop = next;
    videoStore.setState((previous) => ({ ...previous, isLoopEnabled: next }));
  };

  const setTime = (nextTime: number) => {
    const player = playerRef.current;
    if (player) {
      player.currentTime = nextTime;
    }
    videoStore.setState((previous) => ({ ...previous, currentTime: nextTime }));
  };

  const playFromTrimStart = async () => {
    const player = playerRef.current;
    if (!player) return;
    player.currentTime = trimRange[0];
    await player.play();
  };

  const togglePlayback = async () => {
    const player = playerRef.current;
    if (!player) return;
    if (player.paused) await player.play();
    else player.pause();
  };

  const toggleMute = () => {
    const muted = !isMuted;
    if (playerRef.current) playerRef.current.muted = muted;
    videoStore.setState((previous) => ({ ...previous, isMuted: muted }));
  };

  const setVolume = (nextVolume: number) => {
    if (playerRef.current) {
      playerRef.current.volume = nextVolume;
      playerRef.current.muted = nextVolume === 0;
    }
    videoStore.setState((previous) => ({
      ...previous,
      volume: nextVolume,
      isMuted: nextVolume === 0,
    }));
  };

  return (
    <div
      className={cn(
        "glass-panel glass-panel-hover px-4 py-3",
        theme === "dark" && "glass-glow",
        "text-white",
      )}
    >
      <Slider
        className="mb-3"
        value={[currentTime]}
        min={0}
        max={Math.max(duration, 0.01)}
        step={0.01}
        onValueChange={(value) =>
          setTime(Array.isArray(value) ? (value[0] ?? 0) : value)
        }
        aria-label="Seek video"
      />
      <div className="flex items-center gap-3">
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                size="icon"
                variant="ghost"
                aria-label="Play from trim start"
                className="glass-button text-gray-600! hover:text-black! dark:text-white/60! dark:hover:text-white!"
                onClick={playFromTrimStart}
              />
            }
          >
            <SkipBack />
          </TooltipTrigger>
          <TooltipContent>Play from trim start</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                size="icon"
                variant="ghost"
                aria-label={isPlaying ? "Pause" : "Play"}
                className="glass-button text-gray-600! hover:text-black! dark:text-white/60! dark:hover:text-white!"
                onClick={togglePlayback}
              />
            }
          >
            {isPlaying ? <Pause /> : <Play />}
          </TooltipTrigger>
          <TooltipContent>{isPlaying ? "Pause" : "Play"}</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                size="icon"
                variant={isLoopEnabled ? "secondary" : "ghost"}
                aria-label={isLoopEnabled ? "Disable loop" : "Enable loop"}
                className={cn(
                  "text-gray-600! hover:text-black! dark:text-white/60! dark:hover:text-white!",
                  isLoopEnabled && "bg-primary/20 border-primary/30",
                )}
                onClick={toggleLoop}
              />
            }
          >
            <Repeat />
          </TooltipTrigger>
          <TooltipContent>
            {isLoopEnabled ? "Loop enabled" : "Loop disabled"}
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                size="icon"
                variant="ghost"
                aria-label={isMuted ? "Unmute" : "Mute"}
                className="glass-button text-gray-600! hover:text-black! dark:text-white/60! dark:hover:text-white!"
                onClick={toggleMute}
              />
            }
          >
            {isMuted ? <VolumeX /> : <Volume2 />}
          </TooltipTrigger>
          <TooltipContent>{isMuted ? "Unmute" : "Mute"}</TooltipContent>
        </Tooltip>

        <Slider
          className="max-w-18 w-full"
          value={[isMuted ? 0 : volume]}
          min={0}
          max={1}
          step={0.001}
          onValueChange={(value) =>
            setVolume(Array.isArray(value) ? (value[0] ?? 0) : value)
          }
          aria-label="Volume"
        />

        <output
          className={cn(
            "ml-auto text-xs tabular-nums",
            theme === "dark" ? "text-white/80" : "text-black/70",
          )}
        >
          {formatTime(currentTime)} / {formatTime(duration)}
        </output>

        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                size="icon"
                variant="ghost"
                aria-label="Fullscreen"
                className="glass-button text-gray-600! hover:text-black! dark:text-white/60! dark:hover:text-white!"
                onClick={() => wrapperRef.current?.requestFullscreen()}
              />
            }
          >
            <Maximize />
          </TooltipTrigger>
          <TooltipContent>Fullscreen</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}
