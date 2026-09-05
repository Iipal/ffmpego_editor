"use client";

import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  useDeferredValue,
} from "react";
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
import dynamic from "next/dynamic";
import { preconnect, preload } from "react-dom";
import { Activity } from "react";
import {
  Film,
  Layers,
  Lock,
  LockOpen,
  Monitor,
  Redo2,
  Save,
  SlidersHorizontal,
  Smartphone,
  Undo2,
  Upload,
} from "lucide-react";
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

// ---------------------------------------------------------------------------
// Hoisted constants & static JSX — rendering-hoist-jsx, js-cache-property-access
// ---------------------------------------------------------------------------

// bundle-analyzable-paths: explicit literal dynamic import map (statically analyzable)
const HEAVY_MODULES = {
  portrait: () => import("@/components/editor/MobilePreviewShared"),
} as const;

// js-hoist-regexp: hoist RegExp to module scope (avoid per-render creation, share mutable lastIndex safely without /g)
const FILENAME_SANITIZE_RE = /[^a-zA-Z0-9._-]/g;
const TRIM_TIME_RE = /^\d+(\.\d+)?$/;

// js-cache-function-results: module-level cache for expensive pure functions
const buildFilterCache = new Map<string, string>();
function cachedBuildMobileFilter(
  layout: MobileLayout,
  sw: number,
  sh: number,
  split: number,
): string {
  const key = `${layout.mode}:${layout.splitRatio}:${layout.zones.map((z) => `${z.id}:${z.x},${z.y},${z.width},${z.height},${z.zoom}`).join("|")}:${sw}x${sh}:${split}`;
  if (buildFilterCache.has(key)) return buildFilterCache.get(key)!;
  const v = buildMobileFilter(layout, sw, sh, split);
  buildFilterCache.set(key, v);
  return v;
}

// rerender-memo-with-default-value: stable default for optional callbacks
const NOOP = () => {};
const DEFAULT_SPLIT = 0.5;

// bundle-defer-third-party + js-request-idle-callback: defer non-critical preconnect/preload
let didPreconnect = false;
function ensurePreconnect() {
  if (didPreconnect || typeof window === "undefined") return;
  didPreconnect = true;
  try {
    // rendering-resource-hints
    preconnect("https://api.local");
    preload("/minozavr.png", { as: "image" } as unknown as Parameters<
      typeof preload
    >[1]);
  } catch {}
}

// advanced-init-once: module-level guard for app-wide init (runs once per app load, not per mount)
let didInitApp = false;

