"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ViewTransition } from "react";
import { X } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { formatTime } from "@/lib/format-time";
import { MobileLayoutService, mobileLayoutService } from "@/lib/mobile-layout";
import type { CropZone, MobileLayout } from "@/lib/mobile-layout";
import { VideoPlayerControls } from "@/components/editor/shared/VideoPlayerControls";
import { usePlaybackEngine } from "@/components/editor/shared/usePlaybackEngine";
import { useAudioAnalysis } from "@/lib/query-hooks";
import {
  getAudioRenderSettings,
  type AudioTrack,
  type AudioTrackRenderSettings,
} from "@/store/audioSlice";
import { ensureWatermark, STATUS_LABEL, statusColor, wmImg } from "./helpers";
import type { BulkItem } from "./types";

export type BulkExpandedViewProps = {
  item: BulkItem;
  stackedLayout: MobileLayout | null;
  useWatermark: boolean;
  onClose: () => void;
  onPatch: (id: string, patch: Partial<BulkItem>) => void;
  onMeta: (
    id: string,
    meta: { duration: number; width: number; height: number },
  ) => void;
};

const STACKED_W = 200;
// Floor for the stacked mirror so it reads larger next to the source pane
// (≈236px wide at 9:16). When the floor binds, the grid row stretches the
// source pane to match, so both stay exactly equal height.
const MIN_STACK_H = 420;
// 9:16 aspect (width factor) and the grid gap (gap-3) — used to derive the
// stack height from the grid WIDTH (stable: widths never shift when heights
// change, so unlike measuring the stretched source box this cannot ratchet).
const AR_9_16 = MobileLayoutService.OUTPUT_W / MobileLayoutService.OUTPUT_H;
const GRID_GAP = 12;
// Divider (h-0.5) inside the stack box; subtracted so both boxes match to the px.
const STACK_DIVIDER = 2;

// ---------------------------------------------------------------------------
// Live 2-zone stacked mirror — draws every frame from the shared <video>
// element (same element the 16:9 source pane plays), so one
// <VideoPlayerControls /> drives both panes in sync. `height` pins the
// total stack height (width derived as height * 9/16); without it the
// preview falls back to a fixed 200px width.
// ---------------------------------------------------------------------------

type LiveStackedProps = {
  video: HTMLVideoElement | null;
  layout: MobileLayout;
  useWatermark: boolean;
  /** Total stack height in px — measured from the source pane so both panes match. */
  height?: number | null;
};

