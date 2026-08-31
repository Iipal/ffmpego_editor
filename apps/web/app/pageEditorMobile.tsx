"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useVideoState, useVideoStore } from "@/store/useVideoStore";
import { useVideoMetadataMutation } from "@/hooks/useVideoMetadata";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { VideoUploader } from "@/components/editor/VideoUploader";
import { UploadProgress } from "@/components/editor/UploadProgress";
import {
  ACCEPTED_VIDEO_INPUT_ATTR,
  isAcceptedVideoFile,
  isFileTooLarge,
  formatFileSize,
  MAX_UPLOAD_BYTES,
} from "@/lib/video-file";
import { formatTime } from "@/lib/format-time";
import {
  zoneAspect,
  clamp,
  normalizeLayout,
  validateLayout,
  createDefaultLayout,
  autoSuggest,
  buildMobileFilter,
  savePref,
  loadPref,
  loadPrefForMode,
  resizeZoneAspectLocked,
  enforceZoneAspect,
  MIN_SPLIT,
  MAX_SPLIT,
  OUTPUT_W,
  OUTPUT_H,
} from "@/lib/mobile-layout";
import type { MobileLayout, CropZone } from "@/lib/mobile-layout";

type UndoEntry = MobileLayout;

function useMobileEditor() {
  const [layout, setLayout] = useState<MobileLayout>(
    () => loadPref() ?? createDefaultLayout("stacked", 0.5),
  );
  const [selected, setSelected] = useState<"zone-1" | "zone-2" | null>(
    "zone-1",
  );
  const [safe, setSafe] = useState(true);
  const [useWatermark, setUseWatermark] = useState(true);
  const [undo, setUndo] = useState<UndoEntry[]>([]);
  const [redo, setRedo] = useState<UndoEntry[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    try {
      localStorage.setItem("ffmpeg-mobile-layout-v1", JSON.stringify(layout));
    } catch {}
  }, [layout]);

  useEffect(() => {
    if (layout.mode === "full" && selected === "zone-2") setSelected("zone-1");
  }, [layout.mode, selected]);

  const push = useCallback(
    (next: MobileLayout) => {
      setUndo((p) => [...p.slice(-49), layout]);
      setRedo([]);
      setLayout(normalizeLayout(next));
    },
    [layout],
  );

  const commit = useCallback((fn: (l: MobileLayout) => MobileLayout) => {
    setLayout((prev) => {
      const n = normalizeLayout(fn(prev));
      setUndo((u) => [...u.slice(-49), prev]);
      setRedo([]);
      return n;
    });
  }, []);

  const undoOp = useCallback(() => {
    setUndo((u) => {
      if (!u.length) return u;
      const prev = u[u.length - 1];
      setRedo((r) => [...r, layout]);
      setLayout(prev);
      return u.slice(0, -1);
    });
  }, [layout]);

  const redoOp = useCallback(() => {
    setRedo((r) => {
      if (!r.length) return r;
      const nxt = r[r.length - 1];
      setUndo((u) => [...u, layout]);
      setLayout(nxt);
      return r.slice(0, -1);
    });
  }, [layout]);

  return {
    layout,
    setLayout: push,
    commit,
    selected,
    setSelected,
    safe,
    setSafe,
    useWatermark,
    setUseWatermark,
    undo,
    redo,
    undoOp,
    redoOp,
    isPlaying,
    setIsPlaying,
    currentTime,
    setCurrentTime,
    duration,
    setDuration,
  };
}