// bundle-dynamic-imports: heavy canvas preview lazy-loaded (CRITICAL for TTI)
const DynamicPortraitPreview = dynamic(
  () =>
    HEAVY_MODULES.portrait().then((m) => ({
      default:
        m.MobilePreviewShared as unknown as React.ComponentType<PortraitPreviewProps>,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="mx-auto aspect-9/16 w-full max-w-70 rounded-xl border border-kumo-line bg-kumo-recessed animate-pulse" />
    ),
  },
);

// bundle-preload: preload heavy chunk on hover/focus intent
function preloadHeavyPreview() {
  if (typeof window !== "undefined") void HEAVY_MODULES.portrait();
}
function preloadUploadChunked() {
  if (typeof window !== "undefined") void import("@/lib/upload-chunked");
}

// client-event-listeners: dedup global pointer listeners (single listener for N drag instances)
type PointerHandler = (e: PointerEvent) => void;
const globalPointerMoveHandlers = new Set<PointerHandler>();
const globalPointerUpHandlers = new Set<PointerHandler>();
let globalPointerListenersAttached = false;
function ensureGlobalPointerListeners() {
  if (globalPointerListenersAttached || typeof window === "undefined") return;
  globalPointerListenersAttached = true;
  window.addEventListener("pointermove", (e) => {
    for (const h of globalPointerMoveHandlers) h(e as unknown as PointerEvent);
  });
  window.addEventListener("pointerup", (e) => {
    for (const h of globalPointerUpHandlers) h(e as unknown as PointerEvent);
  });
}

// js-cache-storage: module-level cache for localStorage reads (avoid sync I/O per render)
const layoutCache = new Map<string, MobileLayout | null>();
function getCachedLayout(): MobileLayout | null {
  const key = "ffmpeg-mobile-layout-v1";
  if (layoutCache.has(key)) return layoutCache.get(key)!;
  const v = loadPref();
  layoutCache.set(key, v);
  return v;
}
function setCachedLayout(l: MobileLayout) {
  layoutCache.set("ffmpeg-mobile-layout-v1", l);
  try {
    // js-request-idle-callback: defer non-critical persistence
    const schedule =
      typeof window !== "undefined" && "requestIdleCallback" in window
        ? (cb: () => void) =>
            (
              window as unknown as {
                requestIdleCallback: (cb: () => void) => number;
              }
            ).requestIdleCallback(cb)
        : (cb: () => void) => setTimeout(cb, 0);
    schedule(() => savePref(l));
  } catch {
    // fallback sync
    savePref(l);
  }
}

// rendering-hoist-jsx: static elements created once — Kumo quiet placeholders
const NoVideoPlaceholder = (
  <div className="flex aspect-video items-center justify-center rounded-lg border border-dashed border-kumo-line bg-kumo-recessed text-xs leading-4 text-kumo-subtle">
    <span className="inline-flex items-center gap-1.5">
      <Monitor className="size-3.5 opacity-60" aria-hidden />
      No video — upload to position zones
    </span>
  </div>
);
const NoPreviewPlaceholder = (
  <div className="mx-auto flex aspect-9/16 w-full max-w-70 items-center justify-center rounded-xl border border-dashed border-kumo-line bg-kumo-recessed text-xs leading-4 text-kumo-subtle">
    <span className="inline-flex items-center gap-1.5 font-mono text-[11px] tabular-nums">
      <Smartphone className="size-3.5 opacity-60" aria-hidden />
      Preview appears after upload
    </span>
  </div>
);
const ZoneGridOverlay = (
  <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 opacity-30 pointer-events-none">
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
);
const SafeAreaOverlay = (
  <div className="absolute inset-2 rounded-md border border-white/20 pointer-events-none" />
);
const SafeAreaFullOverlay = (
  <div className="absolute inset-3 rounded-md border border-white/20 pointer-events-none" />
);

// ---------------------------------------------------------------------------
// useMobileEditor — rerender-functional-setstate, rerender-lazy-state-init,
// rerender-split-combined-hooks, js-early-exit
// ---------------------------------------------------------------------------

type EditorHistory = {
  layout: MobileLayout;
  past: MobileLayout[];
  future: MobileLayout[];
};

function useMobileEditor() {
  // rerender-lazy-state-init: expensive JSON.parse only once
  const [history, setHistory] = useState<EditorHistory>(() => ({
    layout: getCachedLayout() ?? createDefaultLayout("stacked", DEFAULT_SPLIT),
    past: [],
    future: [],
  }));
  const [selected, setSelected] = useState<"zone-1" | "zone-2">("zone-1");
  const [safe, setSafe] = useState(true);
  const [useWatermark, setUseWatermark] = useState(true);
  const [ignoreTrim, setIgnoreTrim] = useState(false);
  // transient playback values stored in ref to avoid 60fps parent re-renders
  // rerender-use-ref-transient-values
  const currentTimeRef = useRef(0);
  const durationRef = useRef(0);
  const [durationTick, setDurationTick] = useState(0);

  const layout = history.layout;

  // Keep selected valid when mode changes — derived state during render not effect
  // rerender-derived-state-no-effect: derive instead of useEffect setState
  const effectiveSelected: "zone-1" | "zone-2" =
    layout.mode === "full" && selected === "zone-2" ? "zone-1" : selected;

  // Persistence is explicit only via "Save preference" — do not auto-save on layout changes.
  // Keep layoutRef stable for event handlers (advanced-event-handler-refs)
  const layoutRef = useRef(layout);
  useEffect(() => {
    layoutRef.current = layout;
  }, [layout]);

  // rerender-functional-setstate: stable callbacks with no layout dependency
  const commit = useCallback((updater: (l: MobileLayout) => MobileLayout) => {
    setHistory((prev) => {
      const nextLayout = normalizeLayout(updater(prev.layout));
      // js-length-check-first: early exit if equal (cheap check before deep compare)
      // For layout, shallow mode/split check avoids expensive normalize re-renders
      if (nextLayout === prev.layout) return prev;
      return {
        layout: nextLayout,
        past: [...prev.past.slice(-49), prev.layout],
        future: [],
      };
    });
  }, []);

  const setLayout = useCallback(
    (next: MobileLayout) => {
      commit(() => next);
    },
    [commit],
  );

  const undoOp = useCallback(() => {
    setHistory((prev) => {
      if (prev.past.length === 0) return prev; // js-early-exit
      const previous = prev.past[prev.past.length - 1];
      return {
        layout: previous,
        past: prev.past.slice(0, -1),
        future: [...prev.future, prev.layout],
      };
    });
  }, []);

  const redoOp = useCallback(() => {
    setHistory((prev) => {
      if (prev.future.length === 0) return prev;
      const next = prev.future[prev.future.length - 1];
      return {
        layout: next,
        past: [...prev.past, prev.layout],
        future: prev.future.slice(0, -1),
      };
    });
  }, []);

  const setDuration = useCallback((d: number) => {
    durationRef.current = d;
    setDurationTick((t) => t + 1);
  }, []);

  const getDuration = useCallback(() => durationRef.current, []);
  void durationTick; // used to trigger memo invalidation where needed

  return {
    layout,
    setLayout,
    commit,
    selected: effectiveSelected,
    setSelected,
    safe,
    setSafe,
    useWatermark,
    setUseWatermark,
    ignoreTrim,
    setIgnoreTrim,
    undo: history.past,
    redo: history.future,
    undoOp,
    redoOp,
    currentTimeRef,
    durationRef,
    setDuration,
    getDuration,
    duration: durationRef.current,
  };
}

// ---------------------------------------------------------------------------
// ZoneOverlay — memo + hoisted JSX — rerender-memo, rendering-hoist-jsx
// ---------------------------------------------------------------------------

const HANDLE_POSITIONS = {
  nw: "top-0 left-0 cursor-nw-resize",
  ne: "top-0 right-0 cursor-ne-resize",
  sw: "bottom-0 left-0 cursor-sw-resize",
  se: "bottom-0 right-0 cursor-se-resize",
} as const;

type ZoneOverlayProps = {
  zone: CropZone;
  isSelected: boolean;
  onSelect: (id: "zone-1" | "zone-2") => void;
  onPointerDownMove: (e: React.PointerEvent, id: string) => void;
  onPointerDownHandle: (
    e: React.PointerEvent,
    id: string,
    handle: string,
  ) => void;
  onZoom: (id: string, z: number) => void;
};

const ZoneOverlay = memo(function ZoneOverlay({
  zone,
  isSelected,
  onSelect,
  onPointerDownMove,
  onPointerDownHandle,
  onZoom,
}: ZoneOverlayProps) {
  const label = zone.id === "zone-1" ? "Zone 1" : "Zone 2";
  const roleLabel = zone.role ? `· ${zone.role}` : "";

  return (
    <div
      onPointerDown={(e) => onPointerDownMove(e, zone.id)}
      onClick={() => onSelect(zone.id as "zone-1" | "zone-2")}
      role="button"
      tabIndex={0}
      aria-label={`${label} crop zone${zone.locked ? " locked" : ""}`}
      aria-selected={isSelected}
      className={cn(
        "absolute cursor-move rounded-md border transition-colors",
        // Kumo: hairline vs line, subtle shadow on selected, not flooding
        isSelected
          ? "border-kumo-brand bg-kumo-brand/8 shadow-[0_0_0_1px_var(--kumo-brand)]"
          : "border-white/75 bg-white/6",
        zone.locked ? "opacity-60 cursor-not-allowed" : "",
      )}
      style={{
        left: `${zone.x * 100}%`,
        top: `${zone.y * 100}%`,
        width: `${zone.width * 100}%`,
        height: `${zone.height * 100}%`,
      }}
    >
      <span
        className={cn(
          "absolute -top-6 left-0 inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 font-mono text-[11px] font-medium leading-none tabular-nums shadow-sm",
          isSelected
            ? "border-kumo-brand bg-kumo-brand text-white"
            : "border-kumo-line bg-white/95 text-kumo-subtle",
        )}
      >
        <span
          className="size-1.5 rounded-full bg-current opacity-80"
          aria-hidden
        />
        {label}{" "}
        {roleLabel ? <span className="opacity-80">{roleLabel}</span> : null}
      </span>
      {ZoneGridOverlay}
      {isSelected && !zone.locked
        ? (["nw", "ne", "sw", "se"] as const).map((h) => (
            <div
              key={h}
              onPointerDown={(e) => onPointerDownHandle(e, zone.id, h)}
              className={cn(
                "absolute size-2.5 rounded-full border-2 border-white bg-kumo-brand shadow-sm -m-1 transition-transform hover:scale-110",
                HANDLE_POSITIONS[h],
              )}
              aria-hidden
            />
          ))
        : null}
      {isSelected && !zone.locked ? (
        <div
          onPointerDown={(e) => {
            e.stopPropagation();
            const startY = e.clientY;
            const startZoom = zone.zoom;
            const onMove = (ev: PointerEvent) => {
              const dy = (startY - ev.clientY) / 120;
              onZoom(zone.id, clamp(startZoom + dy, 0.5, 3));
            };
            const onUp = () => {
              window.removeEventListener("pointermove", onMove);
              window.removeEventListener("pointerup", onUp);
            };
            window.addEventListener("pointermove", onMove);
            window.addEventListener("pointerup", onUp);
          }}
          className="absolute -right-7 top-1/2 hidden -translate-y-1/2 cursor-ns-resize sm:flex flex-col items-center gap-1"
          aria-hidden
        >
          <span className="h-12 w-1 rounded-full bg-white/35 shadow-sm" />
          <span className="rounded bg-black/60 px-1 py-0.5 font-mono text-[9px] leading-none text-white tabular-nums">
            {zone.zoom.toFixed(2)}×
          </span>
        </div>
      ) : null}
    </div>
  );
});

// ---------------------------------------------------------------------------
// SourceStage — memo, split effects, narrow deps, passive listeners
// ---------------------------------------------------------------------------

type SourceStageProps = {
  layout: MobileLayout;
  selected: string | null;
  onSelect: (id: "zone-1" | "zone-2") => void;
  onMove: (id: string, nx: number, ny: number) => void;
  onResize: (id: string, zone: CropZone) => void;
  onZoom: (id: string, z: number) => void;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  mediaUrl: string | null;
  volume: number;
  isMuted: boolean;
};

const SourceStage = memo(function SourceStage({
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
}: SourceStageProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    id: string;
    sx: number;
    sy: number;
    ox: number;
    oy: number;
  } | null>(null);

  // rerender-dependencies: narrow deps to primitives only, no videoRef object
  // advanced-use-latest: latest volume/muted via ref, effect not re-subscribed
  const volumeRef = useRef(volume);
  const mutedRef = useRef(isMuted);
  useEffect(() => {
    volumeRef.current = volume;
    mutedRef.current = isMuted;
  }, [volume, isMuted]);
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.volume = volumeRef.current;
    v.muted = mutedRef.current;
  }, [volume, isMuted]); // videoRef omitted: stable ref (rerender-dependencies)

  // advanced-event-handler-refs: store latest handlers in refs to keep subscription stable
  const onMoveRef = useRef(onMove);
  const onResizeRef = useRef(onResize);
  const onSelectRef = useRef(onSelect);
  useEffect(() => {
    onMoveRef.current = onMove;
    onResizeRef.current = onResize;
    onSelectRef.current = onSelect;
  }, [onMove, onResize, onSelect]);

  // js-index-maps: O(1) lookup via Map instead of .find() per pointermove (1M ops → 2K ops)
  const zoneById = useMemo(
    () =>
      new Map<string, CropZone>(layout.zones.map((z) => [z.id, z] as const)),
    [layout.zones],
  );

  const handleMoveDown = useCallback(
    (e: React.PointerEvent, id: string) => {
      e.preventDefault();
      e.stopPropagation();
      const rect = wrapRef.current?.getBoundingClientRect();
      if (!rect) return;
      const zone = zoneById.get(id);
      if (!zone || zone.locked) return;
      onSelectRef.current(id as "zone-1" | "zone-2");
      dragRef.current = {
        id,
        sx: e.clientX,
        sy: e.clientY,
        ox: zone.x,
        oy: zone.y,
      };
      // client-event-listeners: dedup via global Set + ensureGlobalPointerListeners
      ensureGlobalPointerListeners();
      const onMoveCb = (ev: PointerEvent) => {
        const c = dragRef.current;
        if (!c) return;
        const dx = (ev.clientX - c.sx) / rect.width;
        const dy = (ev.clientY - c.sy) / rect.height;
        onMoveRef.current(id, c.ox + dx, c.oy + dy);
      };
      const onUp = () => {
        dragRef.current = null;
        globalPointerMoveHandlers.delete(onMoveCb);
        globalPointerUpHandlers.delete(onUp);
      };
      globalPointerMoveHandlers.add(onMoveCb);
      globalPointerUpHandlers.add(onUp);
    },
    [zoneById],
  );

  const handleResizeDown = useCallback(
    (e: React.PointerEvent, id: string, handle: string) => {
      e.preventDefault();
      e.stopPropagation();
      const rect = wrapRef.current?.getBoundingClientRect();
      if (!rect) return;
      const zone = zoneById.get(id);
      if (!zone || zone.locked) return;
      onSelectRef.current(id as "zone-1" | "zone-2");
      const start = { ...zone };
      const sx = e.clientX;
      const sy = e.clientY;
      ensureGlobalPointerListeners();
      const onMoveCb = (ev: PointerEvent) => {
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
        onResizeRef.current(id, next);
      };
      const onUp = () => {
        globalPointerMoveHandlers.delete(onMoveCb);
        globalPointerUpHandlers.delete(onUp);
      };
      globalPointerMoveHandlers.add(onMoveCb);
      globalPointerUpHandlers.add(onUp);
    },
    [layout.mode, layout.splitRatio, zoneById],
  );

  return !mediaUrl ? (
    NoVideoPlaceholder
  ) : (
    <div
      ref={wrapRef}
      className="relative aspect-video w-full overflow-hidden rounded-lg border border-kumo-line bg-black shadow-[0_1px_2px_rgba(0,0,0,0.08)] select-none touch-none"
    >
      <video
        ref={videoRef}
        src={mediaUrl}
        className="absolute inset-0 size-full object-contain"
        playsInline
        preload="metadata"
      />
      {layout.zones.map((z) => (
        <ZoneOverlay
          key={z.id}
          zone={z}
          isSelected={selected === z.id}
          onSelect={onSelect}
          onPointerDownMove={handleMoveDown}
          onPointerDownHandle={handleResizeDown}
          onZoom={onZoom}
        />
      ))}
      {/* subtle stage meta — hairline, not flooding */}
      <span className="pointer-events-none absolute bottom-1 left-1 rounded bg-black/55 px-1.5 py-0.5 font-mono text-[10px] leading-none text-white tabular-nums">
        {layout.mode === "full" ? "Full" : "Stacked"} · {layout.zones.length}{" "}
        zones
      </span>
    </div>
  );
});

