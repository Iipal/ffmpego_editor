"use client";
import { useCallback, useEffect, useRef } from "react";
import type { MobileLayout, CropZone } from "@/lib/mobile-layout";
import { OUTPUT_W, OUTPUT_H } from "@/lib/mobile-layout";

interface MobilePreviewSharedProps {
  layout: MobileLayout;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  onSplit?: (v: number) => void;
  safe?: boolean;
  showBg?: boolean;
  // overlay children rendered inside 9:16 container (e.g. subtitles)
  overlay?: React.ReactNode;
  interactiveSplit?: boolean;
  /** Height of the 9:16 preview in px. When provided, canvas resolution scales with height (textarea-like resize). */
  height?: number;
}

function drawZone(
  canvas: HTMLCanvasElement | null,
  zone: CropZone,
  video: HTMLVideoElement,
  showBg: boolean,
) {
  if (!canvas || !video || video.readyState < 2 || video.videoWidth === 0)
    return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  const sx = Math.max(0, Math.round(zone.x * vw));
  const sy = Math.max(0, Math.round(zone.y * vh));
  const sw = Math.max(1, Math.round(zone.width * vw));
  const sh = Math.max(1, Math.round(zone.height * vh));
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = canvas.width / dpr;
  const h = canvas.height / dpr;
  ctx.save();
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, w, h);
  if (showBg) {
    ctx.filter = "blur(18px)";
    ctx.drawImage(video, 0, 0, vw, vh, -10, -10, w + 20, h + 20);
    ctx.filter = "none";
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fillRect(0, 0, w, h);
  } else {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, w, h);
  }
  const z = zone.zoom ?? 1;
  const zsw = sw / z;
  const zsh = sh / z;
  const zsx = sx + (sw - zsw) / 2;
  const zsy = sy + (sh - zsh) / 2;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(video, zsx, zsy, zsw, zsh, 0, 0, w, h);
  ctx.restore();
}