function SourceStage({
  layout,
  selected,
  onSelect,
  onMove,
  onResize,
  onZoom,
  videoRef,
  mediaUrl,
  volume,
  isMuted,
}: {
  layout: MobileLayout;
  selected: string | null;
  onSelect: (id: "zone-1" | "zone-2") => void;
  onMove: (id: string, dx: number, dy: number) => void;
  onResize: (id: string, zone: CropZone) => void;
  onZoom: (id: string, z: number) => void;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  mediaUrl: string | null;
  volume: number;
  isMuted: boolean;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    id: string;
    sx: number;
    sy: number;
    ox: number;
    oy: number;
  } | null>(null);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.volume = volume;
    v.muted = isMuted;
  }, [volume, isMuted, videoRef]);

  const onPointerDown = (e: React.PointerEvent, id: string, handle: string) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return;
    const zone = layout.zones.find((z) => z.id === id);
    if (!zone || zone.locked) return;
    onSelect(id as "zone-1" | "zone-2");
    if (handle === "move") {
      drag.current = {
        id,
        sx: e.clientX,
        sy: e.clientY,
        ox: zone.x,
        oy: zone.y,
      };
      const move = (ev: PointerEvent) => {
        if (!drag.current) return;
        const dx = (ev.clientX - drag.current.sx) / rect.width;
        const dy = (ev.clientY - drag.current.sy) / rect.height;
        onMove(id, drag.current.ox + dx, drag.current.oy + dy);
      };
      const up = () => {
        drag.current = null;
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
      return;
    }
    const start = { ...zone };
    const sx = e.clientX,
      sy = e.clientY;
    const move = (ev: PointerEvent) => {
      const dx = (ev.clientX - sx) / rect.width;
      const dy = (ev.clientY - sy) / rect.height;
      const next = resizeZoneAspectLocked(
        start,
        handle,
        dx,
        dy,
        layout.mode,
        layout.splitRatio,
      );
      onResize(id, next);
    };
    const up2 = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up2);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up2);
  };

  if (!mediaUrl)
    return (
      <div className="aspect-video flex items-center justify-center bg-kumo-recessed rounded-lg text-sm text-kumo-subtle">
        No video loaded
      </div>
    );
  return (
    <div
      ref={wrapRef}
      className="relative aspect-video w-full overflow-hidden rounded-lg bg-black select-none touch-none"
    >
      <video
        ref={videoRef}
        src={mediaUrl}
        className="absolute inset-0 size-full object-contain"
        playsInline
        preload="metadata"
      />
      {layout.zones.map((z) => (
        <div
          key={z.id}
          onPointerDown={(e) => onPointerDown(e, z.id, "move")}
          onClick={() => onSelect(z.id)}
          className={cn(
            "absolute border-2 cursor-move rounded-xs",
            selected === z.id
              ? "border-kumo-brand bg-kumo-brand/10"
              : "border-white/80 bg-white/5",
            z.locked && "opacity-60 cursor-not-allowed",
          )}
          style={{
            left: `${z.x * 100}%`,
            top: `${z.y * 100}%`,
            width: `${z.width * 100}%`,
            height: `${z.height * 100}%`,
          }}
        >
          <span
            className={cn(
              "absolute -top-5 left-0 text-[10px] px-1.5 py-0.5 rounded font-medium",
              selected === z.id
                ? "bg-kumo-brand text-white"
                : "bg-white/90 text-black",
            )}
          >
            {z.id === "zone-1" ? "ZONE 1" : "ZONE 2"}{" "}
            {z.role ? `· ${z.role}` : ""}
          </span>
          <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 opacity-30">
            <div className="border-r border-b border-white/40" />
            <div className="border-r border-b border-white/40" />
            <div className="border-b border-white/40" />
            <div className="border-r border-white/40" />
            <div className="border-r border-white/40" />
            <div />
            <div className="border-r border-white/40" />
            <div className="border-r border-white/40" />
            <div />
          </div>
          {selected === z.id &&
            !z.locked &&
            (["nw", "ne", "sw", "se"] as const).map((h) => (
              <div
                key={h}
                onPointerDown={(e) => onPointerDown(e, z.id, h)}
                className={cn(
                  "absolute size-2 rounded-full bg-kumo-brand border-2 border-white shadow-sm -m-1",
                  h === "nw" && "top-0 left-0 cursor-nw-resize",
                  h === "ne" && "top-0 right-0 cursor-ne-resize",
                  h === "sw" && "bottom-0 left-0 cursor-sw-resize",
                  h === "se" && "bottom-0 right-0 cursor-se-resize",
                )}
              />
            ))}
          {selected === z.id && !z.locked && (
            <div
              onPointerDown={(e) => {
                e.stopPropagation();
                const s = e.clientY;
                const start = z.zoom;
                const m = (ev: PointerEvent) => {
                  const dy = (s - ev.clientY) / 120;
                  onZoom(z.id, clamp(start + dy, 0.5, 3));
                };
                const u = () => {
                  window.removeEventListener("pointermove", m);
                  window.removeEventListener("pointerup", u);
                };
                window.addEventListener("pointermove", m);
                window.addEventListener("pointerup", u);
              }}
              className="absolute -right-8 top-1/2 -translate-y-1/2 w-1.5 h-16 bg-white/20 rounded-full cursor-ns-resize hidden sm:block"
            />
          )}
        </div>
      ))}
    </div>
  );
}

