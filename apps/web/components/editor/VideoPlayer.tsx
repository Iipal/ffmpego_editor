"use client";

import { useEffect, useRef } from "react";
import { Card } from "@/components/ui/card";
import { PlayerControls } from "@/components/editor/PlayerControls";
import { TrimControls } from "@/components/editor/TrimControls";
import { AudioControls } from "@/components/editor/AudioControls";
import { CropOverlay } from "@/components/editor/CropOverlay";
import { useSelector } from "@tanstack/react-store";
import { sourceStore, setSourceState } from "@/store/sourceSlice";
import { cropStore } from "@/store/cropSlice";
import { cutStore } from "@/store/cutSlice";
import { mobileStore } from "@/store/mobileSlice";
import { audioStore } from "@/store/audioSlice";
import { useAudioPreview } from "@/hooks/useAudioPreview";
import { cn } from "@/lib/utils";

export function VideoPlayer() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const {
    file,
    mediaUrl,
    volume,
    isMuted,
    currentTime,
    trimRange,
    sourceAspectRatio,
  } = useSelector(sourceStore);
  const { isCropMode, canvasZoom, canvasOffset } = useSelector(cropStore);
  const { playbackSpeed } = useSelector(cutStore);
  const { isLoopEnabled } = useSelector(mobileStore);
  const { tracks: audioTracks } = useSelector(audioStore);
  useAudioPreview({
    file,
    mediaUrl,
    videoRef,
    tracks: audioTracks,
    volume,
    muted: isMuted,
  });
  const manualTransform = `translate(${canvasOffset.x}px, ${canvasOffset.y}px) scale(${canvasZoom})`;

  // Zoom/pan applies in and outside crop mode. CropOverlay's pointer math
  // divides by bounds.width/height, so a scaled canvas (bounds includes scale)
  // maps correctly to pct without extra correction.
  const canvasTransform = manualTransform;

  // --- Letterbox size: fit source video inside fixed 16:9 player  -----------
  const playerAspectRatio = 16 / 9;
  const srcAspect =
    sourceAspectRatio > 0 ? sourceAspectRatio : playerAspectRatio;
  const canvasSize =
    srcAspect >= playerAspectRatio
      ? {
          width: "100%",
          height: `${(playerAspectRatio / srcAspect) * 100}%`,
        }
      : {
          width: `${(srcAspect / playerAspectRatio) * 100}%`,
          height: "100%",
        };

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.volume = volume;
    video.muted = audioTracks.length > 0 ? true : isMuted;
  }, [isMuted, volume, audioTracks.length]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.playbackRate = playbackSpeed;
    video.loop = isLoopEnabled;
  }, [playbackSpeed, isLoopEnabled]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    let animationFrame = 0;
    const syncCurrentTime = () => {
      setSourceState((previous) =>
        previous.currentTime === video.currentTime
          ? previous
          : { ...previous, currentTime: video.currentTime },
      );
      animationFrame = requestAnimationFrame(syncCurrentTime);
    };
    const startSync = () => {
      cancelAnimationFrame(animationFrame);
      syncCurrentTime();
    };
    const stopSync = () => cancelAnimationFrame(animationFrame);
    video.addEventListener("play", startSync);
    video.addEventListener("pause", stopSync);
    video.addEventListener("ended", stopSync);
    if (!video.paused) startSync();
    return () => {
      stopSync();
      video.removeEventListener("play", startSync);
      video.removeEventListener("pause", stopSync);
      video.removeEventListener("ended", stopSync);
    };
  }, [mediaUrl]);

  useEffect(() => {
    const video = videoRef.current;
    if (video && currentTime > trimRange[1]) {
      video.currentTime = trimRange[0];
    }
  }, [currentTime, trimRange]);

  const startCanvasPan = (event: React.PointerEvent<HTMLDivElement>) => {
    // Pan is allowed even during crop mode — CropOverlay stops propagation on
    // crop handles/move so panning only fires for background/empty area drags.
    event.preventDefault();
    const start = {
      x: event.clientX,
      y: event.clientY,
      offset: canvasOffset,
    };
    const onMove = (moveEvent: PointerEvent) => {
      setSourceState((previous) => ({
        ...previous,
        canvasOffset: {
          x: start.offset.x + moveEvent.clientX - start.x,
          y: start.offset.y + moveEvent.clientY - start.y,
        },
      }));
    };
    const onEnd = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onEnd);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onEnd);
  };

  if (!mediaUrl) return null;

  return (
    <>
      <Card className="overflow-hidden p-0 rounded-lg">
        <div ref={wrapperRef} className="relative aspect-video w-full">
          {/* Outer stage is always untransformed; only the inner canvas is
              transformed. CropOverlay lives inside the letterboxed canvas and
              inherits the same zoom/pan so crop rect stays aligned with video. */}
          <div
            className="absolute inset-0 flex items-center justify-center overflow-hidden bg-black"
            onPointerDown={(e) => {
              startCanvasPan(e);
            }}
          >
            <div
              className={cn("relative origin-center")}
              style={{
                ...canvasSize,
                transform: canvasTransform,
              }}
            >
              <video
                ref={videoRef}
                className="size-full object-fill"
                src={mediaUrl}
                onLoadedMetadata={(event) => {
                  const d = event.currentTarget.duration;
                  // Trim init/clamp is owned by useTrimRange (TrimControls below),
                  // which reacts to this duration update.
                  setSourceState((previous) => {
                    return {
                      ...previous,
                      duration:
                        previous.duration > 0 && previous.duration === d
                          ? previous.duration
                          : d,
                      sourceAspectRatio:
                        event.currentTarget.videoWidth /
                        event.currentTarget.videoHeight,
                      sourceWidth: event.currentTarget.videoWidth,
                      sourceHeight: event.currentTarget.videoHeight,
                    };
                  });
                }}
                onTimeUpdate={(event) => {
                  setSourceState((previous) => ({
                    ...previous,
                    currentTime: event.currentTarget.currentTime,
                  }));
                }}
                onPlay={(event) => {
                  if (
                    event.currentTarget.currentTime < trimRange[0] ||
                    event.currentTarget.currentTime > trimRange[1]
                  )
                    event.currentTarget.currentTime = trimRange[0];
                  setSourceState((previous) => ({
                    ...previous,
                    isPlaying: true,
                  }));
                }}
                onPause={() =>
                  setSourceState((previous) => ({
                    ...previous,
                    isPlaying: false,
                  }))
                }
              />
              {isCropMode && <CropOverlay />}
            </div>
          </div>
        </div>
        <PlayerControls playerRef={videoRef} wrapperRef={wrapperRef} />
      </Card>
      {/* Trim init/clamp is owned by useTrimRange inside TrimControls. */}
      <TrimControls minGap={0} initClampMargin={0.01} playerRef={videoRef} />
      <AudioControls />
    </>
  );
}
