"use client";

import type { RefObject } from "react";
import { Maximize, Pause, Play, Repeat, Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatTime } from "@/lib/format-time";
import { useVideoState, useVideoStore } from "@/store/useVideoStore";

interface PlayerControlsProps {
  playerRef: RefObject<HTMLVideoElement | null>;
  wrapperRef: RefObject<HTMLDivElement | null>;
}

export function PlayerControls({ playerRef, wrapperRef }: PlayerControlsProps) {
  const videoStore = useVideoStore();
  const { currentTime, duration, isMuted, isPlaying, volume, isLoopEnabled } =
    useVideoState();

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
    <div className="bg-black px-3 py-2 text-white">
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
      <div className="flex items-center gap-2">
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                size="icon"
                variant="ghost"
                aria-label={isPlaying ? "Pause" : "Play"}
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
                onClick={toggleMute}
              />
            }
          >
            {isMuted ? <VolumeX /> : <Volume2 />}
          </TooltipTrigger>
          <TooltipContent>{isMuted ? "Unmute" : "Mute"}</TooltipContent>
        </Tooltip>

        <Slider
          className="w-24"
          value={[isMuted ? 0 : volume]}
          min={0}
          max={1}
          step={0.001}
          onValueChange={(value) =>
            setVolume(Array.isArray(value) ? (value[0] ?? 0) : value)
          }
          aria-label="Volume"
        />
        <output className="ml-auto text-xs tabular-nums">
          {formatTime(currentTime)} / {formatTime(duration)}
        </output>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                size="icon"
                variant="ghost"
                aria-label="Fullscreen"
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
