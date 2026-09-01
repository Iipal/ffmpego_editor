"use client";

import { useEffect, useRef } from "react";
import { Card } from "@/components/ui/card";
import { PlayerControls } from "@/components/editor/PlayerControls";
import { Timeline } from "@/components/editor/Timeline";
import { CropOverlay } from "@/components/editor/CropOverlay";
import { useVideoState, useVideoStore } from "@/store/useVideoStore";
import { cn } from "@/lib/utils";

export function VideoPlayer() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const videoStore = useVideoStore();
  const {
    mediaUrl,
    volume,
    isMuted,
    currentTime,
    trimRange,
    crop,
    isCropMode,
    isAutoZoomEnabled,
    canvasZoom,
    canvasOffset,
    sourceAspectRatio,
    playbackSpeed,
    isLoopEnabled,
  } = useVideoState();

  // --- Auto-zoom preview (only when NOT cropping) ---------------------------
  // Compute the zoom that fits the selected crop region into the 16:9 player
  // with a small padding. Must not be applied while CropOverlay is active:
  // the overlay's getBoundingClientRect would be transformed and pointer
  // deltas would be scaled, causing drift + a feedback loop (move crop ->
  // new scale -> new bounds mid-drag).
  const cropEdgeMargin = Math.min(
    crop.x,
    crop.y,
    100 - crop.x - crop.width,
    100 - crop.y - crop.height,
  );
  const cropCanvasPadding = isAutoZoomEnabled
    ? Math.min(0.16, 0.08 + Math.max(0, 0.08 - Math.min(cropEdgeMargin, 8) / 100))
    : 0;
  const cropScale = (1 - cropCanvasPadding * 2) * (100 / Math.min(crop.width, crop.height));
  const cropOffsetX = 50 - (crop.x + crop.width / 2);
  const cropOffsetY = 50 - (crop.y + crop.height / 2);

  const autoTransform = `scale(${cropScale}) translate(${cropOffsetX}%, ${cropOffsetY}%)`;
  const manualTransform = `translate(${canvasOffset.x}px, ${canvasOffset.y}px) scale(${canvasZoom})`;

  // FIX: disable all canvas transforms while crop mode is active.
  // Crop editing is 1:1 with the video content rect so pointer math stays
  // drift-free. Preview zoom (auto or manual) is shown only outside crop mode.
  const canvasTransform = isCropMode
    ? undefined
    : isAutoZoomEnabled
      ? autoTransform
      : manualTransform;

  // --- Letterbox size: fit source video inside fixed 16:9 player  -----------
  const playerAspectRatio = 16 / 9;
  const srcAspect = sourceAspectRatio > 0 ? sourceAspectRatio : playerAspectRatio;
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
    video.muted = isMuted;
  }, [isMuted, volume]);

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
      videoStore.setState((previous) =>
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
  }, [mediaUrl, videoStore]);

  useEffect(() => {
    const video = videoRef.current;
    if (video && currentTime > trimRange[1]) {
      video.currentTime = trimRange[0];
    }
  }, [currentTime, trimRange]);

  const startCanvasPan = (event: React.PointerEvent<HTMLDivElement>) => {
    if (isAutoZoomEnabled || isCropMode) return;
    event.preventDefault();
    const start = {
      x: event.clientX,
      y: event.clientY,
      offset: canvasOffset,
    };
    const onMove = (moveEvent: PointerEvent) => {
      videoStore.setState((previous) => ({
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
    <div className="space-y-3">
      <Card className="overflow-hidden p-0 rounded-lg">
        <div ref={wrapperRef} className="relative aspect-video w-full">
          {/* Outer stage is always untransformed; only the inner canvas is
              transformed for preview. CropOverlay lives inside the letterboxed
              canvas but that canvas is NOT transformed while isCropMode,
              so overlay bounds == logical crop percentages 1:1. */}
          <div
            className="absolute inset-0 flex items-center justify-center overflow-hidden bg-black"
            onPointerDown={(e) => {
              // Pan only when not cropping — background drag pans canvas.
              if (!isCropMode) startCanvasPan(e);
            }}
          >
            <div
              className={cn(
                "relative origin-center",
                isCropMode
                  ? ""
                  : isAutoZoomEnabled
                    ? "transition-transform duration-300"
                    : "",
              )}
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
                  videoStore.setState((previous) => {
                    const needsInit =
                      previous.trimRange[1] === 0 ||
                      previous.trimRange[1] > d + 0.01 ||
                      previous.trimRange[0] < 0 ||
                      previous.trimRange[0] >= d;
                    let nextTrim: [number, number];
                    if (needsInit && d > 0 && Number.isFinite(d)) {
                      if (
                        previous.trimRange[1] > previous.trimRange[0] &&
                        previous.trimRange[1] <= d &&
                        previous.trimRange[0] >= 0
                      ) {
                        nextTrim = previous.trimRange;
                      } else {
                        nextTrim = [0, d] as [number, number];
                      }
                      if (nextTrim[1] > d)
                        nextTrim = [Math.min(nextTrim[0], d - 0.01), d] as [
                          number,
                          number,
                        ];
                    } else if (previous.trimRange[1] > d) {
                      nextTrim = [previous.trimRange[0], d] as [number, number];
                    } else {
                      nextTrim = previous.trimRange;
                    }
                    return {
                      ...previous,
                      duration:
                        previous.duration > 0 && previous.duration === d
                          ? previous.duration
                          : d,
                      trimRange: nextTrim,
                      sourceAspectRatio:
                        event.currentTarget.videoWidth / event.currentTarget.videoHeight,
                      sourceWidth: event.currentTarget.videoWidth,
                      sourceHeight: event.currentTarget.videoHeight,
                    };
                  });
                }}
                onTimeUpdate={(event) => {
                  videoStore.setState((previous) => ({
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
                  videoStore.setState((previous) => ({
                    ...previous,
                    isPlaying: true,
                  }));
                }}
                onPause={() =>
                  videoStore.setState((previous) => ({
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
      <Timeline playerRef={videoRef} />
    </div>
  );
}
