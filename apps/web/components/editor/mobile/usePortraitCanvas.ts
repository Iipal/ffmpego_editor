"use client";

import { useCallback, useDeferredValue, useEffect, useRef, useState } from "react";
import {
  clamp,
  MAX_SPLIT,
  MIN_SPLIT,
  OUTPUT_H,
  OUTPUT_W,
} from "@/lib/mobile-layout";
import type { CropZone, MobileLayout } from "@/lib/mobile-layout";

type CanvasRefs = {
  canvasFullRef: React.RefObject<HTMLCanvasElement | null>;
  canvasTopRef: React.RefObject<HTMLCanvasElement | null>;
  canvasBottomRef: React.RefObject<HTMLCanvasElement | null>;
  wrapRef: React.RefObject<HTMLDivElement | null>;
  deferredSplit: number;
  startDrag: (e: React.PointerEvent) => void;
};

export function usePortraitCanvas(
  layout: MobileLayout,
  videoRef: React.RefObject<HTMLVideoElement | null>,
  onSplit: (v: number) => void,
  useWatermark: boolean,
): CanvasRefs {
  const canvasFullRef = useRef<HTMLCanvasElement>(null);
  const canvasTopRef = useRef<HTMLCanvasElement>(null);
  const canvasBottomRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const watermarkImgRef = useRef<HTMLImageElement | null>(null);
  const [watermarkLoaded, setWatermarkLoaded] = useState(false);
  const isDraggingRef = useRef(false);

  const deferredSplit = useDeferredValue(layout.splitRatio);

  useEffect(() => {
    if (!useWatermark) return;
    let cancelled = false;
    const img = new window.Image();
    img.src = "/minozavr.png";
    img.onload = () => {
      if (cancelled) return;
      watermarkImgRef.current = img;
      setWatermarkLoaded(true);
    };
    img.onerror = () => {
      if (!cancelled) setWatermarkLoaded(false);
    };
    return () => {
      cancelled = true;
    };
  }, [useWatermark]);

  const drawZone = useCallback(
    (canvas: HTMLCanvasElement | null, zone: CropZone) => {
      const video = videoRef.current;
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
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, w, h);
      const z = zone.zoom ?? 1;
      const zsw = sw / z;
      const zsh = sh / z;
      const zsx = sx + (sw - zsw) / 2;
      const zsy = sy + (sh - zsh) / 2;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(video, zsx, zsy, zsw, zsh, 0, 0, w, h);
      ctx.restore();
    },
    [videoRef],
  );

  const drawWatermark = useCallback(
    (canvas: HTMLCanvasElement | null, slice: "full" | "top" | "bottom") => {
      if (
        !useWatermark ||
        !watermarkLoaded ||
        !watermarkImgRef.current ||
        !canvas
      )
        return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = canvas.width / dpr;
      const h = canvas.height / dpr;
      const img = watermarkImgRef.current;
      ctx.save();
      ctx.scale(dpr, dpr);
      if (slice === "full") {
        ctx.drawImage(
          img,
          0,
          0,
          img.naturalWidth || 1080,
          img.naturalHeight || 1920,
          0,
          0,
          w,
          h,
        );
      } else if (slice === "top") {
        const split = clamp(deferredSplit, MIN_SPLIT, MAX_SPLIT);
        const h1 = 1920 * split;
        ctx.drawImage(img, 0, 0, 1080, h1, 0, 0, w, h);
      } else {
        const split = clamp(deferredSplit, MIN_SPLIT, MAX_SPLIT);
        const h1 = 1920 * split;
        const h2 = 1920 - h1;
        ctx.drawImage(img, 0, h1, 1080, h2, 0, 0, w, h);
      }
      ctx.restore();
    },
    [useWatermark, watermarkLoaded, deferredSplit],
  );

  const resizeCanvases = useCallback(() => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const baseW = 270;
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
      const split = deferredSplit;
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
  }, [layout.mode, deferredSplit]);

  useEffect(() => {
    resizeCanvases();
  }, [resizeCanvases]);

  useEffect(() => {
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

    const drawAll = () => {
      if (layout.mode === "full") {
        drawZone(canvasFullRef.current, layout.zones[0]);
        drawWatermark(canvasFullRef.current, "full");
      } else {
        drawZone(canvasTopRef.current, layout.zones[0]);
        drawWatermark(canvasTopRef.current, "top");
        drawZone(canvasBottomRef.current, layout.zones[1]);
        drawWatermark(canvasBottomRef.current, "bottom");
      }
    };

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
    video.addEventListener("timeupdate", onSeeked, {
      passive: true,
    } as AddEventListenerOptions);

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
  }, [layout, drawZone, drawWatermark, resizeCanvases, videoRef]);

  useEffect(() => {
    if (layout.mode === "full") {
      drawZone(canvasFullRef.current, layout.zones[0]);
      drawWatermark(canvasFullRef.current, "full");
    } else {
      drawZone(canvasTopRef.current, layout.zones[0]);
      drawWatermark(canvasTopRef.current, "top");
      drawZone(canvasBottomRef.current, layout.zones[1]);
      drawWatermark(canvasBottomRef.current, "bottom");
    }
  }, [watermarkLoaded, useWatermark, layout, drawZone, drawWatermark]);

  const startDrag = useCallback(
    (e: React.PointerEvent) => {
      if (layout.mode === "full") return;
      e.preventDefault();
      isDraggingRef.current = true;
      const rect = wrapRef.current?.getBoundingClientRect();
      if (!rect) return;
      const onMove = (ev: PointerEvent) => {
        if (!isDraggingRef.current || !rect) return;
        const y = (ev.clientY - rect.top) / rect.height;
        onSplit(clamp(y, MIN_SPLIT, MAX_SPLIT));
      };
      const onUp = () => {
        isDraggingRef.current = false;
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [layout.mode, onSplit],
  );

  return {
    canvasFullRef,
    canvasTopRef,
    canvasBottomRef,
    wrapRef,
    deferredSplit,
    startDrag,
  };
}
