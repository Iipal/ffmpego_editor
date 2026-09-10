"use client";

import { useEffect, useRef } from "react";
import { Card } from "@/components/ui/card";
import { PlayerControls } from "@/components/editor/PlayerControls";
import { TrimControls } from "@/components/editor/TrimControls";
import { AudioControls } from "@/components/editor/AudioControls";
import { CropOverlay } from "@/components/editor/CropOverlay";
import { useSelector } from "@tanstack/react-store";
import { sourceStore, setSourceState } from "@/store/sourceSlice";
import {
  commitPlayheadTime,
  setPlayheadTime,
  usePlayheadTime,
} from "@/store/playheadSlice";
import { cropStore, setCropState } from "@/store/cropSlice";
import { cutStore } from "@/store/cutSlice";
import { mobileStore } from "@/store/mobileSlice";
import { audioStore } from "@/store/audioSlice";
import { filterStore } from "@/store/filterSlice";
import {
  buildCanvasCssFilter,
  buildCanvasCssTransform,
} from "@repo/ffmpeg-filters";
import { useAudioPreview } from "@/hooks/useAudioPreview";
import { cn } from "@/lib/utils";

export function VideoPlayer() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const file = useSelector(sourceStore, (s) => s.file);
  const mediaUrl = useSelector(sourceStore, (s) => s.mediaUrl);
  const volume = useSelector(sourceStore, (s) => s.volume);
  const isMuted = useSelector(sourceStore, (s) => s.isMuted);
  const trimRange = useSelector(sourceStore, (s) => s.trimRange);
  const sourceAspectRatio = useSelector(
    sourceStore,
    (s) => s.sourceAspectRatio,
  );
  // Isolated playhead: ticks here never re-render other sourceStore readers.
  const currentTime = usePlayheadTime();
  const { isCropMode, canvasZoom, canvasOffset } = useSelector(cropStore);
  const { playbackSpeed } = useSelector(cutStore);
  const { isLoopEnabled } = useSelector(mobileStore);
  const { tracks: audioTracks } = useSelector(audioStore);
  const filters = useSelector(filterStore);
  // Live preview of the visual filter stack (color + flip/rotate only —
  // gamma/denoise/deshake are server-only, see visualPreviewNotes).
  // Applied to the <video> element itself so it composes with the
  // zoom/pan transform on the parent canvas div.
  const previewFilter = buildCanvasCssFilter(filters);
  const previewTransform = buildCanvasCssTransform(filters.transform);
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
    // Transient rAF clock: playhead-only writes while playing. The committed
    // sourceStore snapshot moves on pause/seek/trim-clamp, not per frame.
    const syncCurrentTime = () => {
      setPlayheadTime(video.currentTime);
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
      commitPlayheadTime(trimRange[0]);
    }
  }, [currentTime, trimRange]);

  // --- Scroll-to-zoom on the canvas stage --------------------------------
  // Native non-passive wheel listener (React's onWheel is passive at the
  // root, so preventDefault would be ignored and the page would scroll).
  // Zoom is anchored at the cursor: with transform translate(o) scale(z)
  // about the element center, offset' = o + (z - z') * (l - c) keeps the
  // point under the cursor fixed, where l is the cursor in unscaled canvas
  // coords recovered from the transformed bounding rect.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const canvas = canvasRef.current;
      if (!canvas) return;
      const { canvasZoom: zoom, canvasOffset: offset } = cropStore.state;
      const delta = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY;
      const nextZoom = Math.min(
        4,
        Math.max(0.25, zoom * Math.exp(-delta * 0.0015)),
      );
      if (nextZoom === zoom) return;
      const rect = canvas.getBoundingClientRect();
      // Cursor in unscaled canvas coords, relative to canvas center.
      const lx = (event.clientX - rect.left) / zoom - rect.width / zoom / 2;
      const ly = (event.clientY - rect.top) / zoom - rect.height / zoom / 2;
      setCropState((previous) => ({
        ...previous,
        canvasZoom: nextZoom,
        canvasOffset: {
          x: offset.x + (zoom - nextZoom) * lx,
          y: offset.y + (zoom - nextZoom) * ly,
        },
      }));
    };
    stage.addEventListener("wheel", onWheel, { passive: false });
    return () => stage.removeEventListener("wheel", onWheel);
  }, []);

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
      // canvasOffset lives in cropStore (read at the top of this component) —
      // writing it to sourceStore is a dead update nothing reads.
      setCropState((previous) => ({
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
            ref={stageRef}
            className="absolute inset-0 flex items-center justify-center overflow-hidden bg-black"
            onPointerDown={(e) => {
              startCanvasPan(e);
            }}
          >
            <div
              ref={canvasRef}
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
                style={{
                  filter: previewFilter || "none",
                  transform: previewTransform || undefined,
                }}
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
                  setPlayheadTime(event.currentTarget.currentTime);
                }}
                onPlay={(event) => {
                  if (
                    event.currentTarget.currentTime < trimRange[0] ||
                    event.currentTarget.currentTime > trimRange[1]
                  ) {
                    event.currentTarget.currentTime = trimRange[0];
                    commitPlayheadTime(trimRange[0]);
                  }
                  setSourceState((previous) => ({
                    ...previous,
                    isPlaying: true,
                  }));
                }}
                onPause={(event) => {
                  commitPlayheadTime(event.currentTarget.currentTime);
                  setSourceState((previous) => ({
                    ...previous,
                    isPlaying: false,
                  }));
                }}
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