const BulkLiveStackedPreview = memo(function BulkLiveStackedPreview({
  video,
  layout,
  useWatermark,
  height,
}: LiveStackedProps) {
  const topRef = useRef<HTMLCanvasElement>(null);
  const bottomRef = useRef<HTMLCanvasElement>(null);

  const totalH =
    height && height > 0
      ? height
      : STACKED_W *
        (MobileLayoutService.OUTPUT_H / MobileLayoutService.OUTPUT_W);
  const width =
    totalH * (MobileLayoutService.OUTPUT_W / MobileLayoutService.OUTPUT_H);

  const draw = useCallback(() => {
    if (!video || video.readyState < 2 || video.videoWidth === 0) return;
    const split = mobileLayoutService.clamp(
      layout.splitRatio,
      MobileLayoutService.MIN_SPLIT,
      MobileLayoutService.MAX_SPLIT,
    );
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const parts: Array<{
      canvas: HTMLCanvasElement | null;
      zone: CropZone;
      h: number;
    }> = [
      { canvas: topRef.current, zone: layout.zones[0], h: totalH * split },
      {
        canvas: bottomRef.current,
        zone: layout.zones[1],
        h: totalH * (1 - split),
      },
    ];
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    for (const { canvas, zone, h } of parts) {
      if (!canvas || !zone) continue;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${h}px`;
      const ctx = canvas.getContext("2d");
      if (!ctx) continue;
      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, width, h);
      mobileLayoutService.drawZoneToCanvas(ctx, video, zone, vw, vh, width, h);
      ctx.restore();
    }
    if (useWatermark && wmImg) {
      const img = wmImg as HTMLImageElement;
      const drawWm = (
        canvas: HTMLCanvasElement | null,
        slice: "top" | "bottom",
        h: number,
      ) => {
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.save();
        ctx.scale(dpr, dpr);
        if (slice === "top") {
          ctx.drawImage(img, 0, 0, 1080, 1920 * split, 0, 0, width, h);
        } else {
          const h1 = 1920 * split;
          ctx.drawImage(img, 0, h1, 1080, 1920 - h1, 0, 0, width, h);
        }
        ctx.restore();
      };
      drawWm(topRef.current, "top", totalH * split);
      drawWm(bottomRef.current, "bottom", totalH * (1 - split));
    }
  }, [video, layout, useWatermark, totalH, width]);

  const drawRef = useRef(draw);
  useEffect(() => {
    drawRef.current = draw;
  }, [draw]);

  // Redraw on layout / watermark / height changes (watermark loads async).
  useEffect(() => {
    if (useWatermark) {
      void ensureWatermark().then(() => drawRef.current());
    } else {
      drawRef.current();
    }
  }, [useWatermark, layout, video, totalH]);

  // Mirror playback: single draw on seeks/pauses, rAF loop while playing.
  useEffect(() => {
    if (!video) return;
    let raf = 0;
    let running = true;
    const loop = () => {
      if (!running) return;
      drawRef.current();
      if (!video.paused && !video.ended) raf = requestAnimationFrame(loop);
      else raf = 0;
    };
    const onPlay = () => {
      if (raf === 0) raf = requestAnimationFrame(loop);
    };
    const onStill = () => drawRef.current();
    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onStill);
    video.addEventListener("seeked", onStill);
    video.addEventListener("timeupdate", onStill);
    video.addEventListener("loadeddata", onStill);
    drawRef.current();
    if (!video.paused && !video.ended) raf = requestAnimationFrame(loop);
    return () => {
      running = false;
      cancelAnimationFrame(raf);
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onStill);
      video.removeEventListener("seeked", onStill);
      video.removeEventListener("timeupdate", onStill);
      video.removeEventListener("loadeddata", onStill);
    };
  }, [video]);

  return (
    <div className="flex flex-col items-center">
      <div className="flex flex-col overflow-hidden rounded-lg border border-kumo-line bg-black">
        <canvas ref={topRef} className="block" />
        <div className="h-0.5 shrink-0 bg-kumo-hairline" />
        <canvas ref={bottomRef} className="block" />
      </div>
    </div>
  );
});

/**
 * Per-video audio track picker: probes this item's audio tracks on demand
 * (`useAudioAnalysis`, cached by file identity) and stores the export
 * selection on the item as `audioTracks[]` (undefined = server default).
 * Mirrors the AudioControls Include switches, but per bulk item instead of
 * the global audio store (bulk videos each have their own track list).
 */
function BulkAudioPicker({
  file,
  itemId,
  saved,
  disabled,
  onPatch,
}: {
  file: File;
  itemId: string;
  saved: AudioTrackRenderSettings[] | undefined;
  disabled: boolean;
  onPatch: (id: string, patch: Partial<BulkItem>) => void;
}) {
  const { data, isPending } = useAudioAnalysis(file, 0);
  const [overrides, setOverrides] = useState<Set<number> | null>(null);
  useEffect(() => setOverrides(null), [itemId]);
  const tracks: AudioTrack[] | null = data?.tracks ?? null;

  const isEnabled = (trackIndex: number) => {
    if (overrides) return overrides.has(trackIndex);
    return saved?.find((s) => s.trackIndex === trackIndex)?.enabled ?? true;
  };
  const toggle = (trackIndex: number, on: boolean) => {
    if (!tracks) return;
    const next = new Set<number>();
    for (const t of tracks) {
      if (isEnabled(t.trackIndex)) next.add(t.trackIndex);
    }
    if (on) next.add(trackIndex);
    else next.delete(trackIndex);
    setOverrides(next);
    onPatch(itemId, {
      audioTracks: getAudioRenderSettings(
        tracks.map((t) => ({
          ...t,
          enabled: next.has(t.trackIndex),
          gainDb: 0,
          loudnormEnabled: false,
          loudnormTargetLufs: -14,
          fadeInSeconds: 0,
          fadeOutSeconds: 0,
          muteSegments: [],
          waveform: null,
          loudness: null,
        })),
      ),
    });
  };

  return (
    <div className="space-y-1.5 rounded-lg border border-kumo-line p-2.5">
      <div className="font-mono text-[11px] tabular-nums text-kumo-subtle">
        {tracks
          ? `Audio · ${tracks.length} track${tracks.length === 1 ? "" : "s"} (export selection)`
          : isPending
            ? "Audio · probing tracks…"
            : "Audio · no tracks found"}
      </div>
      {tracks?.map((t) => (
        <label key={t.trackIndex} className="flex items-center gap-2 text-xs">
          <Checkbox
            checked={isEnabled(t.trackIndex)}
            onCheckedChange={(v) => toggle(t.trackIndex, v === true)}
            disabled={disabled}
          />
          <span className="min-w-0 truncate">
            Track {t.trackIndex + 1}
            {t.language ? ` · ${t.language}` : ""}
            {t.codec ? ` · ${t.codec}` : ""} · {t.channels}ch
          </span>
        </label>
      ))}
    </div>
  );
}

/**
 * Expanded Card-fill-size view rendered above the bulk grid.
 * Shares the ViewTransition name `bulk-cell-<id>` with the grid cell
 * so the clicked cell morphs into this Card. Plays the video in two
 * formats side by side — 16:9 source on the left, live 2-zone stacked
 * 9:16 mirror on the right — driven by ONE shared <video> element and
 * ONE shared <VideoPlayerControls />, so each video plays individually
 * while expanded.
 */
export function BulkExpandedView({
  item,
  stackedLayout,
  useWatermark,
  onClose,
  onPatch,
  onMeta,
}: BulkExpandedViewProps) {
  const rowActive =
    item.status === "uploading" ||
    item.status === "queued" ||
    item.status === "processing" ||
    item.status === "saving";
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null);
  const setVideoRefs = useCallback((el: HTMLVideoElement | null) => {
    videoRef.current = el;
    setVideoEl((prev) => (prev === el ? prev : el));
  }, []);
  const gridRef = useRef<HTMLDivElement | null>(null);
  const [gridW, setGridW] = useState<number | null>(null);
  const [isMd, setIsMd] = useState(false);
  const player = usePlaybackEngine(videoRef, { throttleMs: 100 });

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const onChange = () => setIsMd(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  // Grid width is layout-stable (stack height never affects it), so deriving
  // the stack height from it converges instead of ratcheting.
  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const update = () => {
      const w = Math.round(el.getBoundingClientRect().width);
      setGridW((prev) => (prev !== null && Math.abs(prev - w) < 1 ? prev : w));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [item.id]);

  // Solve H so the stack box equals the 16:9 source box:
  //   H = (gridW - gap - H*AR) * AR - divider  →  H = (gridW-gap)*AR/(1+AR²) - divider
  const stackH = useMemo(() => {
    if (gridW === null) return MIN_STACK_H;
    if (!isMd) return Math.max(Math.round(gridW * AR_9_16), 120);
    const exact =
      ((gridW - GRID_GAP) * AR_9_16) / (1 + AR_9_16 * AR_9_16) - STACK_DIVIDER;
    return Math.max(Math.round(exact), MIN_STACK_H);
  }, [gridW, isMd]);

  const onMetaRef = useRef(onMeta);
  useEffect(() => {
    onMetaRef.current = onMeta;
  }, [onMeta]);

  // Report native metadata back to the bulk store (duration / dimensions).
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const onLoaded = () => {
      const d = video.duration;
      onMetaRef.current(item.id, {
        duration: Number.isFinite(d) ? d : 0,
        width: video.videoWidth,
        height: video.videoHeight,
      });
    };
    video.addEventListener("loadedmetadata", onLoaded);
    return () => video.removeEventListener("loadedmetadata", onLoaded);
  }, [item.id, item.url]);

  // Pause when switching items / unmounting so only one expanded video plays.
  useEffect(() => {
    return () => videoRef.current?.pause();
  }, [item.id]);

  return (
    <ViewTransition
      name={`bulk-cell-${item.id}`}
      share="morph"
      enter="scale-in"
      exit="scale-out"
      default="none"
    >
      <Card className="overflow-hidden border-kumo-brand/30">
        <CardContent className="space-y-3 p-3 sm:p-4">
          <div className="flex items-start gap-2">
            <Checkbox
              checked={item.selected}
              onCheckedChange={(v) =>
                onPatch(item.id, { selected: v === true })
              }
              disabled={rowActive}
              aria-label={`Include ${item.name} in bulk export`}
              className="mt-0.5"
            />
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span
                className="truncate font-mono text-xs font-medium tabular-nums"
                title={item.name}
              >
                {item.baseName}
              </span>
              <span className="flex items-center gap-1.5 font-mono text-[11px] tabular-nums text-kumo-subtle">
                <span
                  className={cn(
                    "size-1.5 rounded-full",
                    statusColor(item.status),
                  )}
                  aria-hidden
                />
                {STATUS_LABEL[item.status]}
                <span aria-hidden>·</span>
                {item.duration > 0 ? formatTime(item.duration) : "…"}
                {item.width > 0 ? ` · ${item.width}×${item.height}` : ""}
              </span>
            </div>
            <Button
              size="icon"
              variant="ghost"
              onClick={onClose}
              aria-label={`Collapse ${item.baseName} preview`}
              title="Collapse preview"
              className="h-7 w-7 shrink-0"
            >
              <X className="size-4" aria-hidden />
            </Button>
          </div>

          <div
            ref={gridRef}
            className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-stretch"
          >
            <div className="flex min-w-0 flex-col space-y-1.5">
              <div className="font-mono text-[11px] tabular-nums text-kumo-subtle whitespace-nowrap">
                Source · 16:9
              </div>
              <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-lg border border-kumo-line bg-black">
                <video
                  ref={setVideoRefs}
                  src={item.url}
                  className="block aspect-video w-full md:aspect-auto md:h-full md:w-full md:object-contain"
                  playsInline
                  preload="metadata"
                  crossOrigin="anonymous"
                />
              </div>
            </div>
            <div className="space-y-1.5 justify-self-center md:justify-self-end">
              <div className="text-center font-mono text-[11px] tabular-nums text-kumo-subtle whitespace-nowrap md:text-right">
                Stacked · 9:16 2-zone
              </div>
              {stackedLayout && videoEl ? (
                <BulkLiveStackedPreview
                  video={videoEl}
                  layout={stackedLayout}
                  useWatermark={useWatermark}
                  height={stackH}
                />
              ) : (
                <div className="flex h-full w-50 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-kumo-line bg-kumo-recessed px-3 py-8 text-center">
                  <span className="font-mono text-[11px] tabular-nums text-kumo-warn">
                    no stacked layout
                  </span>
                  <span className="font-mono text-[11px] tabular-nums text-kumo-subtle">
                    save one in Mobile editor
                  </span>
                </div>
              )}
            </div>
          </div>

          <VideoPlayerControls
            isPlaying={player.isPlaying}
            currentTime={player.currentTime}
            duration={player.duration > 0 ? player.duration : item.duration}
            onTogglePlay={player.togglePlay}
            onSeek={player.seekTo}
            volume={player.volume}
            onVolumeChange={player.setVolume}
            muted={player.muted}
            onToggleMute={player.toggleMute}
            loop={player.loop}
            onToggleLoop={player.toggleLoop}
            onPlayFromStart={() => player.playFromStart(0)}
            playFromStartLabel="Play from start"
            playFromStartDisabled={
              (player.duration > 0 ? player.duration : item.duration) <= 0
            }
          />

          <BulkAudioPicker
            file={item.file}
            itemId={item.id}
            saved={item.audioTracks}
            disabled={rowActive}
            onPatch={onPatch}
          />

          {item.error ? (
            <p className="text-[11px] leading-4 text-kumo-warn wrap-break-word">
              {item.error}
            </p>
          ) : null}
        </CardContent>
      </Card>
    </ViewTransition>
  );
}