export function MobilePreviewShared({
  layout,
  videoRef,
  onSplit,
  safe = true,
  showBg = true,
  overlay,
  interactiveSplit = false,
  height,
}: MobilePreviewSharedProps) {
  const isResizable = typeof height === "number";
  const canvasFullRef = useRef<HTMLCanvasElement>(null);
  const canvasTopRef = useRef<HTMLCanvasElement>(null);
  const canvasBottomRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const resizeCanvases = useCallback(() => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    // When height provided (resizable 9:16 preview), scale canvas to fill zones — keeps 9/16, video fills scaled zones
    const baseW = isResizable && height ? Math.round((height * 9) / 16) : 270;
    if (layout.mode === "full") {
      const c = canvasFullRef.current;
      if (c) {
        c.width = Math.round(baseW * dpr);
        c.height = Math.round(baseW * (OUTPUT_H / OUTPUT_W) * dpr);
        c.style.width = `${baseW}px`;
        c.style.height = `${baseW * (OUTPUT_H / OUTPUT_W)}px`;
      }
    } else {
      const top = canvasTopRef.current;
      const bottom = canvasBottomRef.current;
      const split = layout.splitRatio;
      const totalH = baseW * (OUTPUT_H / OUTPUT_W);
      if (top) {
        const h = totalH * split;
        top.width = Math.round(baseW * dpr);
        top.height = Math.round(h * dpr);
        top.style.width = `${baseW}px`;
        top.style.height = `${h}px`;
      }
      if (bottom) {
        const h = totalH * (1 - split);
        bottom.width = Math.round(baseW * dpr);
        bottom.height = Math.round(h * dpr);
        bottom.style.width = `${baseW}px`;
        bottom.style.height = `${h}px`;
      }
    }
  }, [layout.mode, layout.splitRatio, height, isResizable]);

  const drawAll = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (layout.mode === "full") {
      drawZone(canvasFullRef.current, layout.zones[0], video, showBg);
    } else {
      drawZone(canvasTopRef.current, layout.zones[0], video, showBg);
      drawZone(canvasBottomRef.current, layout.zones[1], video, showBg);
    }
  }, [layout, videoRef, showBg]);

  useEffect(() => {
    resizeCanvases();
    const video = videoRef.current;
    if (!video) return;
    let raf = 0;
    let rvfcId = 0 as unknown as number;
    const hasRvfc =
      typeof (
        video as unknown as {
          requestVideoFrameCallback?: (cb: () => void) => number;
        }
      ).requestVideoFrameCallback === "function";
    let running = true;
    const loop = () => {
      if (!running) return;
      drawAll();
      if (!video.paused && !video.ended) raf = requestAnimationFrame(loop);
      else raf = 0;
    };
    const onRvfc = () => {
      if (!running) return;
      drawAll();
      rvfcId = (
        video as unknown as {
          requestVideoFrameCallback: (cb: () => void) => number;
        }
      ).requestVideoFrameCallback(onRvfc);
    };
    const onPlay = () => {
      if (!hasRvfc && raf === 0) raf = requestAnimationFrame(loop);
    };
    const onPause = () => drawAll();
    const onSeeked = () => drawAll();
    const onLoadedData = () => {
      resizeCanvases();
      drawAll();
    };
    drawAll();
    video.addEventListener("seeked", onSeeked);
    video.addEventListener("loadeddata", onLoadedData);
    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    video.addEventListener("timeupdate", onSeeked);
    if (hasRvfc) {
      rvfcId = (
        video as unknown as {
          requestVideoFrameCallback: (cb: () => void) => number;
        }
      ).requestVideoFrameCallback(onRvfc);
    } else if (!video.paused) {
      raf = requestAnimationFrame(loop);
    }
    return () => {
      running = false;
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("loadeddata", onLoadedData);
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("timeupdate", onSeeked);
      cancelAnimationFrame(raf);
      if (hasRvfc && rvfcId) {
        try {
          (
            video as unknown as {
              cancelVideoFrameCallback: (id: number) => void;
            }
          ).cancelVideoFrameCallback(rvfcId);
        } catch {}
      }
    };
  }, [layout, drawAll, resizeCanvases, videoRef, showBg]);

  const startDrag = (e: React.PointerEvent) => {
    if (!interactiveSplit || layout.mode === "full" || !onSplit) return;
    e.preventDefault();
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return;
    let dragging = true;
    const move = (ev: PointerEvent) => {
      if (!dragging || !rect) return;
      const y = (ev.clientY - rect.top) / rect.height;
      const clamped = Math.max(0.2, Math.min(0.8, y));
      onSplit(clamped);
    };
    const up = () => {
      dragging = false;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const video = videoRef.current;
  if (!video || !video.src)
    return (
      <div className="mx-auto flex aspect-9/16 w-full max-w-70 items-center justify-center rounded-xl border border-dashed border-kumo-line bg-kumo-recessed text-xs leading-4 text-kumo-subtle">
        <span className="font-mono text-[11px] tabular-nums">Preview appears after upload</span>
      </div>
    );

  if (layout.mode === "full") {
    return (
      <div
        className={`flex flex-col items-center gap-2 ${isResizable ? "w-full h-full" : ""}`}
      >
        <div
          ref={wrapRef}
          className={
            isResizable
              ? "relative w-full h-full overflow-hidden rounded-lg bg-black shadow-sm flex items-center justify-center"
              : "relative aspect-9/16 w-full max-w-70 overflow-hidden rounded-lg bg-black shadow-sm border border-kumo-line flex items-center justify-center"
          }
        >
          <canvas ref={canvasFullRef} className="block max-w-full h-auto" />
          {safe && (
            <div className="absolute inset-3 rounded-md border border-white/20 pointer-events-none" />
          )}
          <span className="absolute left-1.5 top-1.5 inline-flex items-center rounded-md border border-white/15 bg-black/55 px-1.5 py-0.5 font-mono text-[11px] font-medium leading-none text-white tabular-nums shadow-sm">
            Full
          </span>
          {overlay && (
            <div className="absolute inset-0 pointer-events-none flex flex-col">
              {overlay}
            </div>
          )}
        </div>
        <div className="font-mono text-[11px] tabular-nums text-kumo-subtle">
          {OUTPUT_W} × {OUTPUT_H} · Full 9:16
        </div>
      </div>
    );
  }

  const splitPx = layout.splitRatio;
  return (
    <div
      className={`flex flex-col items-center gap-2 ${isResizable ? "w-full h-full" : ""}`}
    >
      <div
        ref={wrapRef}
        className={
          isResizable
            ? "relative w-full h-full overflow-hidden rounded-lg bg-black shadow-[0_1px_2px_rgba(0,0,0,0.05)] flex flex-col"
            : "relative aspect-9/16 w-full max-w-70 overflow-hidden rounded-lg border border-kumo-line bg-black shadow-[0_1px_2px_rgba(0,0,0,0.05)] flex flex-col"
        }
      >
        <div
          className="relative overflow-hidden flex items-center justify-center"
          style={{ height: `${splitPx * 100}%` }}
        >
          <canvas ref={canvasTopRef} className="block" />
          {safe && (
            <div className="absolute inset-2 rounded-md border border-white/20 pointer-events-none" />
          )}
          <span className="absolute left-1.5 top-1.5 inline-flex items-center rounded-md border border-white/15 bg-black/55 px-1.5 py-0.5 font-mono text-[11px] font-medium leading-none text-white tabular-nums shadow-sm">
            Zone 1
          </span>
        </div>
        <div
          onPointerDown={startDrag}
          className={
            interactiveSplit
              ? "h-2 shrink-0 z-10 flex items-center justify-center cursor-row-resize border-y border-kumo-hairline bg-kumo-recessed hover:bg-kumo-line/60 transition-colors"
              : "h-2 shrink-0 flex items-center justify-center border-y border-kumo-hairline bg-kumo-recessed"
          }
        >
          <div className="h-0.5 w-8 rounded bg-kumo-subtle/50" />
        </div>
        <div
          className="relative overflow-hidden flex items-center justify-center"
          style={{ height: `${(1 - splitPx) * 100}%` }}
        >
          <canvas ref={canvasBottomRef} className="block" />
          {safe && (
            <div className="absolute inset-2 rounded-md border border-white/20 pointer-events-none" />
          )}
          <span className="absolute left-1.5 top-1.5 inline-flex items-center rounded-md border border-white/15 bg-black/55 px-1.5 py-0.5 font-mono text-[11px] font-medium leading-none text-white tabular-nums shadow-sm">
            Zone 2
          </span>
        </div>
        {overlay && (
          <div className="absolute inset-0 pointer-events-none flex flex-col">
            {overlay}
          </div>
        )}
      </div>
      <div className="font-mono text-[11px] tabular-nums text-kumo-subtle">
        {OUTPUT_W} × {OUTPUT_H} · {(splitPx * 100).toFixed(0)}% /{" "}
        {((1 - splitPx) * 100).toFixed(0)}%
      </div>
    </div>
  );
}