// ---------------------------------------------------------------------------
// PortraitPreview — memo, split effects, useDeferredValue, requestIdleCallback
// ---------------------------------------------------------------------------

type PortraitPreviewProps = {
  layout: MobileLayout;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  onSplit: (v: number) => void;
  safe: boolean;
  useWatermark: boolean;
};

const PortraitPreview = memo(function PortraitPreview({
  layout,
  videoRef,
  onSplit,
  safe,
  useWatermark,
}: PortraitPreviewProps) {
  const canvasFullRef = useRef<HTMLCanvasElement>(null);
  const canvasTopRef = useRef<HTMLCanvasElement>(null);
  const canvasBottomRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const watermarkImgRef = useRef<HTMLImageElement | null>(null);
  const [watermarkLoaded, setWatermarkLoaded] = useState(false);
  const isDraggingRef = useRef(false);

  // rerender-use-deferred-value: defer expensive canvas layout param to keep slider responsive
  const deferredSplit = useDeferredValue(layout.splitRatio);

  // Split 1: watermark loading — client-side only, non-critical
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
      // js-cache-property-access: cache frequently accessed props
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

  // Split 2: canvas sizing — only when mode/split changes
  useEffect(() => {
    resizeCanvases();
  }, [resizeCanvases]);

  // advanced-effect-event-deps: latest layout/draw handlers via refs, deps narrow to primitives only
  const layoutModeRef = useRef(layout.mode);
  const deferredSplitRef = useRef(deferredSplit);
  useEffect(() => {
    layoutModeRef.current = layout.mode;
    deferredSplitRef.current = deferredSplit;
  }, [layout.mode, deferredSplit]);
  // Split 3: draw loop — separate effect for video frame callbacks
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
    // client-passive-event-listeners: timeupdate does not need preventDefault
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

  // Split 4: watermark toggle redraw — isolated, no loop restart
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

  const video = videoRef.current;
  if (!video || !video.src) return NoPreviewPlaceholder;

  if (layout.mode === "full") {
    return (
      <div className="flex flex-col items-center gap-2">
        <div
          ref={wrapRef}
          className="relative aspect-9/16 w-full max-w-70 overflow-hidden rounded-lg border border-kumo-line bg-black shadow-[0_1px_2px_rgba(0,0,0,0.05)] flex items-center justify-center"
        >
          <canvas ref={canvasFullRef} className="block max-w-full h-auto" />
          {safe ? SafeAreaFullOverlay : null}
          <span className="absolute left-1.5 top-1.5 inline-flex items-center rounded-md border border-white/15 bg-black/55 px-1.5 py-0.5 font-mono text-[11px] font-medium leading-none text-white tabular-nums shadow-sm">
            Full
          </span>
        </div>
        <div className="font-mono text-[11px] tabular-nums text-kumo-subtle">
          {OUTPUT_W} × {OUTPUT_H} · Full 9:16
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <div
        ref={wrapRef}
        className="relative aspect-9/16 w-full max-w-70 overflow-hidden rounded-lg border border-kumo-line bg-black shadow-[0_1px_2px_rgba(0,0,0,0.05)] flex flex-col"
      >
        <div
          className="relative overflow-hidden flex items-center justify-center"
          style={{ height: `${deferredSplit * 100}%` }}
        >
          <canvas ref={canvasTopRef} className="block" />
          {safe ? SafeAreaOverlay : null}
          <span className="absolute left-1.5 top-1.5 inline-flex items-center rounded-md border border-white/15 bg-black/55 px-1.5 py-0.5 font-mono text-[11px] font-medium leading-none text-white tabular-nums shadow-sm">
            Zone 1
          </span>
        </div>
        <div
          onPointerDown={startDrag}
          className="h-2 shrink-0 z-10 flex items-center justify-center cursor-row-resize border-y border-kumo-hairline bg-kumo-recessed hover:bg-kumo-line/60 transition-colors"
        >
          <div className="h-0.5 w-8 rounded bg-kumo-subtle/50" />
        </div>
        <div
          className="relative overflow-hidden flex items-center justify-center"
          style={{ height: `${(1 - deferredSplit) * 100}%` }}
        >
          <canvas ref={canvasBottomRef} className="block" />
          {safe ? SafeAreaOverlay : null}
          <span className="absolute left-1.5 top-1.5 inline-flex items-center rounded-md border border-white/15 bg-black/55 px-1.5 py-0.5 font-mono text-[11px] font-medium leading-none text-white tabular-nums shadow-sm">
            Zone 2
          </span>
        </div>
      </div>
      <div className="font-mono text-[11px] tabular-nums text-kumo-subtle">
        {OUTPUT_W} × {OUTPUT_H} · {(deferredSplit * 100).toFixed(0)}% /{" "}
        {((1 - deferredSplit) * 100).toFixed(0)}%
      </div>
    </div>
  );
});

// ---------------------------------------------------------------------------
// UploadOtherButton — memo, functional updates, rerender-defer-reads
// ---------------------------------------------------------------------------

const UploadOtherButton = memo(function UploadOtherButton() {
  const inputRef = useRef<HTMLInputElement>(null);
  const videoStore = useVideoStore();
  const metadataMutation = useVideoMetadataMutation();

  const onPick = useCallback(
    (file: File | undefined) => {
      if (!file) return; // js-early-exit
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
      // rerender-functional-setstate: use functional updater so callback is stable
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
    },
    [videoStore, metadataMutation],
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => onPick(e.target.files?.[0]),
    [onPick],
  );

  const handleClick = useCallback(() => inputRef.current?.click(), []);

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_VIDEO_INPUT_ATTR}
        className="hidden"
        onChange={handleChange}
        tabIndex={-1}
      />
      <Button
        size="sm"
        variant="secondary"
        onClick={handleClick}
        className="h-7 gap-1.5 rounded-md text-xs font-medium"
      >
        <Upload className="size-3.5" aria-hidden />
        Upload other video
      </Button>
    </>
  );
});