function PortraitPreview({
  layout,
  videoRef,
  onSplit,
  safe,
  useWatermark,
}: {
  layout: MobileLayout;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  onSplit: (v: number) => void;
  safe: boolean;
  useWatermark: boolean;
}) {
  const canvasFullRef = useRef<HTMLCanvasElement>(null);
  const canvasTopRef = useRef<HTMLCanvasElement>(null);
  const canvasBottomRef = useRef<HTMLCanvasElement>(null);
  const drag = useRef(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const watermarkImgRef = useRef<HTMLImageElement | null>(null);
  const [watermarkLoaded, setWatermarkLoaded] = useState(false);

  useEffect(() => {
    if (!useWatermark) return;
    const img = new window.Image();
    img.src = "/minozavr.png";
    img.onload = () => {
      watermarkImgRef.current = img;
      setWatermarkLoaded(true);
    };
    img.onerror = () => setWatermarkLoaded(false);
    return () => {
      // keep ref for reuse
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
      // zoom-aware: zoom shrinks crop centered
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
      // watermark source is 1080x1920, same aspect as preview
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
        const split = clamp(layout.splitRatio, MIN_SPLIT, MAX_SPLIT);
        const h1 = 1920 * split;
        ctx.drawImage(img, 0, 0, 1080, h1, 0, 0, w, h);
      } else {
        const split = clamp(layout.splitRatio, MIN_SPLIT, MAX_SPLIT);
        const h1 = 1920 * split;
        const h2 = 1920 - h1;
        ctx.drawImage(img, 0, h1, 1080, h2, 0, 0, w, h);
      }
      ctx.restore();
    },
    [useWatermark, watermarkLoaded, layout.splitRatio],
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
  }, [layout.mode, layout.splitRatio]);

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
    drawAll();
    const onSeeked = () => drawAll();
    const onLoadedData = () => {
      resizeCanvases();
      drawAll();
    };
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
  }, [
    layout,
    drawZone,
    drawWatermark,
    resizeCanvases,
    videoRef,
    useWatermark,
    watermarkLoaded,
  ]);

  // Redraw when watermark finishes loading or toggled (outside rvfc loop)
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    // force a redraw of current frame (drawWatermark internally checks flag)
    if (layout.mode === "full") {
      drawZone(canvasFullRef.current, layout.zones[0]);
      drawWatermark(canvasFullRef.current, "full");
    } else {
      drawZone(canvasTopRef.current, layout.zones[0]);
      drawWatermark(canvasTopRef.current, "top");
      drawZone(canvasBottomRef.current, layout.zones[1]);
      drawWatermark(canvasBottomRef.current, "bottom");
    }
  }, [
    watermarkLoaded,
    useWatermark,
    layout,
    drawZone,
    drawWatermark,
    videoRef,
  ]);

  const startDrag = (e: React.PointerEvent) => {
    if (layout.mode === "full") return;
    e.preventDefault();
    drag.current = true;
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return;
    const move = (ev: PointerEvent) => {
      if (!drag.current || !rect) return;
      const y = (ev.clientY - rect.top) / rect.height;
      onSplit(clamp(y, MIN_SPLIT, MAX_SPLIT));
    };
    const up = () => {
      drag.current = false;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const video = videoRef.current;
  if (!video || !video.src)
    return (
      <div className="mx-auto aspect-9/16 w-full max-w-70 rounded-xl border border-kumo-line bg-kumo-recessed flex items-center justify-center text-xs text-kumo-subtle">
        No preview
      </div>
    );

  if (layout.mode === "full") {
    return (
      <div className="flex flex-col items-center gap-2">
        <div
          ref={wrapRef}
          className="relative aspect-9/16 w-full max-w-70 overflow-hidden rounded-xl bg-black shadow-sm border border-kumo-line flex items-center justify-center"
        >
          <canvas ref={canvasFullRef} className="block max-w-full h-auto" />
          {safe && (
            <div className="absolute inset-3 rounded-md border border-white/20 pointer-events-none" />
          )}
          <span className="absolute top-1 left-1 text-[8px] bg-black/60 text-white px-1 rounded">
            FULL
          </span>
        </div>
        <div className="text-[10px] text-kumo-subtle tabular-nums">
          {OUTPUT_W} × {OUTPUT_H} · FULL 9:16
        </div>
      </div>
    );
  }

  const splitPx = layout.splitRatio;
  return (
    <div className="flex flex-col items-center gap-2">
      <div
        ref={wrapRef}
        className="relative aspect-9/16 w-full max-w-70 overflow-hidden rounded-xl bg-black shadow-sm border border-kumo-line flex flex-col"
      >
        <div
          className="relative overflow-hidden flex items-center justify-center"
          style={{ height: `${splitPx * 100}%` }}
        >
          <canvas ref={canvasTopRef} className="block" />
          {safe && (
            <div className="absolute inset-2 rounded-md border border-white/20 pointer-events-none" />
          )}
          <span className="absolute top-1 left-1 text-[8px] bg-black/60 text-white px-1 rounded">
            ZONE 1
          </span>
        </div>
        <div
          onPointerDown={startDrag}
          className="h-2 bg-kumo-recessed hover:bg-kumo-brand/10 border-y border-kumo-line cursor-row-resize flex items-center justify-center shrink-0 z-10"
        >
          <div className="h-0.5 w-8 bg-black/30 rounded" />
        </div>
        <div
          className="relative overflow-hidden flex items-center justify-center"
          style={{ height: `${(1 - splitPx) * 100}%` }}
        >
          <canvas ref={canvasBottomRef} className="block" />
          {safe && (
            <div className="absolute inset-2 rounded-md border border-white/20 pointer-events-none" />
          )}
          <span className="absolute top-1 left-1 text-[8px] bg-black/60 text-white px-1 rounded">
            ZONE 2
          </span>
        </div>
      </div>
      <div className="text-[10px] text-kumo-subtle tabular-nums">
        {OUTPUT_W} × {OUTPUT_H} · {(splitPx * 100).toFixed(0)}% /{" "}
        {((1 - splitPx) * 100).toFixed(0)}%
      </div>
    </div>
  );
}

function UploadOtherButton() {
  const inputRef = useRef<HTMLInputElement>(null);
  const videoStore = useVideoStore();
  const metadataMutation = useVideoMetadataMutation();
  const onPick = (file: File | undefined) => {
    if (!file) return;
    if (!isAcceptedVideoFile(file)) {
      toast.error("Unsupported format. Use MP4/WebM/MOV/MKV (Matroska)");
      return;
    }
    if (isFileTooLarge(file)) {
      toast.error(
        `File too large (${formatFileSize(file.size)}). Max ${formatFileSize(MAX_UPLOAD_BYTES)}.`,
      );
      return;
    }
    const mediaUrl = URL.createObjectURL(file);
    videoStore.setState((prev) => {
      if (prev.mediaUrl) URL.revokeObjectURL(prev.mediaUrl);
      return {
        ...prev,
        file,
        mediaUrl,
        currentTime: 0,
        duration: 0,
        isPlaying: false,
        sourceAspectRatio: 1,
        sourceWidth: 0,
        sourceHeight: 0,
        sourceFrameRate: 0,
        containerFormat: null,
        videoCodec: null,
        audioCodec: null,
        bitrateKbps: 0,
        ffprobeReport: null,
        transcodeStatus: "idle",
        transcodeProgress: 0,
        transcodeOutputPath: null,
        transcodeError: null,
      };
    });
    metadataMutation.mutate(file);
  };
  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_VIDEO_INPUT_ATTR}
        className="hidden"
        onChange={(e) => onPick(e.target.files?.[0])}
      />
      <Button
        size="sm"
        variant="outline"
        onClick={() => inputRef.current?.click()}
      >
        Upload other video
      </Button>
    </>
  );
}

