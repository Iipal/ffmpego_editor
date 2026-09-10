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
import { useSelector } from "@tanstack/react-store";
import { sourceStore, setSourceState } from "@/store/sourceSlice";
import { commitPlayheadTime, usePlayheadTime } from "@/store/playheadSlice";
import { mobileStore, setMobileState } from "@/store/mobileSlice";

interface PlayerControlsProps {
  playerRef: RefObject<HTMLVideoElement | null>;
  wrapperRef: RefObject<HTMLDivElement | null>;
}

// Store-backed adapter over the shared transport bar. Used by the main
// VideoPlayer (and crop, which renders it lazily).
export function PlayerControls({ playerRef, wrapperRef }: PlayerControlsProps) {
  const duration = useSelector(sourceStore, (s) => s.duration);
  const isMuted = useSelector(sourceStore, (s) => s.isMuted);
  const isPlaying = useSelector(sourceStore, (s) => s.isPlaying);
  const volume = useSelector(sourceStore, (s) => s.volume);
  const trimRange = useSelector(sourceStore, (s) => s.trimRange);
  // Live playhead from the isolated clock — this bar re-renders on tick
  // without waking other sourceStore subscribers.
  const currentTime = usePlayheadTime();
  const isLoopEnabled = useSelector(
    mobileStore,
    (state) => state.isLoopEnabled,
  );

  const toggleLoop = () => {
    const next = !isLoopEnabled;
    if (playerRef.current) playerRef.current.loop = next;
    setMobileState((previous) => ({ ...previous, isLoopEnabled: next }));
  };

  const setTime = (nextTime: number) => {
    const player = playerRef.current;
    if (player) {
      player.currentTime = nextTime;
    }
    commitPlayheadTime(nextTime);
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
    setSourceState((previous) => ({ ...previous, isMuted: muted }));
  };

  const setVolume = (nextVolume: number) => {
    if (playerRef.current) {
      playerRef.current.volume = nextVolume;
      playerRef.current.muted = nextVolume === 0;
    }
    setSourceState((previous) => ({
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