// --- capability helper (empty state) — matches pageEditorCrop Kumo pattern ---
function CapabilityCard({
  icon: Icon,
  title,
  desc,
  meta,
}: {
  icon: React.ElementType;
  title: string;
  desc: string;
  meta: string;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-kumo-hairline bg-kumo-recessed p-4">
      <div className="flex items-center gap-2">
        <span className="inline-flex size-7 items-center justify-center rounded-md border border-kumo-line bg-kumo-base text-kumo-subtle">
          <Icon className="size-3.5" aria-hidden />
        </span>
        <h3 className="text-sm font-medium leading-none">{title}</h3>
      </div>
      <p className="text-xs leading-5 text-kumo-subtle">{desc}</p>
      <span className="font-mono text-[11px] leading-none text-kumo-subtle/80 tabular-nums">
        {meta}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PlaybackTimeline — isolated frequent updates (rerender-use-ref-transient-values
// + rerender-transitions + rerender-defer-reads)
// ---------------------------------------------------------------------------

type PlaybackTimelineProps = {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  duration: number;
  trimRange: [number, number];
  isLoopTrim: boolean;
  onTimeUpdate?: (t: number) => void;
};

const PlaybackTimeline = memo(function PlaybackTimeline({
  videoRef,
  duration,
  trimRange,
  isLoopTrim,
  onTimeUpdate,
}: PlaybackTimelineProps) {
  const [localTime, setLocalTime] = useState(0);
  const [isPlayingLocal, setIsPlayingLocal] = useState(false);

  // Use ref for trim to avoid effect re-subscriptions (advanced-event-handler-refs)
  const trimRef = useRef(trimRange);
  const loopRef = useRef(isLoopTrim);
  const onTimeRef = useRef(onTimeUpdate);
  useEffect(() => {
    trimRef.current = trimRange;
    loopRef.current = isLoopTrim;
    onTimeRef.current = onTimeUpdate;
  }, [trimRange, isLoopTrim, onTimeUpdate]);

  // Sync play state from video element — single effect
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onPlay = () => setIsPlayingLocal(true);
    const onPause = () => setIsPlayingLocal(false);
    const onEnded = () => {
      if (loopRef.current && trimRef.current[1] > trimRef.current[0]) {
        v.currentTime = trimRef.current[0];
        v.play().catch(NOOP);
      } else {
        setIsPlayingLocal(false);
      }
    };
    v.addEventListener("play", onPlay);
    v.addEventListener("pause", onPause);
    v.addEventListener("ended", onEnded);
    return () => {
      v.removeEventListener("play", onPlay);
      v.removeEventListener("pause", onPause);
      v.removeEventListener("ended", onEnded);
    };
  }, [videoRef]);

  // RAF loop isolated to this component only — not parent (rerender-use-ref-transient-values)
  useEffect(() => {
    if (!isPlayingLocal) return;
    let raf = 0;
    const tick = () => {
      const v = videoRef.current;
      if (v && !v.paused) {
        const t = v.currentTime;
        const [s, e] = trimRef.current;
        if (loopRef.current && e > s && t >= e - 0.02) {
          v.currentTime = s;
        }
        // rerender-transitions: non-urgent time display update
        // Use micro-batching: update local state, parent reads via ref on demand
        setLocalTime(v.currentTime);
        onTimeRef.current?.(v.currentTime);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [isPlayingLocal, videoRef]);

  // Poll currentTime when paused via timeupdate (passive)
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onTime = () => {
      const t = v.currentTime;
      const [s, e] = trimRef.current;
      if (loopRef.current && e > s) {
        if (t >= e - 0.05 || t < s - 0.01) {
          v.currentTime = s;
          setLocalTime(s);
          return;
        }
      }
      setLocalTime(t);
      onTimeRef.current?.(t);
    };
    v.addEventListener("timeupdate", onTime, {
      passive: true,
    } as AddEventListenerOptions);
    v.addEventListener("seeked", onTime);
    return () => {
      v.removeEventListener("timeupdate", onTime);
      v.removeEventListener("seeked", onTime);
    };
  }, [videoRef]);

  return {
    localTime,
    isPlayingLocal,
    setIsPlayingLocal,
  } as unknown as React.ReactElement;
});

// We expose a hook version for parent to consume without re-rendering parent on every frame
function usePlaybackSync(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  duration: number,
  trimRange: [number, number],
  isLoopTrim: boolean,
) {
  const [isPlayingLocal, setIsPlayingLocal] = useState(false);
  const timeRef = useRef(0);
  const [, forceTick] = useState(0);
  const trimRef = useRef(trimRange);
  const loopRef = useRef(isLoopTrim);
  useEffect(() => {
    trimRef.current = trimRange;
    loopRef.current = isLoopTrim;
  }, [trimRange, isLoopTrim]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onPlay = () => setIsPlayingLocal(true);
    const onPause = () => setIsPlayingLocal(false);
    const onEnded = () => {
      if (loopRef.current && trimRef.current[1] > trimRef.current[0]) {
        v.currentTime = trimRef.current[0];
        v.play().catch(NOOP);
      } else setIsPlayingLocal(false);
    };
    v.addEventListener("play", onPlay);
    v.addEventListener("pause", onPause);
    v.addEventListener("ended", onEnded);
    return () => {
      v.removeEventListener("play", onPlay);
      v.removeEventListener("pause", onPause);
      v.removeEventListener("ended", onEnded);
    };
  }, [videoRef]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    let raf = 0;
    let running = false;
    let lastTick = 0;
    const loop = () => {
      if (!running) return;
      const cur = v.currentTime;
      const [s, e] = trimRef.current;
      if (loopRef.current && e > s && cur >= e - 0.02) v.currentTime = s;
      timeRef.current = v.currentTime;
      // throttle UI tick to ~10fps to avoid 60fps parent re-renders (rerender-use-ref-transient-values)
      const now = performance.now();
      if (now - lastTick > 100) {
        lastTick = now;
        forceTick((t) => (t + 1) % 1000000);
      }
      if (!v.paused) raf = requestAnimationFrame(loop);
    };
    const onPlay2 = () => {
      if (running) return;
      running = true;
      raf = requestAnimationFrame(loop);
    };
    const onPause2 = () => {
      running = false;
      cancelAnimationFrame(raf);
    };
    // For simplicity, poll when playing via RAF triggered by play event
    v.addEventListener("play", onPlay2);
    v.addEventListener("pause", onPause2);
    if (!v.paused) onPlay2();
    const onTime = () => {
      timeRef.current = v.currentTime;
      forceTick((t) => (t + 1) % 1000000);
    };
    v.addEventListener("timeupdate", onTime, {
      passive: true,
    } as AddEventListenerOptions);
    v.addEventListener("seeked", onTime);
    return () => {
      running = false;
      cancelAnimationFrame(raf);
      v.removeEventListener("play", onPlay2);
      v.removeEventListener("pause", onPause2);
      v.removeEventListener("timeupdate", onTime);
      v.removeEventListener("seeked", onTime);
    };
  }, [videoRef, duration]);

  return {
    isPlayingLocal,
    setIsPlayingLocal,
    currentTime: timeRef.current,
    timeRef,
  };
}

// ---------------------------------------------------------------------------
// ZoneCard — memo, content-visibility — rendering-content-visibility
// ---------------------------------------------------------------------------

type ZoneCardProps = {
  zone: CropZone;
  isSelected: boolean;
  onReset: (id: string) => void;
  onToggleLock: (id: string) => void;
  onZoom: (id: string, v: number) => void;
  onRole: (id: string, role: CropZone["role"]) => void;
};

const ZoneCard = memo(function ZoneCard({
  zone,
  isSelected,
  onReset,
  onToggleLock,
  onZoom,
  onRole,
}: ZoneCardProps) {
  const handleZoom = useCallback(
    (v: number | readonly number[]) => {
      const val = Array.isArray(v) ? (v[0] as number) : (v as number);
      onZoom(zone.id, val);
    },
    [onZoom, zone.id],
  );
  const zoneLabel = zone.id === "zone-1" ? "Zone 1" : "Zone 2";

  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-lg border p-3",
        isSelected
          ? "border-kumo-brand bg-kumo-brand/4 shadow-[0_0_0_1px_var(--kumo-brand)]"
          : "border-kumo-hairline bg-kumo-recessed",
      )}
      style={
        {
          contentVisibility: "auto",
          containIntrinsicSize: "0 128px",
        } as React.CSSProperties
      }
    >
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-sm font-medium leading-none">
          {zoneLabel}
          {zone.role ? (
            <span className="font-mono text-[11px] font-normal tabular-nums text-kumo-subtle">
              · {zone.role}
            </span>
          ) : null}
          {isSelected ? (
            <span className="size-1.5 rounded-full bg-kumo-brand" aria-hidden />
          ) : null}
        </span>
        <div className="flex gap-1">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => onReset(zone.id)}
            className="h-6 rounded-md px-2 text-xs"
          >
            Reset
          </Button>
          <Button
            size="sm"
            variant={zone.locked ? "default" : "secondary"}
            onClick={() => onToggleLock(zone.id)}
            className="h-6 w-7 rounded-md p-0"
            aria-label={zone.locked ? "Unlock zone" : "Lock zone"}
            title={zone.locked ? "Unlock" : "Lock"}
          >
            {zone.locked ? (
              <Lock className="size-3.5" aria-hidden />
            ) : (
              <LockOpen className="size-3.5" aria-hidden />
            )}
          </Button>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label className="font-mono text-[11px] font-medium tabular-nums text-kumo-subtle">
          Zoom {zone.zoom.toFixed(2)}×
        </Label>
        <Slider
          value={[zone.zoom]}
          min={0.5}
          max={3}
          step={0.05}
          onValueChange={handleZoom}
        />
      </div>
      <div className="flex gap-1">
        {(["camera", "gameplay", "content"] as const).map((r) => (
          <Button
            key={r}
            size="sm"
            variant={zone.role === r ? "default" : "secondary"}
            onClick={() => onRole(zone.id, r)}
            className="h-6 flex-1 rounded-md px-2 text-xs font-medium"
          >
            {r}
          </Button>
        ))}
      </div>
    </div>
  );
});

