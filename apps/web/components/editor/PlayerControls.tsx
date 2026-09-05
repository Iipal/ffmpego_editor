"use client";

import type { RefObject } from "react";
import { Maximize } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { VideoPlayerControls } from "@/components/editor/shared/VideoPlayerControls";
import { useVideoState, useVideoStore } from "@/store/useVideoStore";

interface PlayerControlsProps {
  playerRef: RefObject<HTMLVideoElement | null>;
  wrapperRef: RefObject<HTMLDivElement | null>;
}

// Store-backed adapter over the shared transport bar. Used by the main
// VideoPlayer (and crop, which renders it lazily).
export function PlayerControls({ playerRef, wrapperRef }: PlayerControlsProps) {
  const videoStore = useVideoStore();
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
    <div className="border-t border-kumo-line bg-kumo-base px-4 py-3 rounded-b-lg">
      <VideoPlayerControls
        isPlaying={isPlaying}
        currentTime={currentTime}
        duration={duration}
        onTogglePlay={togglePlayback}
        onSeek={setTime}
        volume={volume}
        onVolumeChange={setVolume}
        muted={isMuted}
        onToggleMute={toggleMute}
        loop={isLoopEnabled}
        onToggleLoop={toggleLoop}
        onPlayFromStart={playFromTrimStart}
        extraActions={
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
        }
      />
    </div>
  );
}