export default function MobileEditorPage() {
  const {
    file,
    mediaUrl,
    duration: srcDuration,
    sourceWidth,
    sourceHeight,
    uploadStatus,
    trimRange,
  } = useVideoState();
  const videoStore = useVideoStore();
  const ed = useMobileEditor();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlayingLocal, setIsPlayingLocal] = useState(false);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isLoopTrim, setIsLoopTrim] = useState(false);

  const setTrimRange = useCallback(
    (
      updater:
        | [number, number]
        | ((prev: [number, number]) => [number, number]),
    ) => {
      videoStore.setState((prev) => ({
        ...prev,
        trimRange:
          typeof updater === "function"
            ? (updater as (p: [number, number]) => [number, number])(
                prev.trimRange,
              )
            : updater,
      }));
    },
    [videoStore],
  );

  const hasVideo = !!mediaUrl && !!file;
  const duration = ed.duration || srcDuration || 0;
  const trimStart = trimRange[0];
  const trimEnd = trimRange[1];
  const trimmedDuration = Math.max(0, trimEnd - trimStart);

  // init/clamp global trim when duration becomes available (preserves cross-page trim)
  useEffect(() => {
    if (duration > 0 && trimRange[1] === 0) {
      videoStore.setState((prev) =>
        prev.trimRange[1] === 0
          ? { ...prev, trimRange: [0, duration] as [number, number] }
          : prev,
      );
    } else if (duration > 0 && trimRange[1] > duration) {
      videoStore.setState((prev) => ({
        ...prev,
        trimRange: [Math.min(prev.trimRange[0], duration - 0.2), duration] as [
          number,
          number,
        ],
      }));
    }
  }, [duration, trimRange, videoStore]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onTime = () => {
      const t = v.currentTime;
      // loop by trimmed duration
      if (isLoopTrim && trimRange[1] > trimRange[0]) {
        if (t >= trimRange[1] - 0.05 || t < trimRange[0] - 0.01) {
          v.currentTime = trimRange[0];
          ed.setCurrentTime(trimRange[0]);
          return;
        }
      }
      // clamp display: if outside trim, still show but allow scrub
      ed.setCurrentTime(t);
    };
    const onMeta = () => {
      ed.setDuration(v.duration);
      const d = v.duration;
      if (Number.isFinite(d)) {
        videoStore.setState((prev) => {
          if (prev.trimRange[1] === 0 || prev.trimRange[1] > d)
            return {
              ...prev,
              trimRange: [0, d] as [number, number],
            } as typeof prev;
          return prev;
        });
      }
    };
    const onPlay = () => setIsPlayingLocal(true);
    const onPause = () => setIsPlayingLocal(false);
    const onEnded = () => {
      if (isLoopTrim && trimRange[1] > trimRange[0]) {
        v.currentTime = trimRange[0];
        v.play().catch(() => {});
      } else {
        setIsPlayingLocal(false);
      }
    };
    v.addEventListener("timeupdate", onTime);
    v.addEventListener("loadedmetadata", onMeta);
    v.addEventListener("play", onPlay);
    v.addEventListener("pause", onPause);
    v.addEventListener("ended", onEnded);
    return () => {
      v.removeEventListener("timeupdate", onTime);
      v.removeEventListener("loadedmetadata", onMeta);
      v.removeEventListener("play", onPlay);
      v.removeEventListener("pause", onPause);
      v.removeEventListener("ended", onEnded);
    };
  }, [mediaUrl, isLoopTrim, trimRange]);

  // RAF loop for smooth preview sync + loop check during playback
  useEffect(() => {
    if (!isPlayingLocal) return;
    let raf = 0;
    const loop = () => {
      const v = videoRef.current;
      if (v && !v.paused) {
        const t = v.currentTime;
        if (
          isLoopTrim &&
          trimRange[1] > trimRange[0] &&
          t >= trimRange[1] - 0.02
        ) {
          v.currentTime = trimRange[0];
        }
        ed.setCurrentTime(v.currentTime);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [isPlayingLocal, isLoopTrim, trimRange]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.volume = volume;
    v.muted = isMuted;
  }, [volume, isMuted]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (isPlayingLocal) v.play().catch(() => {});
    else v.pause();
  }, [isPlayingLocal]);

  const handleMove = useCallback(
    (id: string, nx: number, ny: number) => {
      ed.commit((prev) => {
        const zones = prev.zones.map((z) => {
          if (z.id !== id) return z;
          if (z.locked) return z;
          let x = clamp(nx, 0, 1 - z.width),
            y = clamp(ny, 0, 1 - z.height);
          if (Math.abs(x - (0.5 - z.width / 2)) < 0.015) x = 0.5 - z.width / 2;
          if (Math.abs(y - (0.5 - z.height / 2)) < 0.015)
            y = 0.5 - z.height / 2;
          return { ...z, x, y };
        });
        return { ...prev, zones };
      });
    },
    [ed.commit],
  );

  const handleResize = useCallback(
    (id: string, next: CropZone) => {
      ed.commit((prev) => {
        const zones = prev.zones.map((z) =>
          z.id === id && !z.locked
            ? enforceZoneAspect(next, prev.mode, prev.splitRatio)
            : z,
        );
        return { ...prev, zones };
      });
    },
    [ed.commit],
  );

  const handleZoom = useCallback(
    (id: string, factor: number) => {
      ed.commit((prev) => {
        const zones = prev.zones.map((z) => {
          if (z.id !== id || z.locked) return z;
          let zoom = clamp(typeof factor === "number" ? factor : 1, 0.5, 3);
          const baseW =
            prev.mode === "full" ? 0.316 : id === "zone-1" ? 0.32 : 0.42;
          const asp = zoneAspect(
            prev.mode,
            prev.splitRatio,
            id as "zone-1" | "zone-2",
          );
          const sourceAR = 16 / 9;
          let w = clamp(baseW / zoom, 0.08, 0.95);
          let h = clamp((w / asp) * sourceAR, 0.08, 0.95);
          let x = clamp(z.x + (z.width - w) / 2, 0, 1 - w);
          let y = clamp(z.y + (z.height - h) / 2, 0, 1 - h);
          return { ...z, x, y, width: w, height: h, zoom };
        });
        return { ...prev, zones };
      });
    },
    [ed.commit],
  );

  const handleSplit = useCallback(
    (v: number) =>
      ed.commit((p) => {
        const split = clamp(v, MIN_SPLIT, MAX_SPLIT);
        let zones = p.zones.map((z) => enforceZoneAspect(z, p.mode, split));
        zones = zones.map((z) => ({
          ...z,
          x: clamp(z.x, 0, 1 - z.width),
          y: clamp(z.y, 0, 1 - z.height),
        }));
        return { ...p, splitRatio: split, zones };
      }),
    [ed.commit],
  );

  const resetZone = (id: string) =>
    ed.commit((p) => {
      const def = createDefaultLayout(p.mode, p.splitRatio);
      const dz = def.zones.find((z) => z.id === id);
      if (!dz) return p;
      return { ...p, zones: p.zones.map((z) => (z.id === id ? dz : z)) };
    });

  const err = validateLayout(ed.layout);
  const [isExporting, setIsExporting] = useState(false);

  async function downloadAndSaveMobile(jobId: string, filename: string) {
    const { API_BASE_URL } = await import("@/lib/api-client");
    const downloadUrl = `${API_BASE_URL}/api/transcode/download/${jobId}`;
    const response = await fetch(downloadUrl);
    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;
      throw new Error(payload?.error ?? `Download failed: ${response.status}`);
    }
    const blob = await response.blob();
    const mimeType = "video/mp4";
    if ("showSaveFilePicker" in window) {
      try {
        const handle = await (
          window as unknown as {
            showSaveFilePicker: (o: {
              suggestedName?: string;
              types?: Array<{
                description?: string;
                accept: Record<string, string[]>;
              }>;
            }) => Promise<FileSystemFileHandle>;
          }
        ).showSaveFilePicker({
          suggestedName: filename,
          types: [
            { description: "MP4 video", accept: { [mimeType]: [".mp4"] } },
          ],
        });
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
        return handle.name;
      } catch (e) {
        if ((e as DOMException)?.name === "AbortError") throw e;
      }
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    return filename;
  }

  const onExport = async () => {
    if (!file) {
      toast.error("No video loaded");
      return;
    }
    if (err) {
      toast.error(err);
      return;
    }
    if (trimRange[1] <= trimRange[0] + 0.05) {
      toast.error("Invalid trim range");
      return;
    }
    const sw = sourceWidth || 1920,
      sh = sourceHeight || 1080;
    const filter = buildMobileFilter(ed.layout, sw, sh, ed.layout.splitRatio);
    savePref(ed.layout);
    const outName = file.name.replace(/\.[^.]+$/, "") + "_mobile_1080x1920.mp4";
    const baseName = outName.replace(/\.mp4$/, "");
    toast.info(`FFmpeg filter ready`, {
      description: filter.slice(0, 120) + "…",
    });
    const { API_BASE_URL } = await import("@/lib/api-client");
    const { shouldUseChunked, uploadFileChunked, uploadFormWithProgress } =
      await import("@/lib/upload-chunked");
    const vs = videoStore;
    setIsExporting(true);
    toast.loading("Exporting mobile mp4 (CRF 10)...", { id: "mobile-export" });
    try {
      const setUpload = (sent: number, total: number) =>
        vs.setState((p) => ({
          ...p,
          uploadStage: "transcode",
          uploadStatus: "uploading",
          uploadProgress: total ? Math.round((sent / total) * 100) : 0,
          uploadBytesSent: sent,
          uploadBytesTotal: total,
        }));
      vs.setState((p) => ({
        ...p,
        uploadStage: "transcode",
        uploadStatus: "uploading",
        uploadProgress: 0,
        uploadBytesSent: 0,
        uploadBytesTotal: file.size,
      }));
      const settingsJson = JSON.stringify({
        mobileLayout: ed.layout,
        sourceWidth: sw,
        sourceHeight: sh,
        trimRange,
        exportFormat: "mp4",
        exportFps: 30,
        exportFilename: baseName,
        exportQuality: 10,
        exportSpeed: 1,
        customFFmpegArgs: "",
        watermark: ed.useWatermark,
      });
      let res: Response;
      if (shouldUseChunked(file)) {
        const { uploadId } = await uploadFileChunked(file, {
          onProgress: setUpload,
        });
        setUpload(file.size, file.size);
        const fd2 = new FormData();
        fd2.append("settings", settingsJson);
        res = await fetch(`${API_BASE_URL}/api/transcode/mobile`, {
          method: "POST",
          headers: { "x-upload-id": uploadId },
          body: fd2,
        });
      } else {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("settings", settingsJson);
        // reuse XHR progress for small files so UploadProgress is accurate, then unwrap
        const json = await uploadFormWithProgress<{
          jobId: string;
          progressUrl: string;
        }>("/api/transcode/mobile", fd, { onUploadProgress: setUpload });
        // synthesize a Response-like object for the shared flow below
        res = new Response(JSON.stringify(json), { status: 200 });
      }
      // mark upload done before SSE
      vs.setState((p) => ({ ...p, uploadProgress: 100, uploadStatus: "done" }));
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(payload?.error ?? `Export failed: ${res.status}`);
      }
      const j = (await res.json()) as { jobId: string; progressUrl: string };
      const progressUrl = new URL(j.progressUrl, API_BASE_URL).toString();
      await new Promise<void>((resolve, reject) => {
        const source = new EventSource(progressUrl);
        source.onmessage = (event) => {
          try {
            const progress = JSON.parse(event.data) as {
              status: string;
              progress: number;
              error?: string;
            };
            if (progress.status === "processing") {
              toast.loading(
                `Exporting mobile mp4… ${Math.round(progress.progress)}%`,
                { id: "mobile-export" },
              );
            }
            if (progress.status === "completed") {
              source.close();
              resolve();
            }
            if (progress.status === "failed") {
              source.close();
              reject(new Error(progress.error ?? "Export failed"));
            }
          } catch {}
        };
        source.onerror = () => {
          source.close();
          reject(new Error("Lost connection to export progress"));
        };
      });
      toast.loading("Downloading file…", { id: "mobile-export" });
      const savedName = await downloadAndSaveMobile(j.jobId, outName);
      toast.success("Mobile video saved", {
        id: "mobile-export",
        description: savedName,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Export failed";
      if ((e as DOMException)?.name === "AbortError") {
        toast.dismiss("mobile-export");
        vs.setState((p) => ({ ...p, uploadStatus: "idle", uploadStage: null }));
      } else {
        toast.error(msg, { id: "mobile-export" });
        vs.setState((p) => ({ ...p, uploadStatus: "error" }));
        navigator.clipboard?.writeText(filter).catch(() => {});
      }
    } finally {
      setIsExporting(false);
    }
  };

  const setStartToCurrent = () => {
    const t = videoRef.current?.currentTime ?? ed.currentTime;
    setTrimRange(([s, e]) => {
      const ns = clamp(t, 0, e - 0.2);
      // if loop, jump to new start
      if (videoRef.current && isLoopTrim) videoRef.current.currentTime = ns;
      return [ns, e];
    });
  };
  const setEndToCurrent = () => {
    const t = videoRef.current?.currentTime ?? ed.currentTime;
    setTrimRange(([s, e]) => {
      const dur = duration || 30;
      const ne = clamp(t, s + 0.2, dur);
      return [s, ne];
    });
  };

  if (!hasVideo) {
    return (
      <div className="space-y-4">
        <Card className="p-6">
          <h2 className="text-base font-semibold">Mobile 9:16 Editor</h2>
          <p className="text-sm text-kumo-subtle mt-1">
            Convert your 16:9 landscape video into a 9:16 portrait with a
            stacked two-zone layout (e.g. camera + gameplay).
          </p>
          <div className="mt-6">
            <VideoUploader />
          </div>
        </Card>
        <Card className="p-4 opacity-60">
          <div className="grid md:grid-cols-2 gap-4">
            <div className="aspect-video rounded-lg bg-kumo-recessed flex items-center justify-center text-xs">
              16:9 SOURCE preview
            </div>
            <div className="flex justify-center">
              <div className="aspect-9/16 w-40 rounded-lg bg-kumo-recessed flex items-center justify-center text-xs">
                9:16 STACKED
              </div>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">Mobile Layout</h2>
          <p className="text-xs text-kumo-subtle">
            Static 16:9 → 9:16 · Two independent crop zones · Non-destructive
          </p>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap justify-end">
          <UploadOtherButton />
          <Button
            size="sm"
            variant="outline"
            onClick={ed.undoOp}
            disabled={!ed.undo.length}
          >
            Undo
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={ed.redoOp}
            disabled={!ed.redo.length}
          >
            Redo
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              const s = autoSuggest(ed.layout.mode, ed.layout.splitRatio);
              ed.setLayout(s);
              toast.success("Auto-crop suggested");
            }}
          >
            Auto-crop
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              const saved = loadPrefForMode(ed.layout.mode);
              if (saved) {
                ed.setLayout(saved);
                toast.info("Reset to saved layout");
              } else {
                ed.setLayout(createDefaultLayout(ed.layout.mode, 0.5));
                toast.info("No saved layout — reset to default");
              }
              if (duration > 0) setTrimRange([0, duration]);
              setVolume(1);
              setIsMuted(false);
              setIsLoopTrim(false);
              ed.setSafe(true);
              ed.setUseWatermark(true);
              ed.setSelected("zone-1");
            }}
          >
            Reset
          </Button>
          <Button size="sm" onClick={onExport} disabled={!!err || isExporting}>
            {isExporting ? "Exporting…" : "Export 9:16 (mp4 CRF 10)"}
          </Button>
        </div>
      </div>
      {(uploadStatus === "uploading" || uploadStatus === "error") && (
        <UploadProgress />
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.7fr)_320px]">
        <Card className="overflow-hidden">
          <CardHeader className="py-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">16:9 SOURCE</CardTitle>
              <div className="flex items-center gap-2">
                <Select
                  value={ed.layout.mode}
                  onValueChange={(v) => {
                    const mode = v as "full" | "stacked";
                    const saved = loadPrefForMode(mode);
                    if (saved) {
                      ed.setLayout(saved);
                    } else {
                      ed.setLayout(
                        createDefaultLayout(mode, ed.layout.splitRatio),
                      );
                    }
                  }}
                >
                  <SelectTrigger className="h-7 w-28 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="stacked">Stacked</SelectItem>
                    <SelectItem value="full">Full</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  size="xs"
                  variant={ed.selected === "zone-1" ? "default" : "outline"}
                  onClick={() => ed.setSelected("zone-1")}
                >
                  Zone 1
                </Button>
                <Button
                  size="xs"
                  variant={ed.selected === "zone-2" ? "default" : "outline"}
                  onClick={() => ed.setSelected("zone-2")}
                  disabled={ed.layout.mode === "full"}
                >
                  Zone 2
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <SourceStage
              layout={ed.layout}
              selected={ed.selected}
              onSelect={ed.setSelected}
              onMove={handleMove}
              onResize={handleResize}
              onZoom={handleZoom}
              videoRef={videoRef}
              mediaUrl={mediaUrl}
              volume={volume}
              isMuted={isMuted}
            />
            {/* Playback + volume + timeline */}
            <div className="flex items-center gap-2">
              <Button
                size="icon-sm"
                variant="outline"
                onClick={() => {
                  const v = videoRef.current;
                  if (!v || !duration) return;
                  v.currentTime = trimStart;
                  ed.setCurrentTime(trimStart);
                  if (!isPlayingLocal) setIsPlayingLocal(true);
                  else v.play().catch(() => {});
                }}
                aria-label="Play from trim start"
                title={`Seek to trim start ${formatTime(trimStart)}`}
                disabled={!duration}
              >
                ⏮
              </Button>
              <Button
                size="icon-sm"
                variant="outline"
                onClick={() => setIsPlayingLocal(!isPlayingLocal)}
                aria-label={isPlayingLocal ? "Pause" : "Play"}
              >
                {isPlayingLocal ? "⏸" : "▶"}
              </Button>
              <div className="flex items-center gap-1.5 shrink-0">
                <Button
                  size="icon-xs"
                  variant="ghost"
                  onClick={() => setIsMuted(!isMuted)}
                  aria-label={isMuted ? "Unmute" : "Mute"}
                  className="size-7"
                >
                  {isMuted ? "🔇" : volume > 0.5 ? "🔊" : "🔉"}
                </Button>
                <Slider
                  value={[isMuted ? 0 : volume * 100]}
                  min={0}
                  max={100}
                  step={1}
                  onValueChange={(v) => {
                    const val = Array.isArray(v)
                      ? (v[0] as number)
                      : (v as number);
                    setVolume(val / 100);
                    if (val > 0) setIsMuted(false);
                  }}
                  className="w-20"
                />
              </div>
              <Slider
                value={[ed.currentTime]}
                min={0}
                max={duration || 30}
                step={0.01}
                onValueChange={(v) => {
                  const t = Array.isArray(v) ? v[0] : v;
                  if (videoRef.current)
                    videoRef.current.currentTime = t as number;
                  ed.setCurrentTime(t as number);
                }}
                className="flex-1"
              />
              <span className="text-xs tabular-nums text-kumo-subtle w-20 text-right">
                {formatTime(ed.currentTime)} / {formatTime(duration)}
              </span>
              <Button
                size="xs"
                variant={isLoopTrim ? "default" : "outline"}
                onClick={() => setIsLoopTrim(!isLoopTrim)}
                title="Loop trimmed segment"
              >
                Loop {isLoopTrim ? "On" : "Off"}
              </Button>
            </div>
            {/* Trim controls */}
            <div className="rounded-lg border bg-kumo-recessed/20 p-3 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold">Trim</span>
                <span className="text-[11px] tabular-nums text-kumo-subtle">
                  {formatTime(trimStart)} → {formatTime(trimEnd)} ·{" "}
                  {formatTime(trimmedDuration)}
                </span>
              </div>
              <div className="space-y-1">
                <div className="relative py-2">
                  <Slider
                    value={[trimStart, trimEnd]}
                    min={0}
                    max={duration || 30}
                    step={0.05}
                    onValueChange={(v) => {
                      const vals = Array.isArray(v)
                        ? (v as number[])
                        : [v as number, duration];
                      const [ns, ne] = vals as [number, number];
                      if (ne - ns >= 0.2) setTrimRange([ns, ne]);
                    }}
                  />
                  {duration > 0 && (
                    <div
                      className={cn(
                        "pointer-events-none absolute top-1/2 -translate-y-1/2 -translate-x-1/2 z-10 flex flex-col items-center",
                        (ed.currentTime < trimStart - 0.02 ||
                          ed.currentTime > trimEnd + 0.02) &&
                          "opacity-40",
                      )}
                      style={{
                        left: `${clamp((ed.currentTime / duration) * 100, 0, 100)}%`,
                      }}
                      aria-hidden
                    >
                      <div className="size-2 rounded-full bg-kumo-brand border border-white shadow -mb-0.5" />
                      <div className="w-0.5 h-4 bg-kumo-brand rounded-full shadow" />
                    </div>
                  )}
                </div>
                <div className="flex justify-between text-[10px] text-kumo-subtle tabular-nums">
                  <span>Start {formatTime(trimStart)}</span>
                  <span>Duration {formatTime(trimmedDuration)}</span>
                  <span>End {formatTime(trimEnd)}</span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button size="sm" variant="outline" onClick={setStartToCurrent}>
                  Set Start to {formatTime(ed.currentTime)}
                </Button>
                <Button size="sm" variant="outline" onClick={setEndToCurrent}>
                  Set End to {formatTime(ed.currentTime)}
                </Button>
              </div>
              <div className="flex items-center justify-between">
                <Label className="text-xs">Loop trimmed</Label>
                <Switch checked={isLoopTrim} onCheckedChange={setIsLoopTrim} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {ed.layout.zones.map((z) => (
                <div
                  key={z.id}
                  className={cn(
                    "rounded-lg border p-2 space-y-2",
                    ed.selected === z.id
                      ? "border-kumo-brand bg-kumo-brand/5"
                      : "bg-kumo-recessed/30",
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium">
                      {z.id.toUpperCase()} {z.role ? `· ${z.role}` : ""}
                    </span>
                    <div className="flex gap-1">
                      <Button
                        size="xs"
                        variant="outline"
                        onClick={() => resetZone(z.id)}
                      >
                        Reset
                      </Button>
                      <Button
                        size="xs"
                        variant={z.locked ? "default" : "outline"}
                        onClick={() =>
                          ed.commit((p) => ({
                            ...p,
                            zones: p.zones.map((zz) =>
                              zz.id === z.id
                                ? { ...zz, locked: !zz.locked }
                                : zz,
                            ),
                          }))
                        }
                      >
                        {z.locked ? "🔒" : "🔓"}
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px]">
                      Zoom {z.zoom.toFixed(2)}×
                    </Label>
                    <Slider
                      value={[z.zoom]}
                      min={0.5}
                      max={3}
                      step={0.05}
                      onValueChange={(v) => {
                        const val = Array.isArray(v) ? v[0] : v;
                        handleZoom(z.id, val as number);
                      }}
                    />
                  </div>
                  <div className="flex gap-1">
                    {(["camera", "gameplay", "content"] as const).map((r) => (
                      <Button
                        key={r}
                        size="xs"
                        variant={z.role === r ? "default" : "outline"}
                        onClick={() =>
                          ed.commit((p) => ({
                            ...p,
                            zones: p.zones.map((zz) =>
                              zz.id === z.id ? { ...zz, role: r } : zz,
                            ),
                          }))
                        }
                        className="text-[10px] h-6 px-2"
                      >
                        {r}
                      </Button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            {err && <p className="text-xs text-destructive">{err}</p>}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm">
                9:16 PREVIEW ·{" "}
                {ed.layout.mode === "stacked" ? "Stacked" : "Full"}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <PortraitPreview
                layout={ed.layout}
                videoRef={videoRef}
                onSplit={handleSplit}
                safe={ed.safe}
                useWatermark={ed.useWatermark}
              />
              <div className="space-y-2 pt-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">
                    Split {Math.round(ed.layout.splitRatio * 100)}% /{" "}
                    {Math.round((1 - ed.layout.splitRatio) * 100)}%
                  </Label>
                  <span className="text-[10px] text-kumo-subtle">
                    drag divider or slider
                  </span>
                </div>
                <Slider
                  value={[ed.layout.splitRatio]}
                  min={MIN_SPLIT}
                  max={MAX_SPLIT}
                  step={0.01}
                  onValueChange={(v) =>
                    handleSplit(
                      Array.isArray(v) ? (v[0] as number) : (v as number),
                    )
                  }
                  disabled={ed.layout.mode === "full"}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label className="text-xs">Safe area</Label>
                <Switch checked={ed.safe} onCheckedChange={ed.setSafe} />
              </div>
              <div className="flex items-center justify-between">
                <Label className="text-xs">Use watermark</Label>
                <Switch
                  checked={ed.useWatermark}
                  onCheckedChange={ed.setUseWatermark}
                />
              </div>
              <div className="grid grid-cols-3 gap-1.5 pt-1">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    ed.setLayout(autoSuggest("stacked", 0.5));
                  }}
                >
                  Accept
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    ed.setSelected(
                      ed.selected === "zone-1" ? "zone-2" : "zone-1",
                    )
                  }
                >
                  Adjust
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    ed.setLayout(createDefaultLayout("stacked", 0.5));
                  }}
                >
                  Dismiss
                </Button>
              </div>
              <Button
                className="w-full"
                onClick={() => {
                  savePref(ed.layout);
                  toast.success("Layout saved as default");
                }}
              >
                Save preference
              </Button>
              <p className="text-[10px] leading-3 text-kumo-subtle">
                Static zones across trimmed clip. Final render 1080×1920 · same
                geometry as preview. Trim applied to export.
              </p>
            </CardContent>
          </Card>
          <Card className="p-3 space-y-2">
            <div className="text-xs font-medium">FFmpeg</div>
            <code className="block text-[10px] leading-3 break-all bg-kumo-recessed p-2 rounded">
              {buildMobileFilter(
                ed.layout,
                sourceWidth || 1920,
                sourceHeight || 1080,
                ed.layout.splitRatio,
              )}
            </code>
            <div className="text-[11px] tabular-nums text-kumo-subtle space-y-1">
              <div className="flex justify-between">
                <span>Trim</span>
                <span>
                  {formatTime(trimStart)} → {formatTime(trimEnd)}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Duration</span>
                <span>{formatTime(trimmedDuration)}</span>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