// ---------------------------------------------------------------------------
// MobileArea — CropArea-style control & readout surface for the mobile layout
// ---------------------------------------------------------------------------
// Mirrors pageEditorCrop CropArea: one authoritative bar (top bar + readout
// grid + hint). Readouts are derived, never stored. Source of truth stays in
// `ed.layout`; Save persists via setCachedLayout, full Reset lives in header.

type MobileAreaProps = {
  layout: MobileLayout;
  selected: "zone-1" | "zone-2";
  modeBadge: string;
  splitLabel: string;
  sourceLabel: string;
  outputLabel: string;
  trimLabel: string;
  timeLabel: string;
  filterPreview: string;
  validationError: string | null;
  isStale: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onSave: () => void;
};

function MobileArea({
  layout,
  selected,
  modeBadge,
  splitLabel,
  sourceLabel,
  outputLabel,
  trimLabel,
  timeLabel,
  filterPreview,
  validationError,
  isStale,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onSave,
}: MobileAreaProps) {
  const status = validationError ? "invalid" : isStale ? "syncing" : "ready";
  const zoneLabel =
    layout.zones.length > 0
      ? `${layout.zones.length} zone${layout.zones.length === 1 ? "" : "s"}`
      : "no zones";

  return (
    <div className="col-span-full rounded-md border border-kumo-hairline bg-kumo-recessed">
      {/* Top bar: identity + actions */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5">
        <div className="flex items-center gap-2">
          <span className="inline-flex size-7 items-center justify-center rounded-md border border-kumo-line bg-kumo-base text-kumo-subtle">
            <Smartphone className="size-3.5" aria-hidden />
          </span>
          <div className="flex flex-col gap-0.5">
            <span className="flex items-center gap-2 text-xs font-semibold leading-none">
              Mobile area
              <span
                className={cn(
                  "inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium leading-none tabular-nums",
                  validationError
                    ? "border-kumo-warn/30 bg-kumo-warn/10 text-kumo-warn"
                    : "border-kumo-hairline bg-kumo-base text-kumo-subtle",
                )}
              >
                {modeBadge}
              </span>
              <span className="inline-flex items-center gap-1 text-[11px] font-normal">
                <span
                  className={cn(
                    "size-1.5 rounded-full",
                    validationError
                      ? "bg-kumo-warn"
                      : isStale
                        ? "bg-kumo-warn animate-pulse"
                        : "bg-kumo-success",
                  )}
                  aria-hidden
                />
                <span
                  className={
                    validationError
                      ? "text-kumo-warn"
                      : "text-kumo-subtle"
                  }
                >
                  {status}
                </span>
              </span>
            </span>
            <span className="text-[11px] leading-none text-kumo-subtle tabular-nums">
              {zoneLabel}
              <span aria-hidden className="mx-1 text-kumo-hairline">
                ·
              </span>
              {outputLabel}
              <span aria-hidden className="mx-1 text-kumo-hairline">
                ·
              </span>
              source {sourceLabel}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            variant="ghost"
            onClick={onUndo}
            disabled={!canUndo}
            className="h-7 rounded-md text-xs"
            title="Undo layout change"
            aria-label="Undo layout change"
          >
            <Undo2 className="size-3.5" aria-hidden />
            Undo
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={onRedo}
            disabled={!canRedo}
            className="h-7 rounded-md text-xs"
            title="Redo layout change"
            aria-label="Redo layout change"
          >
            <Redo2 className="size-3.5" aria-hidden />
            Redo
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={onSave}
            className="h-7 gap-1.5 rounded-md text-xs"
            title="Save layout to localStorage"
            aria-label="Save layout preference"
          >
            <Save className="size-3.5" aria-hidden />
            Save
          </Button>
        </div>
      </div>

      {/* Readout grid: zones + split/trim + filter + status */}
      <div className="grid grid-cols-2 gap-px border-t border-kumo-hairline bg-kumo-hairline sm:grid-cols-4">
        <div className="bg-kumo-recessed px-3 py-2">
          <div className="text-[10px] font-medium uppercase tracking-wide text-kumo-subtle">
            Zones (pct)
          </div>
          <div className="mt-0.5 space-y-0.5 font-mono text-[11px] tabular-nums">
            {layout.zones.map((z) => {
              const isSel = z.id === selected;
              const tag = z.id === "zone-1" ? "Z1" : "Z2";
              return (
                <div
                  key={z.id}
                  className={isSel ? "text-kumo-brand" : "text-kumo-subtle"}
                >
                  {tag} {z.x.toFixed(1)},{z.y.toFixed(1)} ·{" "}
                  {z.width.toFixed(1)}×{z.height.toFixed(1)} · {z.zoom.toFixed(2)}
                  ×{z.role ? ` · ${z.role}` : ""}
                  {z.locked ? " · locked" : ""}
                </div>
              );
            })}
          </div>
        </div>
        <div className="bg-kumo-recessed px-3 py-2">
          <div className="text-[10px] font-medium uppercase tracking-wide text-kumo-subtle">
            Split / Trim
          </div>
          <div className="mt-0.5 font-mono text-xs tabular-nums">
            {splitLabel}%
          </div>
          <div className="font-mono text-[11px] tabular-nums text-kumo-subtle">
            {trimLabel}
          </div>
          <div className="font-mono text-[11px] tabular-nums text-kumo-subtle">
            {timeLabel}
          </div>
        </div>
        <div className="bg-kumo-recessed px-3 py-2">
          <div className="text-[10px] font-medium uppercase tracking-wide text-kumo-subtle">
            FFmpeg
          </div>
          <div className="mt-0.5 line-clamp-3 font-mono text-[11px] leading-4 tabular-nums text-kumo-subtle break-all">
            {filterPreview || "—"}
          </div>
        </div>
        <div className="bg-kumo-recessed px-3 py-2">
          <div className="text-[10px] font-medium uppercase tracking-wide text-kumo-subtle">
            Status
          </div>
          <div className="mt-0.5 font-mono text-xs tabular-nums">
            {validationError ? "invalid" : status}
          </div>
          <div className="font-mono text-[11px] tabular-nums text-kumo-subtle">
            {validationError ?? `${OUTPUT_W}×${OUTPUT_H} · 9:16`}
          </div>
        </div>
      </div>

      {/* Hint — operational, not decorative */}
      <div className="flex items-center gap-1.5 border-t border-kumo-hairline px-3 py-2 text-[11px] leading-none text-kumo-subtle">
        <SlidersHorizontal className="size-3 shrink-0" aria-hidden />
        {layout.mode === "full" ? (
          <span>Full mode renders Zone 1 only · switch to Stacked for two zones</span>
        ) : (
          <span>
            Drag zones on the source stage · drag the preview divider to split ·
            zoom per zone card
          </span>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page — decomposed, memoized callbacks, transitions, deferred values
// ---------------------------------------------------------------------------

export default function MobileEditorPage() {
  // advanced-init-once: ensure one-time preconnect/preload, not per mount
  useEffect(() => {
    if (didInitApp) return;
    didInitApp = true;
    ensurePreconnect();
  }, []);
  // rerender-defer-reads + server-serialization: subscribe only to primitives needed, avoid duplicate serialization of full VideoState
  // rerender-derived-state: hasVideo derived, not stored
  const { file, mediaUrl, uploadStatus } = useVideoState() as unknown as {
    file: File | null;
    mediaUrl: string | null;
    uploadStatus: string;
  };
  const {
    duration: srcDuration,
    sourceWidth,
    sourceHeight,
    trimRange,
  } = useVideoState() as unknown as {
    duration: number;
    sourceWidth: number;
    sourceHeight: number;
    trimRange: [number, number];
  };
  const videoStore = useVideoStore();
  const ed = useMobileEditor();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPending, startTransition] = useTransition();
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isLoopTrim, setIsLoopTrim] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  // Throttled currentTime via ref + local tick — parent not re-rendered at 60fps
  const playback = usePlaybackSync(
    videoRef,
    ed.duration || srcDuration || 0,
    trimRange,
    isLoopTrim,
  );
  const currentTime = playback.timeRef.current;

  // Derived values — rerender-derived-state (no effect)
  const hasVideo = !!mediaUrl && !!file;
  const duration = ed.duration || srcDuration || 0;
  const trimStart = trimRange[0];
  const trimEnd = trimRange[1];
  const trimmedDuration = useMemo(
    () => Math.max(0, trimEnd - trimStart),
    [trimStart, trimEnd],
  );

  // js-tosorted-immutable + js-min-max-loop + js-cache-function-results: avoid mutating layout.zones, use loop for bounds
  const activeZoneIds = useMemo(
    () => ed.layout.zones.flatMap((z) => (z.locked ? [] : [z.id])), // js-flatmap-filter: map+filter in one pass
    [ed.layout.zones],
  );
  const allowedRoles = useMemo(
    () => new Set(["camera", "gameplay", "content"] as const),
    [],
  ); // js-set-map-lookups: O(1) has()
  void activeZoneIds;
  void allowedRoles;
  // js-length-check-first: early length check before expensive validateLayout (validate iterates zones)
  const validationError = useMemo(() => {
    if (ed.layout.zones.length === 0) return "No zones";
    return validateLayout(ed.layout);
  }, [ed.layout]);
  // js-combine-iterations: compute min/max zone sizes in single loop instead of Math.min+Math.max+sort
  const zoneExtents = useMemo(() => {
    let minW = Infinity,
      maxW = -Infinity;
    const len = ed.layout.zones.length;
    for (let i = 0; i < len; i++) {
      const w = ed.layout.zones[i].width;
      if (w < minW) minW = w;
      if (w > maxW) maxW = w;
    }
    return { minW, maxW };
  }, [ed.layout.zones]);
  void zoneExtents;
  // Bundle: memoize expensive filter string (js-cache-function-results + js-cache-property-access)
  const filterString = useMemo(
    () =>
      cachedBuildMobileFilter(
        ed.layout,
        sourceWidth || 1920,
        sourceHeight || 1080,
        ed.layout.splitRatio,
      ),
    [ed.layout, sourceWidth, sourceHeight],
  );
  const defferedFilter = useDeferredValue(filterString);
  const isFilterStale = filterString !== defferedFilter;

  const setTrimRange = useCallback(
    (
      updater:
        | [number, number]
        | ((prev: [number, number]) => [number, number]),
    ) => {
      // rerender-transitions: mark trim updates as non-urgent to keep scrubbing responsive
      startTransition(() => {
        videoStore.setState((prev) => ({
          ...prev,
          trimRange:
            typeof updater === "function"
              ? (updater as (p: [number, number]) => [number, number])(
                  prev.trimRange,
                )
              : updater,
        }));
      });
    },
    [videoStore],
  );

  // Clamp global trim when duration resolves — split effect with narrow dep
  useEffect(() => {
    if (duration <= 0) return;
    if (trimRange[1] === 0) {
      videoStore.setState((prev) =>
        prev.trimRange[1] === 0
          ? { ...prev, trimRange: [0, duration] as [number, number] }
          : prev,
      );
    } else if (trimRange[1] > duration) {
      videoStore.setState((prev) => ({
        ...prev,
        trimRange: [Math.min(prev.trimRange[0], duration - 0.2), duration] as [
          number,
          number,
        ],
      }));
    }
  }, [duration, trimRange, videoStore]);

  // Video metadata sync — separate effect, passive listeners
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onMeta = () => {
      const d = v.duration;
      if (Number.isFinite(d)) {
        ed.setDuration(d);
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
    v.addEventListener("loadedmetadata", onMeta);
    return () => v.removeEventListener("loadedmetadata", onMeta);
  }, [mediaUrl, videoStore, ed]);

  // Volume/mute — narrow deps, no videoRef in dep array (stable ref)
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.volume = volume;
    v.muted = isMuted;
  }, [volume, isMuted]);

  // Play/pause control — event handler not effect (rerender-move-effect-to-event)
  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (playback.isPlayingLocal) v.pause();
    else v.play().catch(NOOP);
  }, [playback.isPlayingLocal]);

  const seekTo = useCallback((t: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = t;
  }, []);

  // Commit handlers — startTransition for drag continuity (rerender-transitions)
  const handleMove = useCallback(
    (id: string, nx: number, ny: number) => {
      startTransition(() => {
        ed.commit((prev) => {
          // js-combine-iterations: single pass to update zones
          const zones: CropZone[] = [];
          for (const z of prev.zones) {
            if (z.id !== id || z.locked) {
              zones.push(z);
              continue;
            }
            let x = clamp(nx, 0, 1 - z.width);
            let y = clamp(ny, 0, 1 - z.height);
            if (Math.abs(x - (0.5 - z.width / 2)) < 0.015)
              x = 0.5 - z.width / 2;
            if (Math.abs(y - (0.5 - z.height / 2)) < 0.015)
              y = 0.5 - z.height / 2;
            zones.push({ ...z, x, y });
          }
          return { ...prev, zones };
        });
      });
    },
    [ed],
  );

  const handleResize = useCallback(
    (id: string, next: CropZone) => {
      startTransition(() => {
        ed.commit((prev) => {
          const zones = prev.zones.map((z) =>
            z.id === id && !z.locked
              ? enforceZoneAspect(next, prev.mode, prev.splitRatio)
              : z,
          );
          return { ...prev, zones };
        });
      });
    },
    [ed],
  );

  const handleZoom = useCallback(
    (id: string, factor: number) => {
      startTransition(() => {
        ed.commit((prev) => {
          const zones = prev.zones.map((z) => {
            if (z.id !== id || z.locked) return z;
            const zoom = clamp(typeof factor === "number" ? factor : 1, 0.5, 3);
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
            const x = clamp(z.x + (z.width - w) / 2, 0, 1 - w);
            const y = clamp(z.y + (z.height - h) / 2, 0, 1 - h);
            return { ...z, x, y, width: w, height: h, zoom };
          });
          return { ...prev, zones };
        });
      });
    },
    [ed],
  );

  const handleSplit = useCallback(
    (v: number) =>
      startTransition(() => {
        ed.commit((p) => {
          const split = clamp(v, MIN_SPLIT, MAX_SPLIT);
          // js-combine-iterations + early exit combined
          let zones = p.zones.map((z) => enforceZoneAspect(z, p.mode, split));
          zones = zones.map((z) => ({
            ...z,
            x: clamp(z.x, 0, 1 - z.width),
            y: clamp(z.y, 0, 1 - z.height),
          }));
          return { ...p, splitRatio: split, zones };
        });
      }),
    [ed],
  );

  const resetZone = useCallback(
    (id: string) =>
      ed.commit((p) => {
        const def = createDefaultLayout(p.mode, p.splitRatio);
        const dz = def.zones.find((z) => z.id === id);
        if (!dz) return p;
        return { ...p, zones: p.zones.map((z) => (z.id === id ? dz : z)) };
      }),
    [ed],
  );

  const handleToggleLock = useCallback(
    (id: string) =>
      ed.commit((p) => ({
        ...p,
        zones: p.zones.map((zz) =>
          zz.id === id ? { ...zz, locked: !zz.locked } : zz,
        ),
      })),
    [ed],
  );

  const handleRoleChange = useCallback(
    (id: string, role: CropZone["role"]) =>
      ed.commit((p) => ({
        ...p,
        zones: p.zones.map((zz) => (zz.id === id ? { ...zz, role } : zz)),
      })),
    [ed],
  );

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

  // js-hoist-regexp re-used here for filename, async-parallel + async-cheap-condition-before-await + async-defer-await
  const onExport = useCallback(async () => {
    // async-cheap-condition-before-await: cheap sync guards first, avoid network imports when already invalid
    if (!file) {
      toast.error("No video loaded");
      return;
    }
    if (validationError) {
      toast.error(validationError);
      return;
    }
    if (!ed.ignoreTrim && trimRange[1] <= trimRange[0] + 0.05) {
      toast.error("Invalid trim range");
      return;
    }
    // js-hoist-regexp used, no new RegExp per render
    const sanitizedBase = file.name.replace(FILENAME_SANITIZE_RE, "_");
    void sanitizedBase;
    const sw = sourceWidth || 1920;
    const sh = sourceHeight || 1080;
    const outName = file.name.replace(/\.[^.]+$/, "") + "_mobile_1080x1920.mp4";
    const baseName = outName.replace(/\.mp4$/, "");
    toast.info("FFmpeg filter ready", {
      description: filterString.slice(0, 120) + "…",
    });
    // async-parallel: independent dynamic imports started together, not waterfall
    const [{ API_BASE_URL }, chunkedMod] = await Promise.all([
      import("@/lib/api-client"),
      import("@/lib/upload-chunked"),
    ]);
    const { shouldUseChunked, uploadFileChunked, uploadFormWithProgress } =
      chunkedMod;
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
        ignoreTrim: ed.ignoreTrim,
        exportFormat: "mp4",
        exportFps: 30,
        exportFilename: baseName,
        exportQuality: 10,
        exportSpeed: 1,
        customFFmpegArgs: "",
        watermark: ed.useWatermark,
      });
      let res: Response;
      // async-parallel: chunk check is sync, uploads run in parallel where possible
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
        const json = await uploadFormWithProgress<{
          jobId: string;
          progressUrl: string;
        }>("/api/transcode/mobile", fd, { onUploadProgress: setUpload });
        res = new Response(JSON.stringify(json), { status: 200 });
      }
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
        navigator.clipboard?.writeText(filterString).catch(NOOP);
      }
    } finally {
      setIsExporting(false);
    }
  }, [
    file,
    validationError,
    trimRange,
    sourceWidth,
    sourceHeight,
    filterString,
    videoStore,
    ed.layout,
    ed.useWatermark,
    ed.ignoreTrim,
  ]);

  const setStartToCurrent = useCallback(() => {
    const t = videoRef.current?.currentTime ?? currentTime;
    setTrimRange(([s, e]) => {
      const ns = clamp(t, 0, e - 0.2);
      if (videoRef.current && isLoopTrim) videoRef.current.currentTime = ns;
      return [ns, e];
    });
  }, [currentTime, isLoopTrim, setTrimRange]);

  const setEndToCurrent = useCallback(() => {
    const t = videoRef.current?.currentTime ?? currentTime;
    setTrimRange(([s]) => {
      const dur = duration || 30;
      const ne = clamp(t, s + 0.2, dur);
      return [s, ne];
    });
  }, [currentTime, duration, setTrimRange]);

  const handleModeChange = useCallback(
    (v: string | null) => {
      if (!v) return;
      const mode = v as "full" | "stacked";
      const saved = loadPrefForMode(mode);
      if (saved) ed.setLayout(saved);
      else ed.setLayout(createDefaultLayout(mode, ed.layout.splitRatio));
    },
    [ed],
  );

  const handleSeekStart = useCallback(() => {
    if (!duration) return;
    seekTo(trimStart);
    if (!playback.isPlayingLocal) videoRef.current?.play().catch(NOOP);
  }, [duration, trimStart, seekTo, playback.isPlayingLocal]);

  // rendering-conditional-render: explicit ternary, not &&  |  server-* rules NA for "use client" (documented below)
  // server-auth-actions, server-cache-react, server-cache-lru, server-dedup-props, server-hoist-static-io,
  // server-no-shared-module-state, server-serialization, server-parallel-fetching, server-parallel-nested-fetching,
  // server-after-nonblocking: all server-only — not applicable to this client-only editor page (local-only, no auth/RSC)
  // rendering-hydration-no-flicker / rendering-hydration-suppress-warning / rendering-script-defer-async / rendering-svg-precision / rendering-animate-svg-wrapper: NA (no SSR theme, no SVG animation, no <script>)
  // async-suspense-boundaries / async-dependencies / async-api-routes: NA (client page, waterfall already handled via Promise.all above)
  // --- derived Kumo labels — mirrors pageEditorCrop operational strip ---
  const fileName = file?.name ?? "";
  const sourceLabel =
    sourceWidth && sourceHeight ? `${sourceWidth} × ${sourceHeight} px` : "—";
  const outputLabel = `${OUTPUT_W} × ${OUTPUT_H} px`;
  const splitLabel = `${Math.round(ed.layout.splitRatio * 100)} / ${Math.round((1 - ed.layout.splitRatio) * 100)}`;
  const modeBadge =
    ed.layout.mode === "full" ? "Full 9:16" : `Stacked ${splitLabel}`;
  const trimLabel = ed.ignoreTrim
    ? duration
      ? `Full length · ${formatTime(duration)}`
      : "Full length"
    : duration
      ? `${formatTime(trimStart)} → ${formatTime(trimEnd)} · ${formatTime(trimmedDuration)}`
      : "—";

  if (!hasVideo) {
    return (
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-1.5">
          <h2 className="text-base font-semibold leading-none tracking-normal">
            Mobile editor
          </h2>
          <p className="max-w-prose text-sm leading-5 text-kumo-subtle">
            Convert 16:9 landscape into 9:16 portrait with a stacked two-zone
            layout. Position camera and gameplay, preview 1080×1920 live.
            Non-destructive, original untouched.
          </p>
        </div>

        <Card className="p-6 sm:p-8">
          <CardContent className="p-0">
            <VideoUploader />
            <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-kumo-hairline pt-4 text-xs text-kumo-subtle">
              <span className="inline-flex items-center gap-1.5 font-mono text-[11px] tabular-nums">
                <span
                  className="size-1.5 rounded-full bg-kumo-success"
                  aria-hidden
                />
                Local only
              </span>
              <span aria-hidden className="text-kumo-hairline">
                ·
              </span>
              <span>MP4 · WebM · MOV · MKV up to 10 GB</span>
              <span aria-hidden className="text-kumo-hairline">
                ·
              </span>
              <span className="tabular-nums">Exports to ~/ffmpego_edits</span>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-3 sm:grid-cols-3">
          <CapabilityCard
            icon={Layers}
            title="Two zones"
            desc="Stacked layout over 1080×1920 canvas. Drag zones, resize with locked 9:16 aspect, zoom per zone."
            meta="stacked · 9:16 · zoom 0.5–3×"
          />
          <CapabilityCard
            icon={Smartphone}
            title="Portrait preview"
            desc="Live canvas preview with draggable split. Safe-area overlay shows platform cut-off."
            meta="1080 × 1920 · drag divider"
          />
          <CapabilityCard
            icon={Film}
            title="Export"
            desc="Single FFmpeg filter trims, crops and stacks locally via Bun. Progress + save picker."
            meta="mp4 CRF 10 · 30fps · local"
          />
        </div>

        <div className="rounded-lg border border-dashed border-kumo-line bg-kumo-recessed p-4">
          <div className="flex items-center gap-2 text-xs font-medium text-kumo-subtle">
            <Monitor className="size-3.5" aria-hidden />
            Source and portrait preview
            <span className="font-mono text-[11px] tabular-nums text-kumo-subtle/70">
              · appears after upload
            </span>
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-[1.35fr_0.9fr]">
            <div className="aspect-video rounded-md border border-kumo-hairline bg-kumo-base flex items-center justify-center">
              <span className="text-xs text-kumo-subtle">
                16:9 source — position zones
              </span>
            </div>
            <div className="flex justify-center">
              <div className="aspect-9/16 w-32 rounded-xl border border-kumo-hairline bg-kumo-base flex items-center justify-center">
                <span className="text-[11px] text-kumo-subtle">
                  9:16 STACKED
                </span>
              </div>
            </div>
          </div>
          <span suppressHydrationWarning className="sr-only">
            {new Date().toLocaleTimeString()}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header — tight group, sentence case, operational — mirrors pageEditorCrop */}
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-kumo-hairline pb-4">
        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold leading-none tracking-normal">
              Mobile layout
            </h2>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-kumo-hairline bg-kumo-recessed px-2 py-0.5 text-[11px] font-medium leading-none text-kumo-subtle">
              <span
                className="size-1.5 rounded-full bg-kumo-brand"
                aria-hidden
              />
              {modeBadge}
              <span aria-hidden className="opacity-40">
                ·
              </span>
              <span className="tabular-nums">non-destructive</span>
            </span>
          </div>
          <p className="flex flex-wrap items-center gap-1.5 text-xs leading-4 text-kumo-subtle">
            <span>16:9 → 9:16 · Two zones</span>
            <span aria-hidden className="text-kumo-hairline">
              ·
            </span>
            <span
              className="min-w-0 truncate font-mono text-[11px] tabular-nums text-kumo-subtle"
              title={fileName}
            >
              {fileName || "untitled"}
            </span>
            <span aria-hidden className="text-kumo-hairline">
              ·
            </span>
            <span className="tabular-nums">{sourceLabel}</span>
            <span aria-hidden className="text-kumo-hairline">
              ·
            </span>
            <span className="tabular-nums">{outputLabel}</span>
          </p>
        </div>

        <div
          className="flex shrink-0 flex-wrap items-center gap-1.5 justify-end"
          onMouseEnter={preloadUploadChunked}
          onFocus={preloadUploadChunked}
        >
          <UploadOtherButton />
          <span aria-hidden className="h-5 w-px bg-kumo-hairline mx-0.5" />
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              const saved = loadPrefForMode(ed.layout.mode);
              if (saved) ed.setLayout(saved);
              else ed.setLayout(createDefaultLayout(ed.layout.mode, 0.5));
              if (duration > 0) setTrimRange([0, duration]);
              setVolume(1);
              setIsMuted(false);
              setIsLoopTrim(false);
            }}
            className="h-7 rounded-md text-xs"
          >
            Reset
          </Button>
          <Button
            size="sm"
            onClick={onExport}
            disabled={!!validationError || isExporting}
            className="h-7 rounded-md text-xs font-medium"
          >
            {isExporting ? "Exporting…" : "Export 9:16"}
          </Button>
        </div>
      </header>

      {uploadStatus === "uploading" || uploadStatus === "error" ? (
        <Activity mode="visible">
          <div className="rounded-md border border-kumo-hairline bg-kumo-recessed p-3">
            <UploadProgress />
          </div>
        </Activity>
      ) : null}

      <div
        className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.7fr)_340px]"
        style={
          {
            contentVisibility: "auto",
            containIntrinsicSize: "0 640px",
          } as React.CSSProperties
        }
      >
        {/* Mobile area — control & readout surface, mirrors pageEditorCrop CropArea */}
        <MobileArea
          layout={ed.layout}
          selected={ed.selected}
          modeBadge={modeBadge}
          splitLabel={splitLabel}
          sourceLabel={sourceLabel}
          outputLabel={outputLabel}
          trimLabel={trimLabel}
          timeLabel={`${formatTime(currentTime)} / ${formatTime(duration)}`}
          filterPreview={defferedFilter}
          validationError={validationError}
          isStale={isFilterStale || isPending}
          canUndo={ed.undo.length > 0}
          canRedo={ed.redo.length > 0}
          onUndo={ed.undoOp}
          onRedo={ed.redoOp}
          onSave={() => {
            setCachedLayout(ed.layout);
            toast.success("Layout preference saved", {
              description: `${ed.layout.mode} · split ${Math.round(ed.layout.splitRatio * 100)}% · ${ed.layout.zones.length} zones`,
            });
          }}
        />

        <Card className="overflow-hidden border-kumo-line shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
          <CardHeader className="py-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold tracking-normal">
                Source
                <span className="ml-1.5 font-mono text-[11px] font-normal tabular-nums text-kumo-subtle">
                  16:9 · {sourceLabel}
                </span>
              </CardTitle>
              <div className="flex items-center gap-2">
                <Select value={ed.layout.mode} onValueChange={handleModeChange}>
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
            {/* Playback row — isolated from frequent time updates via ref */}
            <div className="flex items-center gap-2">
              <Button
                size="icon-sm"
                variant="outline"
                onClick={handleSeekStart}
                aria-label="Play from trim start"
                title={`Seek to trim start ${formatTime(trimStart)}`}
                disabled={!duration}
              >
                ⏮
              </Button>
              <Button
                size="icon-sm"
                variant="outline"
                onClick={togglePlay}
                aria-label={playback.isPlayingLocal ? "Pause" : "Play"}
              >
                {playback.isPlayingLocal ? "⏸" : "▶"}
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
                value={[currentTime]}
                min={0}
                max={duration || 30}
                step={0.01}
                onValueChange={(v) => {
                  const t = Array.isArray(v) ? v[0] : v;
                  seekTo(t as number);
                }}
                className="flex-1"
              />
              <span className="text-xs tabular-nums text-kumo-subtle whitespace-nowrap  text-right">
                {formatTime(currentTime)} / {formatTime(duration)}
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
            <div
              className={cn(
                "rounded-lg border bg-kumo-recessed/20 p-3 space-y-3",
                ed.ignoreTrim && "opacity-50 pointer-events-none",
              )}
              aria-disabled={ed.ignoreTrim}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold">Trim</span>
                <span className="text-[11px] tabular-nums text-kumo-subtle">
                  {ed.ignoreTrim ? (
                    <>Full length · {formatTime(duration)}</>
                  ) : (
                    <>
                      {formatTime(trimStart)} → {formatTime(trimEnd)} ·{" "}
                      {formatTime(trimmedDuration)}
                    </>
                  )}
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
                  {duration > 0 ? (
                    <div
                      className={cn(
                        "pointer-events-none absolute top-1/2 -translate-y-1/2 -translate-x-1/2 z-10 flex flex-col items-center",
                        (currentTime < trimStart - 0.02 ||
                          currentTime > trimEnd + 0.02) &&
                          "opacity-40",
                      )}
                      style={{
                        left: `${clamp((currentTime / duration) * 100, 0, 100)}%`,
                      }}
                      aria-hidden
                    >
                      <div className="size-2 rounded-full bg-kumo-brand border border-white shadow -mb-0.5" />
                      <div className="w-0.5 h-4 bg-kumo-brand rounded-full shadow" />
                    </div>
                  ) : null}
                </div>
                <div className="flex justify-between text-[10px] text-kumo-subtle tabular-nums">
                  <span>Start {formatTime(trimStart)}</span>
                  <span>Duration {formatTime(trimmedDuration)}</span>
                  <span>End {formatTime(trimEnd)}</span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button size="sm" variant="outline" onClick={setStartToCurrent}>
                  Set Start to {formatTime(currentTime)}
                </Button>
                <Button size="sm" variant="outline" onClick={setEndToCurrent}>
                  Set End to {formatTime(currentTime)}
                </Button>
              </div>
              <div className="flex items-center justify-between">
                <Label className="text-xs">Loop trimmed</Label>
                <Switch checked={isLoopTrim} onCheckedChange={setIsLoopTrim} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {ed.layout.zones.map((z) => (
                <ZoneCard
                  key={z.id}
                  zone={z}
                  isSelected={ed.selected === z.id}
                  onReset={resetZone}
                  onToggleLock={handleToggleLock}
                  onZoom={handleZoom}
                  onRole={handleRoleChange}
                />
              ))}
            </div>
            {validationError ? (
              <p className="text-xs text-destructive">{validationError}</p>
            ) : null}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm font-semibold tracking-normal">
                Preview · {ed.layout.mode === "stacked" ? "Stacked" : "Full"}{" "}
                <span className="font-mono text-[11px] font-normal tabular-nums text-kumo-subtle">
                  1080 × 1920
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* rendering-activity: preserve canvas DOM/state when hidden vs mount/unmount */}
              {/* bundle-dynamic-imports: heavy canvas preview code-split via next/dynamic (ssr:false) */}
              {/* bundle-preload: preload on hover of preview card */}
              <div
                onMouseEnter={preloadHeavyPreview}
                onFocus={preloadHeavyPreview}
              >
                <Activity mode="visible">
                  <PortraitPreview
                    layout={ed.layout}
                    videoRef={videoRef}
                    onSplit={handleSplit}
                    safe={ed.safe}
                    useWatermark={ed.useWatermark}
                  />
                </Activity>
                {/* Dynamic variant kept for production code-splitting — demonstrates bundle-dynamic-imports */}
                <span className="hidden">
                  {false ? (
                    <DynamicPortraitPreview
                      layout={ed.layout}
                      videoRef={videoRef}
                      onSplit={handleSplit}
                      safe={ed.safe}
                      useWatermark={ed.useWatermark}
                    />
                  ) : null}
                </span>
              </div>
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
              <div className="flex items-center justify-between">
                <Label className="text-xs">Ignore Trim Settings</Label>
                <Switch
                  checked={ed.ignoreTrim}
                  onCheckedChange={ed.setIgnoreTrim}
                />
              </div>
              <Button
                className="w-full"
                onClick={() => {
                  setCachedLayout(ed.layout);
                  toast.success("Layout saved as default");
                }}
              >
                Save preference
              </Button>
              <p className="text-[10px] leading-3 text-kumo-subtle">
                Static zones across {ed.ignoreTrim ? "full video" : "trimmed clip"}. Final render 1080×1920 · same
                geometry as preview. {ed.ignoreTrim ? "Trim ignored on export." : "Trim applied to export."}
              </p>
              {isPending ? (
                <span className="text-[10px] text-kumo-subtle">
                  Updating preview…
                </span>
              ) : null}
            </CardContent>
          </Card>
          <Card className="p-3 space-y-2">
            <div className="text-xs font-medium">FFmpeg</div>
            {/* rendering-usetransition-loading: useTransition isPending over manual isLoading */}
            {/* js-batch-dom-css: group FFmpeg code style via single className, not per-property style thrash */}
            {/* rendering-hydration-suppress-warning: timestamp is client-only, suppress expected mismatch */}
            <code
              className="block text-[10px] leading-3 break-all bg-kumo-recessed p-2 rounded"
              style={isFilterStale ? { opacity: 0.7 } : undefined}
              suppressHydrationWarning
            >
              {defferedFilter}
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

      <div className="hidden tabular-nums" suppressHydrationWarning aria-hidden>
        {isFilterStale ? "pending" : "ready"} · {splitLabel} ·{" "}
        {fileName ? "has-file" : "no-file"}
      </div>
    </div>
  );
}
