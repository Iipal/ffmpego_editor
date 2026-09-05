"use client";

import { memo, useCallback, useEffect, useRef } from "react";
import {
  clamp,
  MIN_SPLIT,
  MAX_SPLIT,
  OUTPUT_W,
  OUTPUT_H,
} from "@/lib/mobile-layout";
import type { CropZone, MobileLayout } from "@/lib/mobile-layout";
import { ensureWatermark, wmImg } from "./helpers";

// ---------------------------------------------------------------------------
// Stacked 9:16 preview cell — static frame drawn from the file's own video
// ---------------------------------------------------------------------------

export const PREVIEW_W = 180;

export type CellPreviewProps = {
  url: string;
  layout: MobileLayout;
  useWatermark: boolean;
  onMeta: (meta: { duration: number; width: number; height: number }) => void;
};

export const CellPreview = memo(function CellPreview({
  url,
  layout,
  useWatermark,
  onMeta,
}: CellPreviewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const topRef = useRef<HTMLCanvasElement>(null);
  const bottomRef = useRef<HTMLCanvasElement>(null);
  const onMetaRef = useRef(onMeta);
  useEffect(() => {
    onMetaRef.current = onMeta;
  }, [onMeta]);

  const draw = useCallback(() => {
    const video = videoRef.current;
    if (!video || video.readyState < 2 || video.videoWidth === 0) return;
    const split = clamp(layout.splitRatio, MIN_SPLIT, MAX_SPLIT);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const totalH = PREVIEW_W * (OUTPUT_H / OUTPUT_W);
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
      canvas.width = Math.round(PREVIEW_W * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = `${PREVIEW_W}px`;
      canvas.style.height = `${h}px`;
      const ctx = canvas.getContext("2d");
      if (!ctx) continue;
      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, PREVIEW_W, h);
      const sx = Math.max(0, Math.round(zone.x * vw));
      const sy = Math.max(0, Math.round(zone.y * vh));
      const sw = Math.max(1, Math.round(zone.width * vw));
      const sh = Math.max(1, Math.round(zone.height * vh));
      const z = zone.zoom ?? 1;
      const zsw = sw / z;
      const zsh = sh / z;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(
        video,
        sx + (sw - zsw) / 2,
        sy + (sh - zsh) / 2,
        zsw,
        zsh,
        0,
        0,
        PREVIEW_W,
        h,
      );
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
          ctx.drawImage(img, 0, 0, 1080, 1920 * split, 0, 0, PREVIEW_W, h);
        } else {
          const h1 = 1920 * split;
          ctx.drawImage(img, 0, h1, 1080, 1920 - h1, 0, 0, PREVIEW_W, h);
        }
        ctx.restore();
      };
      drawWm(topRef.current, "top", totalH * split);
      drawWm(bottomRef.current, "bottom", totalH * (1 - split));
    }
  }, [layout, useWatermark]);

  // Redraw when layout / watermark toggles
  const drawRef = useRef(draw);
  useEffect(() => {
    drawRef.current = draw;
  }, [draw]);
  useEffect(() => {
    if (useWatermark) {
      void ensureWatermark().then(() => drawRef.current());
    } else {
      drawRef.current();
    }
  }, [useWatermark, layout]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const onLoaded = () => {
      const d = video.duration;
      onMetaRef.current({
        duration: Number.isFinite(d) ? d : 0,
        width: video.videoWidth,
        height: video.videoHeight,
      });
      // Seek slightly in so the preview frame is rarely black
      try {
        video.currentTime = Math.min(1, (Number.isFinite(d) ? d : 2) * 0.1);
      } catch {}
    };
    const onSeeked = () => drawRef.current();
    const onData = () => drawRef.current();
    video.addEventListener("loadedmetadata", onLoaded);
    video.addEventListener("seeked", onSeeked);
    video.addEventListener("loadeddata", onData);
    return () => {
      video.removeEventListener("loadedmetadata", onLoaded);
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("loadeddata", onData);
    };
  }, [url]);

  return (
    <div className="flex flex-col items-center">
      <video
        ref={videoRef}
        src={url}
        className="hidden"
        muted
        playsInline
        preload="auto"
        crossOrigin="anonymous"
      />
      <div className="overflow-hidden rounded-lg border border-kumo-line bg-black flex flex-col">
        <canvas ref={topRef} className="block" />
        <div className="h-0.5 shrink-0 bg-kumo-hairline" />
        <canvas ref={bottomRef} className="block" />
      </div>
    </div>
  );
});
