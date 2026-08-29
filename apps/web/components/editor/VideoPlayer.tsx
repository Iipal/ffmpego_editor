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
  // Calculate the smallest distance from the crop rectangle to the video edge.
  // This is used to determine how much padding should be applied when auto-zoom
  // is enabled, preventing the crop window from touching the player's borders.
  const cropEdgeMargin = Math.min(
    crop.x,
    crop.y,
    100 - crop.x - crop.width,
    100 - crop.y - crop.height,
  );

  // Auto-zoom padding is eased based on how close the crop handles are to the
  // edge of the crop box. The closer the crop box is to the edge, the smaller
  // the padding becomes, but it is never less than 0.
  const cropCanvasPadding = isAutoZoomEnabled
    ? Math.min(
        0.16,
        0.08 + Math.max(0, 0.08 - Math.min(cropEdgeMargin, 8) / 100),
      )
    : 0;

  // Calculate a zoom factor that fits the selected crop region to the visible
  // player area. The scale is based on the smallest crop dimension so the crop
  // box fully fills one axis of the player.
  const cropScale =
    (1 - cropCanvasPadding * 2) * (100 / Math.min(crop.width, crop.height));

  // Center the crop box inside the player by translating the crop center to
  // the player center. The crop values are expressed as percentages.
  const cropOffsetX = 50 - (crop.x + crop.width / 2);
  const cropOffsetY = 50 - (crop.y + crop.height / 2);

  const canvasTransform = isAutoZoomEnabled
    ? `scale(${cropScale}) translate(${cropOffsetX}%, ${cropOffsetY}%)`
    : `translate(${canvasOffset.x}px, ${canvasOffset.y}px) scale(${canvasZoom})`;

  // Compute the largest fitted video wrapper size while preserving the source
  // video aspect ratio inside the fixed 16:9 player area.
  const playerAspectRatio = 16 / 9;
  const canvasSize =
    sourceAspectRatio >= playerAspectRatio
      ? {
          width: "100%",
          height: `${(playerAspectRatio / sourceAspectRatio) * 100}%`,
        }
      : {
          width: `${(sourceAspectRatio / playerAspectRatio) * 100}%`,
          height: "100%",
        };

  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    video.volume = volume;
    video.muted = isMuted;
  }, [isMuted, volume]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    video.playbackRate = playbackSpeed;
    video.loop = isLoopEnabled;
  }, [playbackSpeed, isLoopEnabled]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }

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

    // Keep the shared video state synchronized with the actual HTMLVideoElement
    // while playback is active. This is necessary for the timeline and controls
    // to reflect the real playback position.
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
    if (isAutoZoomEnabled) return;
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

  if (!mediaUrl) {
    return null;
  }

  return (
    <div className="space-y-3">
      <Card className="overflow-hidden p-0 rounded-lg">
        <div ref={wrapperRef} className="relative aspect-video w-full">
          <div className="absolute inset-0 flex items-center justify-center overflow-hidden">
            <div
              className={cn(
                isAutoZoomEnabled ? "transition-transform duration-300" : "",
                "relative origin-center",
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
                      // preserve existing trim if it was user-set and still fits; otherwise init
                      if (
                        previous.trimRange[1] > previous.trimRange[0] &&
                        previous.trimRange[1] <= d &&
                        previous.trimRange[0] >= 0
                      ) {
                        nextTrim = previous.trimRange;
                      } else {
                        nextTrim = [0, d] as [number, number];
                      }
                      // clamp persisted trim when duration changed (e.g. different video)
                      if (nextTrim[1] > d) nextTrim = [Math.min(nextTrim[0], d - 0.01), d] as [number, number];
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
                        event.currentTarget.videoWidth /
                        event.currentTarget.videoHeight,
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
              {isCropMode && <CropOverlay onCanvasPanStart={startCanvasPan} />}
            </div>
          </div>
        </div>
        <PlayerControls playerRef={videoRef} wrapperRef={wrapperRef} />
      </Card>
      <Timeline playerRef={videoRef} />
    </div>
  );
}
