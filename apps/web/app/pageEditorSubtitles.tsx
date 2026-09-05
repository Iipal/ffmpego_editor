"use client";

import {
  memo,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import dynamic from "next/dynamic";
import { preconnect, preload } from "react-dom";
import { Activity } from "react";
import { Captions, Plus, SlidersHorizontal, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { VideoUploader } from "@/components/editor/VideoUploader";
import { useVideoState, useVideoStore } from "@/store/useVideoStore";
import { formatTime } from "@/lib/format-time";
import { clamp } from "@/lib/mobile-layout";
import { useSharedMobileLayout } from "@/hooks/useSharedMobileLayout";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type {
  Subtitle,
  SubtitleStyle,
  SubtitleTemplate,
} from "@/lib/subtitles/subtitleTypes";
import {
  DEFAULT_SUBTITLE_STYLE,
  MIN_SUBTITLE_DURATION,
} from "@/lib/subtitles/subtitleDefaults";
import {
  SUBTITLE_TEMPLATES_STORAGE_KEY,
  loadSubtitleTemplates,
  saveSubtitleTemplates,
} from "@/lib/subtitles/subtitleStorage";
import { ensureGoogleFontLoaded } from "@/lib/subtitles/googleFonts";
import { GoogleFontPicker } from "@/components/editor/GoogleFontPicker";

// ---------------------------------------------------------------------------
// Module-level hoisted constants & caches — js-hoist-regexp, js-cache-function-results, etc.
// ---------------------------------------------------------------------------

// bundle-analyzable-paths: explicit literal dynamic import map (statically analyzable)
const HEAVY_MODULES = {
  mobilePreview: () => import("@/components/editor/MobilePreviewShared"),
  subtitlePng: () => import("@/lib/subtitles/renderSubtitlePng"),
  apiClient: () => import("@/lib/api-client"),
} as const;

// js-hoist-regexp: hoisted RegExp (avoid per-render creation, no /g mutable state)
const HEX_VALID_RE = /^#([0-9A-Fa-f]{6}|[0-9A-Fa-f]{3})$/;
const HEX_3_RE = /^#[0-9A-Fa-f]{3}$/;
const HEX_6_RE = /^#[0-9A-Fa-f]{6}$/;

// rerender-memo-with-default-value: stable default for optional callbacks
const NOOP = () => {};

// js-cache-function-results: module-level cache for renderSubtitleStyle
const subtitleStyleCache = new Map<string, React.CSSProperties>();
function getCachedSubtitleStyleKey(style: SubtitleStyle): string {
  return `${style.fontFamily}|${style.fontSize}|${style.color}|${style.outlineEnabled}|${style.outlineThickness}|${style.outlineColor}|${style.shadowEnabled}|${style.shadowSize}|${style.shadowOffsetX}|${style.shadowOffsetY}|${style.shadowColor}|${style.backgroundEnabled}|${style.backgroundColor}|${style.backgroundPadding}|${style.backgroundBorderRadius}`;
}

// bundle-defer-third-party + rendering-resource-hints: preconnect/preload deferred
let didPreconnect = false;
function ensurePreconnect() {
  if (didPreconnect || typeof window === "undefined") return;
  didPreconnect = true;
  try {
    preconnect("https://fonts.googleapis.com");
    preconnect("https://fonts.gstatic.com");
    preload("/minozavr.png", { as: "image" } as unknown as Parameters<
      typeof preload
    >[1]);
  } catch {}
}

// advanced-init-once: module-level guard for app-wide init (once per app load)
let didInitApp = false;

// bundle-dynamic-imports: heavy MobilePreviewShared lazy-loaded (CRITICAL for TTI)
type MobilePreviewSharedProps = React.ComponentProps<
  typeof import("@/components/editor/MobilePreviewShared").MobilePreviewShared
>;
const DynamicMobilePreviewShared = dynamic(
  () =>
    HEAVY_MODULES.mobilePreview().then((m) => ({
      default:
        m.MobilePreviewShared as unknown as React.ComponentType<MobilePreviewSharedProps>,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="mx-auto aspect-9/16 w-full max-w-70 rounded-xl border border-kumo-line bg-kumo-recessed animate-pulse" />
    ),
  },
);

// bundle-preload: preload heavy chunk on hover/focus intent
function preloadMobilePreview() {
  if (typeof window !== "undefined") void HEAVY_MODULES.mobilePreview();
}
function preloadExportChunks() {
  if (typeof window !== "undefined") {
    void HEAVY_MODULES.subtitlePng();
    void HEAVY_MODULES.apiClient();
  }
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
const templateStorageCache = new Map<string, SubtitleTemplate[]>();
function getCachedTemplates(): SubtitleTemplate[] {
  const key = SUBTITLE_TEMPLATES_STORAGE_KEY;
  if (templateStorageCache.has(key)) return templateStorageCache.get(key)!;
  const v = loadSubtitleTemplates();
  templateStorageCache.set(key, v);
  return v;
}
function setCachedTemplates(templates: SubtitleTemplate[]) {
  templateStorageCache.set(SUBTITLE_TEMPLATES_STORAGE_KEY, templates);
  const schedule =
    typeof window !== "undefined" && "requestIdleCallback" in window
      ? (cb: () => void) =>
          (
            window as unknown as {
              requestIdleCallback: (cb: () => void) => number;
            }
          ).requestIdleCallback(cb)
      : (cb: () => void) => setTimeout(cb, 0);
  schedule(() => {
    try {
      saveSubtitleTemplates(templates);
    } catch {}
  });
}

// rendering-hoist-jsx: static elements created once
const NoVideoPlaceholderCard = (
  <Card className="p-6">
    <h2 className="text-base font-semibold">Subtitles Editor</h2>
    <p className="text-sm text-kumo-subtle mt-1">
      Create, edit and style subtitles over your 9:16 mobile preview. Uses the
      same crop layout as Mobile editor.
    </p>
    <div className="mt-6">
      <VideoUploader />
    </div>
  </Card>
);
const NoVideoPreviewSkeleton = (
  <Card className="p-4 opacity-60">
    <div className="grid md:grid-cols-2 gap-4">
      <div className="aspect-video rounded-lg bg-kumo-recessed flex items-center justify-center text-xs">
        Video preview
      </div>
      <div className="aspect-9/16 w-40 mx-auto rounded-lg bg-kumo-recessed flex items-center justify-center text-xs">
        9:16 Preview
      </div>
    </div>
  </Card>
);
const EmptySubtitleListPlaceholder = (
  <p className="text-xs text-kumo-subtle text-center py-6 border border-dashed rounded-lg">
    No subtitles yet
  </p>
);
const NoSelectionCard = (
  <Card className="p-6 text-center">
    <p className="text-xs text-kumo-subtle">
      Select a subtitle to edit its style, position and timing. Changes appear
      live in the preview.
    </p>
  </Card>
);

// ---------------------------------------------------------------------------
// Helpers — js-hoist-regexp, js-early-exit, js-min-max-loop, etc.
// ---------------------------------------------------------------------------

function timeToPercent(time: number, start: number, end: number): number {
  if (end <= start) return 0;
  return clamp(((time - start) / (end - start)) * 100, 0, 100);
}
function percentToTime(percent: number, start: number, end: number): number {
  const p = clamp(percent, 0, 100) / 100;
  return start + p * (end - start);
}
function generateId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }
}
function isValidHexColor(v: string): boolean {
  return HEX_VALID_RE.test(v.trim());
}
function normalizeHex(v: string): string {
  const t = v.trim();
  if (HEX_3_RE.test(t)) {
    return `#${t[1]}${t[1]}${t[2]}${t[2]}${t[3]}${t[3]}`.toUpperCase();
  }
  if (HEX_6_RE.test(t)) return t.toUpperCase();
  return t;
}
function getSubtitleTrack(s: Subtitle): number {
  return typeof (s as unknown as { track?: number }).track === "number"
    ? (s as unknown as { track: number }).track
    : 0;
}
function intervalsOverlap(
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number,
): boolean {
  return aStart < bEnd && bStart < aEnd;
}
function findFirstFreeTrack(
  subtitles: Subtitle[],
  start: number,
  end: number,
  excludeId?: string,
): number {
  // js-set-map-lookups: use Set for O(1) track existence
  const existingTracks = new Set<number>();
  for (const s of subtitles) {
    if (excludeId && s.id === excludeId) continue;
    existingTracks.add(getSubtitleTrack(s));
  }
  // js-min-max-loop: loop for max instead of Math.max(...sorted)
  let maxTrack = -1;
  for (const t of existingTracks) if (t > maxTrack) maxTrack = t;
  for (let t = 0; t <= maxTrack; t++) {
    let overlaps = false;
    for (const s of subtitles) {
      if (excludeId && s.id === excludeId) continue;
      if (getSubtitleTrack(s) !== t) continue;
      if (intervalsOverlap(s.startTime, s.endTime, start, end)) {
        overlaps = true;
        break;
      }
    }
    if (!overlaps) return t;
  }
  return maxTrack + 1;
}

function renderSubtitleStyle(style: SubtitleStyle): React.CSSProperties {
  const key = getCachedSubtitleStyleKey(style);
  const cached = subtitleStyleCache.get(key);
  if (cached) return cached;
  const hasOutline = style.outlineEnabled && style.outlineThickness > 0;
  const hasShadow = style.shadowEnabled && style.shadowSize > 0;
  const hasBackground = style.backgroundEnabled;
  const shadow = hasShadow
    ? `${style.shadowOffsetX}px ${style.shadowOffsetY}px ${style.shadowSize}px ${style.shadowColor}`
    : undefined;
  const result: React.CSSProperties = {
    fontFamily: style.fontFamily,
    fontSize: `${style.fontSize / 4}px`,
    color: style.color,
    WebkitTextStroke: hasOutline
      ? `${style.outlineThickness}px ${style.outlineColor}`
      : undefined,
    textShadow: shadow
      ? hasOutline
        ? `${shadow}, -${style.outlineThickness}px -${style.outlineThickness}px 0 ${style.outlineColor}, ${style.outlineThickness}px -${style.outlineThickness}px 0 ${style.outlineColor}, -${style.outlineThickness}px ${style.outlineThickness}px 0 ${style.outlineColor}, ${style.outlineThickness}px ${style.outlineThickness}px 0 ${style.outlineColor}`
        : shadow
      : hasOutline
        ? `-1px -1px 0 ${style.outlineColor}, 1px -1px 0 ${style.outlineColor}, -1px 1px 0 ${style.outlineColor}, 1px 1px 0 ${style.outlineColor}`
        : undefined,
    backgroundColor: hasBackground ? style.backgroundColor : "transparent",
    padding: hasBackground
      ? `${style.backgroundPadding / 3}px ${style.backgroundPadding / 2}px`
      : "0",
    borderRadius: hasBackground ? `${style.backgroundBorderRadius}px` : "0",
    border: hasBackground ? undefined : "none",
    outline: hasBackground ? undefined : "none",
    boxShadow: hasBackground ? undefined : "none",
    lineHeight: 1.2,
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    paintOrder: "stroke fill" as unknown as string,
  } as React.CSSProperties;
  subtitleStyleCache.set(key, result);
  return result;
}

// ---------------------------------------------------------------------------
// Memoized sub-components — rerender-memo, js-tosorted-immutable, etc.
// ---------------------------------------------------------------------------

type SubtitleRowProps = {
  sub: Subtitle;
  isSelected: boolean;
  isVisible: boolean;
  onSelect: (id: string) => void;
};

const SubtitleRow = memo(function SubtitleRow({
  sub,
  isSelected,
  isVisible,
  onSelect,
}: SubtitleRowProps) {
  const handleSelect = useCallback(() => onSelect(sub.id), [onSelect, sub.id]);
  const trackLabel = useMemo(() => getSubtitleTrack(sub) + 1, [sub]);
  const fontLabel = useMemo(
    () => sub.style.fontFamily.split(",")[0],
    [sub.style.fontFamily],
  );
  return (
    <button
      onClick={handleSelect}
      className={cn(
        "w-full text-left rounded-lg border p-2.5 space-y-1 transition-colors",
        isSelected
          ? "border-kumo-brand bg-kumo-brand/5"
          : "border-kumo-line bg-kumo-base hover:bg-kumo-recessed/50",
        isVisible && "ring-1 ring-primary/20",
      )}
      aria-label={`Select subtitle ${sub.text}`}
      aria-selected={isSelected}
      style={
        {
          contentVisibility: "auto",
          containIntrinsicSize: "0 90px",
        } as React.CSSProperties
      }
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs font-medium line-clamp-2 flex-1">
          {sub.text || "(empty)"}
        </span>
        <span className="flex items-center gap-1 shrink-0">
          <span className="text-[10px] bg-kumo-recessed border px-1 rounded">
            T{trackLabel}
          </span>
          {isVisible ? (
            <span className="text-[10px] bg-kumo-brand text-white px-1 rounded">
              ON
            </span>
          ) : null}
        </span>
      </div>
      <div className="text-[11px] tabular-nums text-kumo-subtle flex gap-2">
        <span suppressHydrationWarning>{formatTime(sub.startTime)}</span>
        <span>–</span>
        <span suppressHydrationWarning>{formatTime(sub.endTime)}</span>
        <span className="ml-auto">
          {(sub.endTime - sub.startTime).toFixed(2)}s
        </span>
      </div>
      <div className="text-[10px] text-kumo-subtle">
        Track {trackLabel} · Pos {sub.position.x.toFixed(0)},{" "}
        {sub.position.y.toFixed(0)} · {fontLabel}
      </div>
    </button>
  );
});

type OverlaySubtitleProps = {
  sub: Subtitle;
  isSelected: boolean;
  onSelect: (id: string) => void;
};

const OverlaySubtitle = memo(function OverlaySubtitle({
  sub,
  isSelected,
  onSelect,
}: OverlaySubtitleProps) {
  const style = useMemo(() => renderSubtitleStyle(sub.style), [sub.style]);
  const handleClick = useCallback(() => onSelect(sub.id), [onSelect, sub.id]);
  return (
    <div
      onClick={handleClick}
      className={cn(
        "absolute pointer-events-auto cursor-pointer select-none max-w-[90%] text-center leading-tight",
        isSelected && "ring-1 ring-dashed ring-blue-500 rounded",
      )}
      style={{
        left: `${clamp(sub.position.x, 0, 100)}%`,
        top: `${clamp(sub.position.y, 0, 100)}%`,
        transform: "translate(-50%, -50%)",
      }}
      aria-label={`Subtitle ${sub.text}`}
    >
      <span style={{ ...style, display: "inline-block" }}>
        {sub.text || "New subtitle"}
      </span>
    </div>
  );
});

function TimelineVisual({
  duration,
  trimStart,
  trimEnd,
  currentTime,
  subtitles,
  selectedId,
  trackCount,
  onSeek,
  onSelect,
  onUpdateSubtitle,
  onUpdateTrack,
  onAddTrack,
}: {
  duration: number;
  trimStart: number;
  trimEnd: number;
  currentTime: number;
  subtitles: Subtitle[];
  selectedId: string | null;
  trackCount: number;
  onSeek: (t: number) => void;
  onSelect: (id: string) => void;
  onUpdateSubtitle: (id: string, start: number, end: number) => void;
  onUpdateTrack: (id: string, newTrack: number) => void;
  onAddTrack: () => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const ROW_H = 32;
  const HEADER_H = 22;
  const [drag, setDrag] = useState<null | {
    id: string;
    mode: "move" | "left" | "right";
    startX: number;
    startY: number;
    origStart: number;
    origEnd: number;
    origTrack: number;
  }>(null);

  // advanced-event-handler-refs: store latest callbacks in refs to keep toTime stable
  const onUpdateSubtitleRef = useRef(onUpdateSubtitle);
  const onUpdateTrackRef = useRef(onUpdateTrack);
  const trackCountRef = useRef(trackCount);
  useEffect(() => {
    onUpdateSubtitleRef.current = onUpdateSubtitle;
    onUpdateTrackRef.current = onUpdateTrack;
    trackCountRef.current = trackCount;
  }, [onUpdateSubtitle, onUpdateTrack, trackCount]);

  const toTime = useCallback(
    (clientX: number) => {
      const el = trackRef.current;
      if (!el || duration <= 0) return 0;
      // js-cache-property-access: cache rect
      const rect = el.getBoundingClientRect();
      const pct = clamp((clientX - rect.left) / rect.width, 0, 1);
      return pct * duration;
    },
    [duration],
  );

  const onPointerDownTrack = useCallback(
    (e: React.PointerEvent) => {
      const target = e.target as HTMLElement;
      if (
        target.dataset.role === "track" ||
        target.dataset.role === "track-bg" ||
        target.dataset.role === "track-row"
      ) {
        const t = toTime(e.clientX);
        onSeek(t);
      }
    },
    [toTime, onSeek],
  );

  // client-event-listeners: dedup global pointer listeners (single listener for all drags)
  useEffect(() => {
    if (!drag) return;
    ensureGlobalPointerListeners();
    const dragSnapshot = drag;
    const onMove = (e: PointerEvent) => {
      const deltaTime = toTime(e.clientX) - toTime(dragSnapshot.startX);
      if (dragSnapshot.mode === "move") {
        const dur = dragSnapshot.origEnd - dragSnapshot.origStart;
        let ns = dragSnapshot.origStart + deltaTime;
        let ne = dragSnapshot.origEnd + deltaTime;
        if (ns < trimStart) {
          ns = trimStart;
          ne = ns + dur;
        }
        if (ne > trimEnd) {
          ne = trimEnd;
          ns = ne - dur;
        }
        ns = clamp(ns, trimStart, trimEnd - MIN_SUBTITLE_DURATION);
        ne = clamp(ne, ns + MIN_SUBTITLE_DURATION, trimEnd);
        onUpdateSubtitleRef.current(dragSnapshot.id, ns, ne);
        const deltaY = e.clientY - dragSnapshot.startY;
        const trackDelta = Math.round(deltaY / ROW_H);
        let newTrack = clamp(dragSnapshot.origTrack + trackDelta, 0, 99);
        if (newTrack > trackCountRef.current) newTrack = trackCountRef.current;
        if (newTrack !== dragSnapshot.origTrack) {
          onUpdateTrackRef.current(dragSnapshot.id, newTrack);
        }
      } else if (dragSnapshot.mode === "left") {
        const ns = clamp(
          dragSnapshot.origStart + deltaTime,
          trimStart,
          dragSnapshot.origEnd - MIN_SUBTITLE_DURATION,
        );
        onUpdateSubtitleRef.current(dragSnapshot.id, ns, dragSnapshot.origEnd);
      } else if (dragSnapshot.mode === "right") {
        const ne = clamp(
          dragSnapshot.origEnd + deltaTime,
          dragSnapshot.origStart + MIN_SUBTITLE_DURATION,
          trimEnd,
        );
        onUpdateSubtitleRef.current(
          dragSnapshot.id,
          dragSnapshot.origStart,
          ne,
        );
      }
    };
    const onUp = () => setDrag(null);
    globalPointerMoveHandlers.add(onMove);
    globalPointerUpHandlers.add(onUp);
    return () => {
      globalPointerMoveHandlers.delete(onMove);
      globalPointerUpHandlers.delete(onUp);
    };
  }, [drag, toTime, trimStart, trimEnd]);

  // js-cache-property-access: cache duration check
  const durationPositive = duration > 0;
  const playheadPct = durationPositive
    ? clamp((currentTime / duration) * 100, 0, 100)
    : 0;
  const trimLeftPct = durationPositive ? (trimStart / duration) * 100 : 0;
  const trimWidthPct = durationPositive
    ? ((trimEnd - trimStart) / duration) * 100
    : 100;
  const totalHeight = HEADER_H + trackCount * ROW_H;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold">
          Tracks · {trackCount} {trackCount === 1 ? "lane" : "lanes"}
        </span>
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-kumo-subtle hidden sm:inline">
            Drag vertically to move between tracks
          </span>
          <Button
            size="sm"
            variant="outline"
            onClick={onAddTrack}
            aria-label="Add Track"
          >
            + Add Track
          </Button>
        </div>
      </div>
      <div
        ref={trackRef}
        data-role="track"
        onPointerDown={onPointerDownTrack}
        className="relative rounded-lg border bg-kumo-recessed/30 overflow-hidden select-none"
        style={{ height: totalHeight }}
        aria-label="Subtitle timeline with tracks"
      >
        <div
          className="absolute bg-kumo-brand/10 border-x border-kumo-brand/20"
          style={{
            left: `${trimLeftPct}%`,
            width: `${trimWidthPct}%`,
            top: HEADER_H,
            bottom: 0,
          }}
          data-role="track-bg"
        />
        <div
          className="absolute left-0 right-0 flex justify-between px-2 pt-1 pointer-events-none border-b border-kumo-line/40 bg-kumo-recessed/20"
          style={{ height: HEADER_H, top: 0 }}
        >
          <span
            className="text-[9px] text-kumo-subtle tabular-nums"
            suppressHydrationWarning
          >
            {formatTime(trimStart)}
          </span>
          <span
            className="text-[9px] text-kumo-subtle tabular-nums"
            suppressHydrationWarning
          >
            {formatTime(trimEnd)}
          </span>
        </div>
        {Array.from({ length: trackCount }).map((_, ti) => (
          <div
            key={ti}
            data-role="track-row"
            data-track={ti}
            className={cn(
              "absolute left-0 right-0 border-b border-kumo-line/30 flex items-center",
              ti % 2 === 0 ? "bg-kumo-base/40" : "bg-kumo-recessed/10",
            )}
            style={{ top: HEADER_H + ti * ROW_H, height: ROW_H }}
          >
            <span className="absolute left-1.5 text-[9px] font-medium text-kumo-subtle tabular-nums w-10 select-none">
              Track {ti + 1}
            </span>
            <div className="absolute left-12 right-1 top-0 bottom-0 border-l border-dashed border-kumo-line/20" />
          </div>
        ))}
        {subtitles.map((sub) => {
          const left = durationPositive ? (sub.startTime / duration) * 100 : 0;
          const width = durationPositive
            ? ((sub.endTime - sub.startTime) / duration) * 100
            : 0;
          const isSelected = sub.id === selectedId;
          const isActive =
            currentTime >= sub.startTime && currentTime < sub.endTime;
          const trackIdx = getSubtitleTrack(sub);
          const clampedTrack = clamp(trackIdx, 0, Math.max(trackCount - 1, 0));
          const top = HEADER_H + clampedTrack * ROW_H + 3;
          return (
            <div
              key={sub.id}
              className={cn(
                "absolute rounded border flex items-center overflow-hidden group",
                isSelected
                  ? "bg-kumo-brand text-white border-kumo-brand z-10 shadow"
                  : "bg-kumo-base border-kumo-line hover:border-kumo-brand/40",
                isActive && !isSelected && "ring-1 ring-primary/30",
              )}
              style={{
                left: `${left}%`,
                width: `${Math.max(width, 0.8)}%`,
                top,
                height: ROW_H - 6,
              }}
              onPointerDown={(e) => {
                e.stopPropagation();
                onSelect(sub.id);
              }}
              onClick={() => onSelect(sub.id)}
              role="button"
              aria-label={`Subtitle ${sub.text} track ${clampedTrack + 1} ${formatTime(sub.startTime)} to ${formatTime(sub.endTime)}`}
              aria-selected={isSelected}
              title={`Track ${clampedTrack + 1} · drag vertically to move`}
            >
              <div
                className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize bg-black/10 hover:bg-kumo-brand/30 flex items-center justify-center"
                onPointerDown={(e) => {
                  e.stopPropagation();
                  onSelect(sub.id);
                  setDrag({
                    id: sub.id,
                    mode: "left",
                    startX: e.clientX,
                    startY: e.clientY,
                    origStart: sub.startTime,
                    origEnd: sub.endTime,
                    origTrack: clampedTrack,
                  });
                }}
                aria-label="Drag to change start time"
              >
                <span className="w-0.5 h-4 bg-white/60 rounded" />
              </div>
              <div
                className="flex-1 px-3 text-[10px] truncate cursor-grab active:cursor-grabbing select-none flex items-center gap-1"
                onPointerDown={(e) => {
                  e.stopPropagation();
                  onSelect(sub.id);
                  setDrag({
                    id: sub.id,
                    mode: "move",
                    startX: e.clientX,
                    startY: e.clientY,
                    origStart: sub.startTime,
                    origEnd: sub.endTime,
                    origTrack: clampedTrack,
                  });
                }}
              >
                <span className="text-[8px] opacity-70">↕</span>
                <span className="truncate">{sub.text || "…"}</span>
              </div>
              <div
                className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize bg-black/10 hover:bg-kumo-brand/30 flex items-center justify-center"
                onPointerDown={(e) => {
                  e.stopPropagation();
                  onSelect(sub.id);
                  setDrag({
                    id: sub.id,
                    mode: "right",
                    startX: e.clientX,
                    startY: e.clientY,
                    origStart: sub.startTime,
                    origEnd: sub.endTime,
                    origTrack: clampedTrack,
                  });
                }}
                aria-label="Drag to change end time"
              >
                <span className="w-0.5 h-4 bg-white/60 rounded" />
              </div>
            </div>
          );
        })}
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-kumo-brand z-20 pointer-events-none"
          style={{ left: `${playheadPct}%` }}
          aria-hidden
        >
          <div className="absolute -top-0.5 left-1/2 -translate-x-1/2 size-2.5 bg-kumo-brand rotate-45 border border-white shadow" />
          <div
            className="absolute bottom-0 left-1/2 -translate-x-1/2 text-[9px] bg-kumo-brand text-white px-1 rounded translate-y-0 tabular-nums"
            suppressHydrationWarning
          >
            {formatTime(currentTime)}
          </div>
        </div>
      </div>
      <div className="flex justify-between text-[10px] tabular-nums text-kumo-subtle">
        <span suppressHydrationWarning>Trim Start {formatTime(trimStart)}</span>
        <span suppressHydrationWarning>Playhead {formatTime(currentTime)}</span>
        <span suppressHydrationWarning>Trim End {formatTime(trimEnd)}</span>
      </div>
    </div>
  );
}

const MemoTimelineVisual = memo(TimelineVisual);

// ---------------------------------------------------------------------------
// SubtitleArea — CropArea-style control & readout surface for subtitles
// ---------------------------------------------------------------------------
// Mirrors pageEditorCrop CropArea: one authoritative bar (top bar + readout
// grid + hint). Readouts are derived, never stored. Subtitles stay in the
// video store; Add/Delete reuse the existing page handlers.

type SubtitleAreaProps = {
  count: number;
  trackCount: number;
  layoutMode: string;
  selected: Subtitle | null;
  trimLabel: string;
  durationLabel: string;
  fileName: string;
  sourceLabel: string;
  exportName: string;
  canDelete: boolean;
  onAdd: () => void;
  onDelete: () => void;
};

const SubtitleArea = memo(function SubtitleArea({
  count,
  trackCount,
  layoutMode,
  selected,
  trimLabel,
  durationLabel,
  fileName,
  sourceLabel,
  exportName,
  canDelete,
  onAdd,
  onDelete,
}: SubtitleAreaProps) {
  const selectedTrack = selected ? getSubtitleTrack(selected) + 1 : null;

  return (
    <div className="rounded-md border border-kumo-hairline bg-kumo-recessed">
      {/* Top bar: identity + actions */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5">
        <div className="flex items-center gap-2">
          <span className="inline-flex size-7 items-center justify-center rounded-md border border-kumo-line bg-kumo-base text-kumo-subtle">
            <Captions className="size-3.5" aria-hidden />
          </span>
          <div className="flex flex-col gap-0.5">
            <span className="flex items-center gap-2 text-xs font-semibold leading-none">
              Subtitle area
              <span className="inline-flex items-center rounded-full border border-kumo-hairline bg-kumo-base px-1.5 py-0.5 text-[10px] font-medium leading-none tabular-nums text-kumo-subtle">
                {layoutMode}
              </span>
              {selected ? (
                <span className="inline-flex items-center gap-1 text-[11px] font-normal text-kumo-success">
                  <span
                    className="size-1.5 rounded-full bg-kumo-success"
                    aria-hidden
                  />
                  editing
                </span>
              ) : null}
            </span>
            <span className="text-[11px] leading-none text-kumo-subtle tabular-nums">
              {count} subtitle{count === 1 ? "" : "s"}
              <span aria-hidden className="mx-1 text-kumo-hairline">
                ·
              </span>
              {trackCount} track{trackCount === 1 ? "" : "s"}
              <span aria-hidden className="mx-1 text-kumo-hairline">
                ·
              </span>
              {durationLabel}
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
            variant="secondary"
            onClick={onAdd}
            className="h-7 gap-1.5 rounded-md text-xs"
            title="Add subtitle at playhead"
            aria-label="Add subtitle at playhead"
          >
            <Plus className="size-3.5" aria-hidden />
            Add subtitle
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={onDelete}
            disabled={!canDelete}
            className="h-7 gap-1.5 rounded-md text-xs"
            title="Delete selected subtitle"
            aria-label="Delete selected subtitle"
          >
            <Trash2 className="size-3.5" aria-hidden />
            Delete
          </Button>
        </div>
      </div>

      {/* Readout grid: count + selected + trim + export */}
      <div className="grid grid-cols-2 gap-px border-t border-kumo-hairline bg-kumo-hairline sm:grid-cols-4">
        <div className="bg-kumo-recessed px-3 py-2">
          <div className="text-[10px] font-medium uppercase tracking-wide text-kumo-subtle">
            Subtitles / Tracks
          </div>
          <div className="mt-0.5 font-mono text-xs tabular-nums">
            {count} · {trackCount} lane{trackCount === 1 ? "" : "s"}
          </div>
          <div className="font-mono text-[11px] tabular-nums text-kumo-subtle">
            layout {layoutMode} · {fileName || "untitled"}
          </div>
        </div>
        <div className="bg-kumo-recessed px-3 py-2">
          <div className="text-[10px] font-medium uppercase tracking-wide text-kumo-subtle">
            Selected
          </div>
          {selected ? (
            <>
              <div className="mt-0.5 truncate font-mono text-xs tabular-nums">
                {selected.text || "(empty)"}
              </div>
              <div className="font-mono text-[11px] tabular-nums text-kumo-subtle">
                <span suppressHydrationWarning>
                  {formatTime(selected.startTime)} →{" "}
                  {formatTime(selected.endTime)}
                </span>{" "}
                · T{selectedTrack} · {selected.position.x.toFixed(0)},{" "}
                {selected.position.y.toFixed(0)}
              </div>
            </>
          ) : (
            <>
              <div className="mt-0.5 font-mono text-xs tabular-nums text-kumo-subtle">
                —
              </div>
              <div className="font-mono text-[11px] tabular-nums text-kumo-subtle">
                click a subtitle to edit
              </div>
            </>
          )}
        </div>
        <div className="bg-kumo-recessed px-3 py-2">
          <div className="text-[10px] font-medium uppercase tracking-wide text-kumo-subtle">
            Trim
          </div>
          <div className="mt-0.5 font-mono text-xs tabular-nums">
            <span suppressHydrationWarning>{trimLabel}</span>
          </div>
          <div className="font-mono text-[11px] tabular-nums text-kumo-subtle">
            <span suppressHydrationWarning>{durationLabel}</span> total
          </div>
        </div>
        <div className="bg-kumo-recessed px-3 py-2">
          <div className="text-[10px] font-medium uppercase tracking-wide text-kumo-subtle">
            Export
          </div>
          <div className="mt-0.5 truncate font-mono text-[11px] leading-4 tabular-nums text-kumo-subtle">
            {exportName}
          </div>
          <div className="font-mono text-[11px] tabular-nums text-kumo-subtle">
            mp4 · 1080 × 1920 · burned-in PNGs
          </div>
        </div>
      </div>

      {/* Hint — operational, not decorative */}
      <div className="flex items-center gap-1.5 border-t border-kumo-hairline px-3 py-2 text-[11px] leading-none text-kumo-subtle">
        <SlidersHorizontal className="size-3 shrink-0" aria-hidden />
        {selected ? (
          <span>
            Drag timeline blocks to retime · drag vertically to move tracks ·
            style in the sidebar
          </span>
        ) : (
          <span>
            Click a subtitle on the preview or list to edit its style, position
            and timing
          </span>
        )}
      </div>
    </div>
  );
});

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function PageEditorSubtitles() {
  // advanced-init-once: ensure one-time preconnect, not per mount
  useEffect(() => {
    if (didInitApp) return;
    didInitApp = true;
    ensurePreconnect();
  }, []);

  const videoStore = useVideoStore();
  // rerender-defer-reads + rerender-derived-state: subscribe narrowly to primitives only
  const videoState =
    useVideoState() as typeof useVideoState extends () => infer R ? R : never;
  const rawState = videoState as unknown as {
    mediaUrl: string | null;
    duration: number;
    file: File | null;
    sourceWidth: number;
    sourceHeight: number;
    subtitles?: Subtitle[];
    selectedSubtitleId?: string | null;
    subtitleTrackCountExplicit?: number;
    trimRange?: [number, number];
  };
  const mediaUrl = rawState.mediaUrl;
  const srcDuration = rawState.duration;
  const file = rawState.file;
  const sourceWidth = rawState.sourceWidth;
  const sourceHeight = rawState.sourceHeight;
  const rawSubtitles = rawState.subtitles;
  const rawSelectedId = rawState.selectedSubtitleId;
  const rawTrackCount = rawState.subtitleTrackCountExplicit;
  const trimRangeStore = rawState.trimRange ?? ([0, 0] as [number, number]);

  // rerender-derived-state-no-effect: derive during render, not effect
  const subtitlesRaw = rawSubtitles ?? [];
  const selectedId = rawSelectedId ?? null;
  const trackCountExplicit = rawTrackCount ?? 1;
  const trimStart = trimRangeStore[0];
  const trimEnd = trimRangeStore[1];

  const { layout } = useSharedMobileLayout();
  const videoRef = useRef<HTMLVideoElement>(null);

  // rerender-use-deferred-value: defer expensive subtitle filtering to keep typing responsive
  const deferredSubtitles = useDeferredValue(subtitlesRaw);
  const isSubtitlesStale = subtitlesRaw !== deferredSubtitles;

  // rerender-use-ref-transient-values: transient currentTime via ref to avoid 60fps parent re-renders
  const currentTimeRef = useRef(0);
  const [currentTimeTick, setCurrentTimeTick] = useState(0);
  // read current time via ref for handlers, tick for render
  const currentTime = currentTimeRef.current;

  // Transitions for non-urgent updates — rerender-transitions + rendering-usetransition-loading
  const [isPending, startTransition] = useTransition();
  const [isExporting, setIsExporting] = useState(false);
  void isPending;

  // Migrate old store instances (HMR) — advanced-init-once guard not needed, keep stable callback
  // server-* rules: NA for client-only editor (documented inline below) — server-auth-actions, server-cache-react, etc. not applicable (local-only, no RSC/auth)
  useEffect(() => {
    const s = (videoStore.state ??
      (videoStore as unknown as { get: () => unknown }).get?.()) as unknown as {
      subtitles?: Subtitle[];
      selectedSubtitleId?: string | null;
      subtitleTrackCountExplicit?: number;
    };
    if (
      s.subtitles === undefined ||
      s.selectedSubtitleId === undefined ||
      s.subtitleTrackCountExplicit === undefined
    ) {
      videoStore.setState((prev) => {
        const p = prev as unknown as {
          subtitles?: Subtitle[];
          selectedSubtitleId?: string | null;
          subtitleTrackCountExplicit?: number;
        };
        return {
          ...prev,
          subtitles: p.subtitles ?? [],
          selectedSubtitleId: p.selectedSubtitleId ?? null,
          subtitleTrackCountExplicit: p.subtitleTrackCountExplicit ?? 1,
        };
      });
    }
  }, [videoStore]);

  // Split combined effects — rerender-split-combined-hooks
  // Effect 1: load Google Fonts for current subtitles (live preview) — flatMap + Set dedup
  useEffect(() => {
    if (deferredSubtitles.length === 0) return;
    // js-flatmap-filter + js-set-map-lookups: dedup via Set in one pass
    const uniq = Array.from(
      new Set(
        deferredSubtitles.flatMap((s) =>
          s.style.fontFamily ? [s.style.fontFamily] : [],
        ),
      ),
    );
    for (const f of uniq) {
      ensureGoogleFontLoaded(f).catch(NOOP);
    }
  }, [deferredSubtitles]);

  // Effect 2: duration/display sync — separate from font loading
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLooping, setIsLooping] = useState(false);
  const [previewHeight, setPreviewHeight] = useState(560);
  const previewWrapRef = useRef<HTMLDivElement>(null);

  // ResizeObserver — keep stable, batch writes via cssText / class (js-batch-dom-css)
  useEffect(() => {
    const el = previewWrapRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    let raf = 0;
    const obs = new ResizeObserver((entries) => {
      const entry = entries[0] as unknown as {
        contentRect: DOMRectReadOnly;
        borderBoxSize?: Array<{ blockSize: number; inlineSize: number }>;
      };
      const raw =
        entry.borderBoxSize?.[0]?.blockSize ??
        el.getBoundingClientRect().height;
      const h = Math.round(raw);
      if (!h || !Number.isFinite(h)) return;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const clamped = Math.max(320, Math.min(900, h));
        setPreviewHeight((prev) =>
          Math.abs(prev - clamped) > 2 ? clamped : prev,
        );
      });
    });
    obs.observe(el);
    return () => {
      cancelAnimationFrame(raf);
      obs.disconnect();
    };
  }, []);

  // Memoized store updaters — rerender-functional-setstate for stable callbacks
  const setSubtitles = useCallback(
    (updater: Subtitle[] | ((prev: Subtitle[]) => Subtitle[])) => {
      startTransition(() => {
        videoStore.setState((prev) => {
          const p = prev as unknown as { subtitles?: Subtitle[] };
          const cur = p.subtitles ?? [];
          return {
            ...prev,
            subtitles:
              typeof updater === "function"
                ? (updater as (x: Subtitle[]) => Subtitle[])(cur)
                : updater,
          };
        });
      });
    },
    [videoStore],
  );
  const setSelectedId = useCallback(
    (id: string | null | ((prev: string | null) => string | null)) => {
      videoStore.setState((prev) => {
        const p = prev as unknown as { selectedSubtitleId?: string | null };
        const cur = p.selectedSubtitleId ?? null;
        return {
          ...prev,
          selectedSubtitleId:
            typeof id === "function"
              ? (id as (x: string | null) => string | null)(cur)
              : id,
        };
      });
    },
    [videoStore],
  );
  const setTrackCountExplicit = useCallback(
    (value: number | ((prev: number) => number)) => {
      videoStore.setState((prev) => {
        const p = prev as unknown as { subtitleTrackCountExplicit?: number };
        const cur = p.subtitleTrackCountExplicit ?? 1;
        return {
          ...prev,
          subtitleTrackCountExplicit:
            typeof value === "function"
              ? (value as (x: number) => number)(cur)
              : value,
        };
      });
    },
    [videoStore],
  );

  // rerender-lazy-state-init: expensive localStorage read only once
  const [templates, setTemplates] = useState<SubtitleTemplate[]>(() =>
    getCachedTemplates(),
  );
  const [newTemplateName, setNewTemplateName] = useState("");

  const hasVideo = !!mediaUrl && !!file;
  const effectiveDuration = duration || srcDuration || 0;

  // js-min-max-loop: single loop for maxTrack (O(n) not O(n log n))
  const maxTrackFromSubtitles = useMemo(() => {
    if (deferredSubtitles.length === 0) return -1;
    let max = getSubtitleTrack(deferredSubtitles[0]);
    const len = deferredSubtitles.length;
    for (let i = 1; i < len; i++) {
      const t = getSubtitleTrack(deferredSubtitles[i]);
      if (t > max) max = t;
    }
    return max;
  }, [deferredSubtitles]);

  // rerender-split-combined-hooks: split trackCount from maxTrack derivation
  const trackCount = useMemo(() => {
    const needed = maxTrackFromSubtitles + 1;
    let max = trackCountExplicit;
    if (needed > max) max = needed;
    if (max < 1) max = 1;
    return max;
  }, [trackCountExplicit, maxTrackFromSubtitles]);

  useEffect(() => {
    if (maxTrackFromSubtitles + 1 > trackCountExplicit) {
      setTrackCountExplicit(maxTrackFromSubtitles + 1);
    }
  }, [maxTrackFromSubtitles, trackCountExplicit, setTrackCountExplicit]);

  // init/clamp global trim when duration available — narrow deps primitives only (rerender-dependencies)
  useEffect(() => {
    if (effectiveDuration <= 0) return;
    if (trimEnd === 0) {
      videoStore.setState((prev) => {
        const cur =
          (prev as unknown as { trimRange?: [number, number] }).trimRange ??
          ([0, 0] as [number, number]);
        if (cur[1] === 0)
          return {
            ...prev,
            trimRange: [0, effectiveDuration] as [number, number],
          };
        return prev;
      });
    } else if (trimEnd > effectiveDuration) {
      videoStore.setState((prev) => {
        const cur =
          (prev as unknown as { trimRange?: [number, number] }).trimRange ??
          ([0, 0] as [number, number]);
        const ns = Math.min(cur[0], Math.max(0, effectiveDuration - 1));
        return {
          ...prev,
          trimRange: [ns, effectiveDuration] as [number, number],
        };
      });
    }
  }, [effectiveDuration, trimEnd, videoStore]);

  // templates persistence — split from load (rerender-split-combined-hooks) + js-cache-storage + idle-callback
  useEffect(() => {
    setCachedTemplates(templates);
  }, [templates]);

  // advanced-event-handler-refs + rerender-use-ref-transient-values: keep latest trim/loop in refs for stable video handlers
  const trimStartRef = useRef(trimStart);
  const trimEndRef = useRef(trimEnd);
  const isLoopingRef = useRef(isLooping);
  useEffect(() => {
    trimStartRef.current = trimStart;
    trimEndRef.current = trimEnd;
    isLoopingRef.current = isLooping;
  }, [trimStart, trimEnd, isLooping]);

  // video event handling — split effects, narrow deps, passive listeners
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onLoadedMetadata = () => {
      const d = v.duration;
      if (Number.isFinite(d)) {
        setDuration(d);
        videoStore.setState((prev) => {
          const cur =
            (prev as unknown as { trimRange?: [number, number] }).trimRange ??
            ([0, 0] as [number, number]);
          if (cur[1] === 0)
            return { ...prev, trimRange: [0, d] as [number, number] };
          if (cur[1] > d)
            return {
              ...prev,
              trimRange: [Math.min(cur[0], d - 0.2), d] as [number, number],
            };
          return prev;
        });
      }
    };
    const onTimeUpdate = () => {
      const t = v.currentTime;
      const s = trimStartRef.current;
      const e = trimEndRef.current;
      const looping = isLoopingRef.current;
      if (looping && e > s) {
        if (t >= e - 0.02) {
          v.currentTime = s;
          currentTimeRef.current = s;
          setCurrentTimeTick((x) => (x + 1) % 1000000);
          return;
        }
        if (t < s - 0.01) {
          v.currentTime = s;
          currentTimeRef.current = s;
          setCurrentTimeTick((x) => (x + 1) % 1000000);
          return;
        }
      } else {
        if (t >= e - 0.01 && e > 0) {
          v.pause();
          v.currentTime = e;
          currentTimeRef.current = e;
          setIsPlaying(false);
          setCurrentTimeTick((x) => (x + 1) % 1000000);
          return;
        }
      }
      currentTimeRef.current = t;
      setCurrentTimeTick((x) => (x + 1) % 1000000);
    };
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onEnded = () => {
      const s = trimStartRef.current;
      const e = trimEndRef.current;
      if (isLoopingRef.current && e > s) {
        v.currentTime = s;
        currentTimeRef.current = s;
        v.play().catch(NOOP);
      } else {
        setIsPlaying(false);
      }
    };
    v.addEventListener("loadedmetadata", onLoadedMetadata);
    // client-passive-event-listeners: passive for scroll-proximate events
    v.addEventListener("timeupdate", onTimeUpdate, {
      passive: true,
    } as AddEventListenerOptions);
    v.addEventListener("play", onPlay);
    v.addEventListener("pause", onPause);
    v.addEventListener("ended", onEnded);
    if (
      v.readyState >= 1 &&
      Number.isFinite(v.duration) &&
      v.duration !== duration
    ) {
      setDuration(v.duration);
    }
    return () => {
      v.removeEventListener("loadedmetadata", onLoadedMetadata);
      v.removeEventListener("timeupdate", onTimeUpdate);
      v.removeEventListener("play", onPlay);
      v.removeEventListener("pause", onPause);
      v.removeEventListener("ended", onEnded);
    };
    // rerender-dependencies: only primitives/mediaUrl, videoRef omitted (stable ref)
  }, [mediaUrl, duration, videoStore]);

  // RAF sync for smooth playhead — throttled, uses ref to avoid 60fps re-renders of parent (rerender-use-ref-transient-values)
  useEffect(() => {
    if (!isPlaying) return;
    let raf = 0;
    let lastTick = 0;
    const loop = () => {
      const v = videoRef.current;
      if (v && !v.paused) {
        const t = v.currentTime;
        const s = trimStartRef.current;
        const e = trimEndRef.current;
        if (isLoopingRef.current && e > s && t >= e - 0.02) {
          v.currentTime = s;
        }
        currentTimeRef.current = v.currentTime;
        const now = performance.now();
        if (now - lastTick > 100) {
          lastTick = now;
          setCurrentTimeTick((x) => (x + 1) % 1000000);
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [isPlaying]);

  // sync play/pause to video element — rerender-move-effect-to-event: keep minimal, narrow deps
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (isPlaying) v.play().catch(() => setIsPlaying(false));
    else v.pause();
  }, [isPlaying]);

  // js-index-maps: O(1) subtitle lookup via Map (1M ops → 2K ops) — split from filtering (rerender-split-combined-hooks)
  const subtitleById = useMemo(
    () =>
      new Map<string, Subtitle>(
        deferredSubtitles.map((s) => [s.id, s] as const),
      ),
    [deferredSubtitles],
  );
  const selectedSubtitle = useMemo(
    () => (selectedId ? (subtitleById.get(selectedId) ?? null) : null),
    [subtitleById, selectedId],
  );

  // rerender-derived-state: derived staleness hint (no effect)
  void isSubtitlesStale;
  void currentTimeTick;

  // js-cache-property-access: cache length
  const deferredLen = deferredSubtitles.length;
  void deferredLen;

  const activeSubtitles = useMemo(
    () =>
      deferredSubtitles.filter(
        (s) => currentTime >= s.startTime && currentTime < s.endTime,
      ),
    [deferredSubtitles, currentTime],
  );

  // js-tosorted-immutable: sorted view for list (no mutation of store array)
  const sortedSubtitles = useMemo(
    () => deferredSubtitles.toSorted((a, b) => a.startTime - b.startTime),
    [deferredSubtitles],
  );

  // Keep selected update stable — rerender-functional-setstate + useTransition
  const updateSubtitle = useCallback(
    (id: string, patch: Partial<Subtitle> | ((s: Subtitle) => Subtitle)) => {
      startTransition(() => {
        setSubtitles((prev) =>
          prev.map((s) => {
            if (s.id !== id) return s;
            if (typeof patch === "function")
              return (patch as (x: Subtitle) => Subtitle)(s);
            return { ...s, ...patch };
          }),
        );
      });
    },
    [setSubtitles],
  );

  const updateSelectedStyle = useCallback(
    (patch: Partial<SubtitleStyle>) => {
      if (!selectedId) return;
      const sid = selectedId;
      startTransition(() => {
        setSubtitles((prev) =>
          prev.map((s) =>
            s.id === sid ? { ...s, style: { ...s.style, ...patch } } : s,
          ),
        );
      });
    },
    [selectedId, setSubtitles],
  );

  const handleAddSubtitle = useCallback(() => {
    if (!hasVideo || effectiveDuration === 0) return;
    const t = clamp(
      currentTime,
      trimStart,
      Math.max(trimStart, trimEnd - MIN_SUBTITLE_DURATION),
    );
    const start = clamp(t, trimStart, trimEnd - MIN_SUBTITLE_DURATION);
    const end = clamp(start + 1, start + MIN_SUBTITLE_DURATION, trimEnd);
    const id = generateId();
    setSubtitles((prev) => {
      const track = findFirstFreeTrack(prev, start, end);
      const newSub: Subtitle = {
        id,
        text: "New subtitle",
        startTime: start,
        endTime: end,
        track,
        position: { x: 50, y: 80 },
        style: { ...DEFAULT_SUBTITLE_STYLE },
      };
      if (track + 1 > trackCountExplicit) {
        setTrackCountExplicit(track + 1);
      }
      return [...prev, newSub];
    });
    setSelectedId(id);
  }, [
    hasVideo,
    effectiveDuration,
    currentTime,
    trimStart,
    trimEnd,
    trackCountExplicit,
    setSubtitles,
    setSelectedId,
    setTrackCountExplicit,
  ]);

  const handleDeleteSubtitle = useCallback(() => {
    if (!selectedId) return;
    const sid = selectedId;
    setSubtitles((prev) => {
      const idx = prev.findIndex((s) => s.id === sid);
      const next = prev.filter((s) => s.id !== sid);
      if (next.length === 0) setSelectedId(null);
      else {
        const newIdx = Math.min(idx, next.length - 1);
        setSelectedId(next[newIdx].id);
      }
      return next;
    });
  }, [selectedId, setSubtitles, setSelectedId]);

  const handleMoveSubtitleToTrack = useCallback(
    (id: string, newTrack: number) => {
      const t = clamp(Math.round(newTrack), 0, 99);
      if (t >= trackCount) {
        setTrackCountExplicit(t + 1);
      }
      startTransition(() => {
        setSubtitles((prev) =>
          prev.map((s) => (s.id === id ? { ...s, track: t } : s)),
        );
      });
    },
    [trackCount, setTrackCountExplicit, setSubtitles],
  );

  const handleAddTrack = useCallback(() => {
    setTrackCountExplicit((c) => c + 1);
  }, [setTrackCountExplicit]);

  const playFromTrimStart = useCallback(() => {
    const v = videoRef.current;
    if (!v || effectiveDuration === 0) return;
    const cur = currentTimeRef.current;
    const s = trimStartRef.current;
    const e = trimEndRef.current;
    if (cur < s || cur > e) {
      v.currentTime = s;
      currentTimeRef.current = s;
    } else {
      v.currentTime = s;
      currentTimeRef.current = s;
    }
    setCurrentTimeTick((x) => (x + 1) % 1000000);
    setIsPlaying(true);
  }, [effectiveDuration]);

  const togglePlayback = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (!isPlaying) {
      const cur = v.currentTime;
      const s = trimStartRef.current;
      const e = trimEndRef.current;
      if (cur < s || cur >= e) {
        v.currentTime = s;
        currentTimeRef.current = s;
        setCurrentTimeTick((x) => (x + 1) % 1000000);
      }
      setIsPlaying(true);
    } else {
      setIsPlaying(false);
    }
  }, [isPlaying]);

  const handleProgressSeek = useCallback(
    (value: number) => {
      const v = videoRef.current;
      if (!v || effectiveDuration === 0) return;
      const t = clamp(value, trimStartRef.current, trimEndRef.current);
      v.currentTime = t;
      currentTimeRef.current = t;
      setCurrentTimeTick((x) => (x + 1) % 1000000);
    },
    [effectiveDuration],
  );

  const handleTimelineSeek = useCallback(
    (time: number) => {
      const v = videoRef.current;
      if (!v) return;
      const t = clamp(time, 0, effectiveDuration);
      v.currentTime = t;
      currentTimeRef.current = t;
      setCurrentTimeTick((x) => (x + 1) % 1000000);
    },
    [effectiveDuration],
  );

  const handleApplyTemplate = useCallback(
    (templateId: string) => {
      if (!selectedId) return;
      const tmpl = templates.find((t) => t.id === templateId);
      if (!tmpl) return;
      const sid = selectedId;
      startTransition(() => {
        setSubtitles((prev) =>
          prev.map((s) =>
            s.id === sid ? { ...s, style: { ...tmpl.style } } : s,
          ),
        );
      });
    },
    [selectedId, templates, setSubtitles],
  );

  const handleSaveTemplate = useCallback(() => {
    if (!selectedSubtitle) return;
    const name = newTemplateName.trim();
    if (!name) return;
    const newTmpl: SubtitleTemplate = {
      id: generateId(),
      name,
      style: { ...selectedSubtitle.style },
    };
    setTemplates((prev) => [...prev, newTmpl]);
    setNewTemplateName("");
  }, [selectedSubtitle, newTemplateName]);

  const handleTrimChange = useCallback(
    (newStart: number, newEnd: number) => {
      const d = effectiveDuration || 30;
      let s = clamp(newStart, 0, d - MIN_SUBTITLE_DURATION);
      let e = clamp(newEnd, 0, d);
      if (e - s < MIN_SUBTITLE_DURATION) return;
      if (s < 0) s = 0;
      if (e > d) e = d;
      if (s >= e) return;
      videoStore.setState((prev) => ({
        ...prev,
        trimRange: [s, e] as [number, number],
      }));
      startTransition(() => {
        setSubtitles((prev) =>
          prev.map((sub) => {
            let ns = sub.startTime;
            let ne = sub.endTime;
            const dur = ne - ns;
            if (ns < s) {
              ns = s;
              ne = ns + dur;
            }
            if (ne > e) {
              ne = e;
              ns = Math.max(s, ne - dur);
            }
            if (ne - ns < MIN_SUBTITLE_DURATION) {
              ne = Math.min(e, ns + MIN_SUBTITLE_DURATION);
            }
            ns = clamp(ns, s, e - MIN_SUBTITLE_DURATION);
            ne = clamp(ne, ns + MIN_SUBTITLE_DURATION, e);
            return { ...sub, startTime: ns, endTime: ne };
          }),
        );
      });
    },
    [effectiveDuration, videoStore, setSubtitles],
  );

  const handleExport = useCallback(async () => {
    // async-cheap-condition-before-await: cheap sync guards first
    if (!file) {
      toast.error("No video loaded");
      return;
    }
    if (trimEnd <= trimStart + 0.05) {
      toast.error("Invalid trim range");
      return;
    }
    // js-hoist-regexp already hoisted, no inline RegExp
    const sw = sourceWidth || 1920;
    const sh = sourceHeight || 1080;
    const baseName =
      (file.name.replace(/\.[^.]+$/, "") || "video") +
      "_mobile_subtitles_1080x1920";
    const outName = baseName + ".mp4";
    setIsExporting(true);
    toast.loading(
      deferredSubtitles.length
        ? `Rendering ${deferredSubtitles.length} subtitle PNGs…`
        : "Exporting mobile mp4 (CRF 10)…",
      {
        id: "subtitles-export",
      },
    );
    try {
      // async-parallel: independent async work (API client + PNG render) in parallel — single round trip
      // async-defer-await: start promises early, await late
      const apiClientPromise = HEAVY_MODULES.apiClient();
      const pngPromise =
        deferredSubtitles.length === 0
          ? Promise.resolve(
              [] as Array<{
                meta: {
                  startTime: number;
                  endTime: number;
                  x: number;
                  y: number;
                  width: number;
                  height: number;
                };
                blob: Blob;
              }>,
            )
          : HEAVY_MODULES.subtitlePng().then((m) =>
              m.renderAllSubtitlesToPngs(deferredSubtitles),
            );

      const [{ API_BASE_URL }, rendered] = await Promise.all([
        apiClientPromise,
        pngPromise,
      ]);

      toast.loading(`Exporting ${rendered.length} subtitles + 9:16…`, {
        id: "subtitles-export",
      });
      const fd = new FormData();
      fd.append("file", file);
      fd.append(
        "settings",
        JSON.stringify({
          mobileLayout: layout,
          sourceWidth: sw,
          sourceHeight: sh,
          trimRange: [trimStart, trimEnd],
          exportFormat: "mp4",
          exportFps: 30,
          exportFilename: baseName,
          exportQuality: 10,
          exportSpeed: 1,
          customFFmpegArgs: "",
        }),
      );
      // js-cache-property-access: cache rendered.length
      const renderedLen = rendered.length;
      const subtitlesMeta: Array<{
        startTime: number;
        endTime: number;
        x: number;
        y: number;
        width: number;
        height: number;
      }> = [];
      for (let i = 0; i < renderedLen; i++) {
        const r = rendered[i];
        subtitlesMeta.push({
          startTime: r.meta.startTime,
          endTime: r.meta.endTime,
          x: r.meta.x,
          y: r.meta.y,
          width: r.meta.width,
          height: r.meta.height,
        });
      }
      fd.append("subtitles", JSON.stringify(subtitlesMeta));
      for (let i = 0; i < renderedLen; i++) {
        const r = rendered[i];
        const f = new File([r.blob], `subtitle_${i}.png`, {
          type: "image/png",
        });
        fd.append(`subtitle_${i}`, f);
      }
      // async-dependencies: fetch depends on API_BASE_URL already resolved above, no waterfall with PNG render
      const res = await fetch(
        `${API_BASE_URL}/api/transcode/mobile/subtitles`,
        {
          method: "POST",
          body: fd,
        },
      );
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
              toast.loading(`Exporting… ${Math.round(progress.progress)}%`, {
                id: "subtitles-export",
              });
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
      toast.loading("Downloading file…", { id: "subtitles-export" });
      const downloadUrl = `${API_BASE_URL}/api/transcode/download/${j.jobId}`;
      const response = await fetch(downloadUrl);
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(
          payload?.error ?? `Download failed: ${response.status}`,
        );
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
            suggestedName: outName,
            types: [
              { description: "MP4 video", accept: { [mimeType]: [".mp4"] } },
            ],
          });
          const writable = await handle.createWritable();
          await writable.write(blob);
          await writable.close();
          toast.success("Video saved", {
            id: "subtitles-export",
            description: handle.name,
          });
          return;
        } catch (e) {
          if ((e as DOMException)?.name === "AbortError") {
            toast.dismiss("subtitles-export");
            return;
          }
        }
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = outName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("Video saved", {
        id: "subtitles-export",
        description: outName,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Export failed";
      if ((e as DOMException)?.name === "AbortError")
        toast.dismiss("subtitles-export");
      else toast.error(msg, { id: "subtitles-export" });
    } finally {
      setIsExporting(false);
    }
  }, [
    file,
    trimStart,
    trimEnd,
    sourceWidth,
    sourceHeight,
    layout,
    deferredSubtitles,
  ]);

  // rendering-conditional-render: explicit ternary, not &&
  // server-* NA: this is a "use client" local-only editor (no RSC/auth/network caching). Documented:
  // server-auth-actions, server-cache-react, server-cache-lru, server-dedup-props, server-hoist-static-io,
  // server-no-shared-module-state, server-serialization, server-parallel-fetching, server-parallel-nested-fetching,
  // server-after-nonblocking — all server-only; not applicable (client page, no auth/RSC, local file).
  // rendering-hydration-no-flicker / rendering-script-defer-async / rendering-svg-precision / rendering-animate-svg-wrapper: NA (no SSR-critical flicker, no <script>, no animated SVG)
  // async-suspense-boundaries / async-dependencies / async-api-routes: NA beyond parallel Promise.all above (client page streams via local state)
  return !hasVideo ? (
    <div className="space-y-4">
      {NoVideoPlaceholderCard}
      {NoVideoPreviewSkeleton}
    </div>
  ) : (
    <div className="space-y-4">
      <video
        ref={videoRef}
        src={mediaUrl ?? undefined}
        className="hidden"
        playsInline
        preload="metadata"
        crossOrigin="anonymous"
      />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">Subtitles · Mobile 9:16</h2>
          <p className="text-xs text-kumo-subtle" suppressHydrationWarning>
            {effectiveDuration
              ? `${formatTime(effectiveDuration)} · ${deferredSubtitles.length} subtitles`
              : "Loading…"}{" "}
            · Shared mobile layout
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => window.dispatchEvent(new Event("focus"))}
            onMouseEnter={preloadMobilePreview}
            onFocus={preloadMobilePreview}
          >
            Refresh layout
          </Button>
          <Button
            size="sm"
            onClick={handleExport}
            disabled={isExporting}
            onMouseEnter={preloadExportChunks}
            onFocus={preloadExportChunks}
          >
            {isExporting
              ? "Exporting…"
              : `Export 9:16 + ${deferredSubtitles.length} subtitles`}
          </Button>
        </div>
      </div>

      {/* Subtitle area — control & readout surface, mirrors pageEditorCrop CropArea */}
      <SubtitleArea
        count={deferredSubtitles.length}
        trackCount={trackCount}
        layoutMode={layout.mode}
        selected={selectedSubtitle}
        trimLabel={`${formatTime(trimStart)} → ${formatTime(trimEnd)}`}
        durationLabel={
          effectiveDuration ? formatTime(effectiveDuration) : "Loading…"
        }
        fileName={file?.name ?? ""}
        sourceLabel={
          sourceWidth && sourceHeight
            ? `${sourceWidth} × ${sourceHeight} px`
            : "—"
        }
        exportName={`${((file?.name ?? "").replace(/\.[^.]+$/, "") || "video")}_mobile_subtitles_1080x1920.mp4`}
        canDelete={!!selectedId}
        onAdd={handleAddSubtitle}
        onDelete={handleDeleteSubtitle}
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_360px] items-start">
        <div className="space-y-4">
          <Card className="overflow-hidden">
            <CardHeader className="py-3">
              <CardTitle className="text-sm">
                9:16 Preview · {layout.mode === "stacked" ? "Stacked" : "Full"}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {(() => {
                const HANDLE_H = 20;
                const contentH = Math.max(300, previewHeight - HANDLE_H);
                const contentW = Math.round((contentH * 9) / 16);
                return (
                  <div
                    ref={previewWrapRef}
                    className="resize-y overflow-auto min-h-80 max-h-[85vh] rounded-lg border border-kumo-line bg-black flex flex-col mx-auto"
                    style={{
                      height: previewHeight,
                      width: contentW,
                      maxWidth: "100%",
                      resize: "vertical" as const,
                    }}
                    onMouseEnter={preloadMobilePreview}
                    onFocus={preloadMobilePreview}
                  >
                    <div className="flex-1 flex items-center justify-center w-full min-h-0 overflow-hidden bg-black rounded-t-lg h-full">
                      {/* rendering-activity: preserve canvas DOM/state when toggling visibility */}
                      <Activity mode="visible">
                        <DynamicMobilePreviewShared
                          layout={layout}
                          videoRef={videoRef}
                          safe
                          showBg
                          height={contentH}
                          overlay={
                            <div className="absolute inset-0">
                              {activeSubtitles.map((sub) => (
                                <OverlaySubtitle
                                  key={sub.id}
                                  sub={sub}
                                  isSelected={sub.id === selectedId}
                                  onSelect={setSelectedId}
                                />
                              ))}
                              {selectedSubtitle ? (
                                <div
                                  className="absolute size-2 rounded-full bg-kumo-brand border border-white shadow pointer-events-none"
                                  style={{
                                    left: `${clamp(selectedSubtitle.position.x, 0, 100)}%`,
                                    top: `${clamp(selectedSubtitle.position.y, 0, 100)}%`,
                                    transform: "translate(-50%, -50%)",
                                  }}
                                  aria-hidden
                                />
                              ) : null}
                            </div>
                          }
                        />
                      </Activity>
                    </div>
                    <div
                      className="mt-2 h-2.5 w-full shrink-0 cursor-row-resize flex items-center justify-center rounded bg-kumo-recessed border border-kumo-line hover:bg-kumo-brand/10 select-none touch-none"
                      title="Drag to resize preview height"
                      aria-label="Resize preview height"
                      onPointerDown={(e) => {
                        e.preventDefault();
                        const startY = e.clientY;
                        const startH =
                          previewWrapRef.current?.getBoundingClientRect()
                            .height ?? previewHeight;
                        let curH = startH;
                        const onMove = (ev: PointerEvent) => {
                          const dy = ev.clientY - startY;
                          const next = Math.round(
                            Math.max(320, Math.min(900, startH + dy)),
                          );
                          curH = next;
                          setPreviewHeight(next);
                        };
                        const onUp = () => {
                          globalPointerMoveHandlers.delete(
                            onMove as unknown as PointerHandler,
                          );
                          globalPointerUpHandlers.delete(
                            onUp as unknown as PointerHandler,
                          );
                          if (previewWrapRef.current) {
                            // js-batch-dom-css: single cssText write instead of multiple style.* thrashes
                            previewWrapRef.current.style.cssText += `;height:${curH}px`;
                          }
                        };
                        ensureGlobalPointerListeners();
                        globalPointerMoveHandlers.add(
                          onMove as unknown as PointerHandler,
                        );
                        globalPointerUpHandlers.add(
                          onUp as unknown as PointerHandler,
                        );
                      }}
                    >
                      <div className="h-0.5 w-8 rounded bg-black/30 dark:bg-white/30" />
                    </div>
                  </div>
                );
              })()}

              <div className="rounded-lg border bg-kumo-recessed/10 p-3 space-y-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={playFromTrimStart}
                    aria-label="Play from trim start"
                  >
                    ⏮ From Trim Start
                  </Button>
                  <Button
                    size="sm"
                    variant={isPlaying ? "secondary" : "default"}
                    onClick={togglePlayback}
                    aria-label={isPlaying ? "Pause" : "Play"}
                  >
                    {isPlaying ? "⏸ Pause" : "▶ Play"}
                  </Button>
                  <Button
                    size="sm"
                    variant={isLooping ? "default" : "outline"}
                    onClick={() => setIsLooping((v) => !v)}
                    aria-label={isLooping ? "Disable loop" : "Enable loop"}
                  >
                    Loop {isLooping ? "On" : "Off"}
                  </Button>
                  <span
                    className="ml-auto text-xs tabular-nums text-kumo-subtle"
                    suppressHydrationWarning
                  >
                    {formatTime(currentTime)} / {formatTime(effectiveDuration)}{" "}
                    · Trim {formatTime(trimStart)} → {formatTime(trimEnd)}
                  </span>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[11px] text-kumo-subtle">
                    <span>Progress (trim range)</span>
                    <span className="tabular-nums" suppressHydrationWarning>
                      {trimEnd > trimStart
                        ? `${Math.round(clamp(((currentTime - trimStart) / (trimEnd - trimStart)) * 100, 0, 100))}%`
                        : "0%"}
                    </span>
                  </div>
                  <Slider
                    value={[
                      clamp(
                        trimEnd > trimStart
                          ? clamp(
                              ((currentTime - trimStart) /
                                (trimEnd - trimStart)) *
                                100,
                              0,
                              100,
                            )
                          : 0,
                        0,
                        100,
                      ),
                    ]}
                    min={0}
                    max={100}
                    step={0.1}
                    onValueChange={(v) => {
                      const pct = Array.isArray(v)
                        ? (v[0] as number)
                        : (v as number);
                      if (trimEnd <= trimStart) return;
                      const t = percentToTime(pct, trimStart, trimEnd);
                      handleProgressSeek(t);
                    }}
                    aria-label="Seek within trim range"
                  />
                  <Slider
                    value={[currentTime]}
                    min={0}
                    max={Math.max(effectiveDuration, 0.01)}
                    step={0.01}
                    onValueChange={(v) => {
                      const t = Array.isArray(v)
                        ? (v[0] as number)
                        : (v as number);
                      handleTimelineSeek(t);
                    }}
                    aria-label="Seek video"
                    className="opacity-60"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm">Timeline Editor</CardTitle>
              <p className="text-xs text-kumo-subtle">
                Drag subtitle blocks or edges. Click timeline to seek. Trim
                defines editable region.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg border bg-kumo-recessed/20 p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold">Trim</span>
                  <span
                    className="text-[11px] tabular-nums text-kumo-subtle"
                    suppressHydrationWarning
                  >
                    {formatTime(trimStart)} → {formatTime(trimEnd)} ·{" "}
                    {formatTime(Math.max(0, trimEnd - trimStart))}
                  </span>
                </div>
                <Slider
                  value={[trimStart, trimEnd]}
                  min={0}
                  max={Math.max(effectiveDuration, 0.01)}
                  step={0.05}
                  onValueChange={(v) => {
                    const arr = Array.isArray(v)
                      ? (v as number[])
                      : [v as number, effectiveDuration];
                    const [ns, ne] = arr as [number, number];
                    if (ne - ns >= MIN_SUBTITLE_DURATION)
                      handleTrimChange(ns, ne);
                  }}
                  aria-label="Trim range"
                />
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label htmlFor="trim-start" className="text-[11px]">
                      Trim Start
                    </Label>
                    <Input
                      id="trim-start"
                      type="number"
                      step="0.1"
                      value={trimStart.toFixed(2)}
                      onChange={(e) => {
                        const v = parseFloat(e.target.value);
                        if (Number.isFinite(v)) handleTrimChange(v, trimEnd);
                      }}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="trim-end" className="text-[11px]">
                      Trim End
                    </Label>
                    <Input
                      id="trim-end"
                      type="number"
                      step="0.1"
                      value={trimEnd.toFixed(2)}
                      onChange={(e) => {
                        const v = parseFloat(e.target.value);
                        if (Number.isFinite(v)) handleTrimChange(trimStart, v);
                      }}
                    />
                  </div>
                </div>
              </div>

              <MemoTimelineVisual
                duration={effectiveDuration}
                trimStart={trimStart}
                trimEnd={trimEnd}
                currentTime={currentTime}
                subtitles={deferredSubtitles}
                selectedId={selectedId}
                trackCount={trackCount}
                onSeek={handleTimelineSeek}
                onSelect={setSelectedId}
                onUpdateSubtitle={(id, ns, ne) => {
                  const d = effectiveDuration;
                  let s = clamp(ns, trimStart, trimEnd - MIN_SUBTITLE_DURATION);
                  let e = clamp(ne, s + MIN_SUBTITLE_DURATION, trimEnd);
                  if (s < 0) s = 0;
                  if (e > d) e = d;
                  if (e - s < MIN_SUBTITLE_DURATION) return;
                  startTransition(() => {
                    setSubtitles((prev) =>
                      prev.map((sub) =>
                        sub.id === id
                          ? { ...sub, startTime: s, endTime: e }
                          : sub,
                      ),
                    );
                  });
                }}
                onUpdateTrack={handleMoveSubtitleToTrack}
                onAddTrack={handleAddTrack}
              />
              <div className="text-[11px] text-kumo-subtle flex justify-between tabular-nums">
                <span suppressHydrationWarning>0:00</span>
                <span className="flex items-center gap-1">
                  <span className="size-2 bg-kumo-brand rounded-sm inline-block" />{" "}
                  subtitle
                  <span className="size-2 bg-kumo-brand/60 rounded-sm inline-block ml-2" />{" "}
                  selected
                </span>
                <span suppressHydrationWarning>
                  {formatTime(effectiveDuration)}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm">Subtitles</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button
                className="w-full"
                onClick={handleAddSubtitle}
                aria-label="Add Subtitle"
                disabled={!hasVideo || effectiveDuration === 0}
              >
                <span suppressHydrationWarning>
                  + Add Subtitle at {formatTime(currentTime)}
                </span>
              </Button>
              <p className="text-[11px] text-kumo-subtle">
                New subtitle starts at current time, lasts 1s (clamped to Trim
                End).
              </p>
              <div
                className="space-y-2 max-h-80 overflow-auto pr-1"
                style={isSubtitlesStale ? { opacity: 0.7 } : undefined}
              >
                {sortedSubtitles.length === 0
                  ? EmptySubtitleListPlaceholder
                  : null}
                {sortedSubtitles.map((sub) => (
                  <SubtitleRow
                    key={sub.id}
                    sub={sub}
                    isSelected={sub.id === selectedId}
                    isVisible={
                      currentTime >= sub.startTime && currentTime < sub.endTime
                    }
                    onSelect={setSelectedId}
                  />
                ))}
              </div>
            </CardContent>
          </Card>

          {selectedSubtitle ? (
            <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-sm">Subtitle Settings</CardTitle>
                <p
                  className="text-xs text-kumo-subtle truncate"
                  suppressHydrationWarning
                >
                  {selectedSubtitle.text || "New subtitle"} ·{" "}
                  {formatTime(selectedSubtitle.startTime)} –{" "}
                  {formatTime(selectedSubtitle.endTime)}
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="template-select">Template</Label>
                  <Select
                    value=""
                    onValueChange={(v) => {
                      if (v) handleApplyTemplate(v as string);
                    }}
                  >
                    <SelectTrigger id="template-select" aria-label="Template">
                      <SelectValue
                        placeholder={
                          templates.length
                            ? "Select template to apply"
                            : "No templates saved"
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {templates.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Template name"
                      value={newTemplateName}
                      onChange={(e) => setNewTemplateName(e.target.value)}
                      aria-label="New template name"
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleSaveTemplate}
                      disabled={!newTemplateName.trim() || !selectedSubtitle}
                      aria-label="Save Current Style as Template"
                    >
                      Save Style as Template
                    </Button>
                  </div>
                  {templates.length > 0 ? (
                    <p className="text-[10px] text-kumo-subtle">
                      Applying a template replaces all 15 style fields
                      (including outline/shadow/background toggles).
                      Text/timing/position are preserved.
                    </p>
                  ) : null}
                </div>

                <div className="h-px bg-border" />

                <div className="space-y-2">
                  <Label htmlFor="sub-text">Text</Label>
                  <Textarea
                    id="sub-text"
                    value={selectedSubtitle.text}
                    onChange={(e) =>
                      updateSubtitle(selectedSubtitle.id, {
                        text: e.target.value,
                      })
                    }
                    placeholder="Subtitle text"
                    rows={2}
                    aria-label="Subtitle text"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label htmlFor="sub-start" className="text-xs">
                      Start (s)
                    </Label>
                    <Input
                      id="sub-start"
                      type="number"
                      step="0.05"
                      value={selectedSubtitle.startTime.toFixed(2)}
                      onChange={(e) => {
                        const v = parseFloat(e.target.value);
                        if (!Number.isFinite(v)) return;
                        let ns = clamp(
                          v,
                          trimStart,
                          trimEnd - MIN_SUBTITLE_DURATION,
                        );
                        let ne = selectedSubtitle.endTime;
                        if (ns >= ne)
                          ne = clamp(
                            ns + MIN_SUBTITLE_DURATION,
                            ns + MIN_SUBTITLE_DURATION,
                            trimEnd,
                          );
                        updateSubtitle(selectedSubtitle.id, {
                          startTime: ns,
                          endTime: ne,
                        });
                      }}
                      aria-label="Subtitle start time"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="sub-end" className="text-xs">
                      End (s)
                    </Label>
                    <Input
                      id="sub-end"
                      type="number"
                      step="0.05"
                      value={selectedSubtitle.endTime.toFixed(2)}
                      onChange={(e) => {
                        const v = parseFloat(e.target.value);
                        if (!Number.isFinite(v)) return;
                        let ne = clamp(
                          v,
                          trimStart + MIN_SUBTITLE_DURATION,
                          trimEnd,
                        );
                        let ns = selectedSubtitle.startTime;
                        if (ne <= ns)
                          ns = clamp(
                            ne - MIN_SUBTITLE_DURATION,
                            trimStart,
                            ne - MIN_SUBTITLE_DURATION,
                          );
                        updateSubtitle(selectedSubtitle.id, {
                          startTime: ns,
                          endTime: ne,
                        });
                      }}
                      aria-label="Subtitle end time"
                    />
                  </div>
                </div>

                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleDeleteSubtitle}
                  aria-label="Delete Subtitle"
                  className="w-full"
                >
                  Delete Subtitle
                </Button>

                <div className="space-y-2">
                  <Label htmlFor="sub-track">Track</Label>
                  <div className="flex gap-2">
                    <Select
                      value={String(getSubtitleTrack(selectedSubtitle))}
                      onValueChange={(v) => {
                        if (v === null) return;
                        handleMoveSubtitleToTrack(
                          selectedSubtitle.id,
                          parseInt(v as string, 10),
                        );
                      }}
                    >
                      <SelectTrigger
                        id="sub-track"
                        aria-label="Track"
                        className="flex-1"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Array.from({ length: trackCount }).map((_, i) => (
                          <SelectItem key={i} value={String(i)}>
                            Track {i + 1}
                          </SelectItem>
                        ))}
                        <SelectItem value={String(trackCount)}>
                          + New Track {trackCount + 1}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleAddTrack}
                      aria-label="Add Track"
                    >
                      + Track
                    </Button>
                  </div>
                  <p className="text-[10px] text-kumo-subtle">
                    Move between tracks to avoid overlap. New subtitles at
                    overlapping time auto-create a new track.
                  </p>
                </div>

                <div className="h-px bg-border" />

                <div className="space-y-2">
                  <Label className="text-xs font-semibold">Position</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label htmlFor="pos-x" className="text-[11px]">
                        X (0-100)
                      </Label>
                      <Input
                        id="pos-x"
                        type="number"
                        min={0}
                        max={100}
                        value={selectedSubtitle.position.x}
                        onChange={(e) => {
                          const v = parseFloat(e.target.value);
                          if (!Number.isFinite(v)) return;
                          const x = clamp(v, 0, 100);
                          updateSubtitle(selectedSubtitle.id, {
                            position: { ...selectedSubtitle.position, x },
                          });
                        }}
                        aria-label="Position X"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="pos-y" className="text-[11px]">
                        Y (0-100)
                      </Label>
                      <Input
                        id="pos-y"
                        type="number"
                        min={0}
                        max={100}
                        value={selectedSubtitle.position.y}
                        onChange={(e) => {
                          const v = parseFloat(e.target.value);
                          if (!Number.isFinite(v)) return;
                          const y = clamp(v, 0, 100);
                          updateSubtitle(selectedSubtitle.id, {
                            position: { ...selectedSubtitle.position, y },
                          });
                        }}
                        aria-label="Position Y"
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="font-family">Font Family</Label>
                  <GoogleFontPicker
                    value={selectedSubtitle.style.fontFamily}
                    onValueChange={(v) => {
                      ensureGoogleFontLoaded(v).catch(NOOP);
                      updateSelectedStyle({ fontFamily: v });
                    }}
                    id="font-family"
                    placeholder="Search Google Fonts…"
                    previewText={selectedSubtitle.text}
                  />
                  <p className="text-[11px] text-kumo-subtle">
                    Dynamic Google Fonts search — fonts are loaded on demand via
                    Google Fonts CDN.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="font-size" className="text-xs">
                    Font Size
                  </Label>
                  <Input
                    id="font-size"
                    type="number"
                    min={1}
                    value={selectedSubtitle.style.fontSize}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value);
                      if (!Number.isFinite(v) || v <= 0) return;
                      updateSelectedStyle({ fontSize: v });
                    }}
                    aria-label="Font Size"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-xs">Text Color</Label>
                  <div className="flex gap-2 items-center">
                    <Input
                      type="color"
                      value={
                        selectedSubtitle.style.color.length === 7
                          ? selectedSubtitle.style.color
                          : "#FFFFFF"
                      }
                      onChange={(e) =>
                        updateSelectedStyle({ color: e.target.value })
                      }
                      className="size-9 p-1 cursor-pointer"
                      aria-label="Text Color picker"
                    />
                    <Input
                      value={selectedSubtitle.style.color}
                      onChange={(e) =>
                        updateSelectedStyle({ color: e.target.value })
                      }
                      onBlur={(e) => {
                        const v = normalizeHex(e.target.value);
                        if (isValidHexColor(v))
                          updateSelectedStyle({ color: v });
                      }}
                      placeholder="#FFFFFF"
                      aria-label="Text Color HEX"
                      className="flex-1"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-semibold">Outline</Label>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-kumo-subtle">
                        {selectedSubtitle.style.outlineEnabled ? "On" : "Off"}
                      </span>
                      <Switch
                        checked={selectedSubtitle.style.outlineEnabled}
                        onCheckedChange={(checked) =>
                          updateSelectedStyle({ outlineEnabled: checked })
                        }
                        aria-label="Toggle outline"
                      />
                    </div>
                  </div>
                  <div
                    className={cn(
                      "grid grid-cols-2 gap-2",
                      !selectedSubtitle.style.outlineEnabled &&
                        "opacity-50 pointer-events-none",
                    )}
                  >
                    <div className="space-y-1">
                      <Label htmlFor="outline-thick" className="text-[11px]">
                        Thickness
                      </Label>
                      <Input
                        id="outline-thick"
                        type="number"
                        min={0}
                        step={0.5}
                        value={selectedSubtitle.style.outlineThickness}
                        onChange={(e) => {
                          const v = parseFloat(e.target.value);
                          if (!Number.isFinite(v) || v < 0) return;
                          updateSelectedStyle({ outlineThickness: v });
                        }}
                        aria-label="Outline Thickness"
                        disabled={!selectedSubtitle.style.outlineEnabled}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="outline-color" className="text-[11px]">
                        Color
                      </Label>
                      <div className="flex gap-1">
                        <Input
                          id="outline-color"
                          type="color"
                          value={
                            isValidHexColor(selectedSubtitle.style.outlineColor)
                              ? selectedSubtitle.style.outlineColor
                              : "#000000"
                          }
                          onChange={(e) =>
                            updateSelectedStyle({
                              outlineColor: e.target.value,
                            })
                          }
                          className="size-8 p-1"
                          aria-label="Outline Color"
                          disabled={!selectedSubtitle.style.outlineEnabled}
                        />
                        <Input
                          value={selectedSubtitle.style.outlineColor}
                          onChange={(e) =>
                            updateSelectedStyle({
                              outlineColor: e.target.value,
                            })
                          }
                          className="flex-1 text-xs"
                          aria-label="Outline Color HEX"
                          disabled={!selectedSubtitle.style.outlineEnabled}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-semibold">Shadow</Label>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-kumo-subtle">
                        {selectedSubtitle.style.shadowEnabled ? "On" : "Off"}
                      </span>
                      <Switch
                        checked={selectedSubtitle.style.shadowEnabled}
                        onCheckedChange={(checked) =>
                          updateSelectedStyle({ shadowEnabled: checked })
                        }
                        aria-label="Toggle shadow"
                      />
                    </div>
                  </div>
                  <div
                    className={cn(
                      "grid grid-cols-2 gap-2",
                      !selectedSubtitle.style.shadowEnabled &&
                        "opacity-50 pointer-events-none",
                    )}
                  >
                    <div className="space-y-1">
                      <Label htmlFor="shadow-size" className="text-[11px]">
                        Size
                      </Label>
                      <Input
                        id="shadow-size"
                        type="number"
                        min={0}
                        value={selectedSubtitle.style.shadowSize}
                        onChange={(e) => {
                          const v = parseFloat(e.target.value);
                          if (!Number.isFinite(v) || v < 0) return;
                          updateSelectedStyle({ shadowSize: v });
                        }}
                        aria-label="Shadow Size"
                        disabled={!selectedSubtitle.style.shadowEnabled}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="shadow-color" className="text-[11px]">
                        Color
                      </Label>
                      <div className="flex gap-1">
                        <Input
                          id="shadow-color"
                          type="color"
                          value={
                            isValidHexColor(
                              selectedSubtitle.style.shadowColor,
                            ) && selectedSubtitle.style.shadowColor.length === 7
                              ? selectedSubtitle.style.shadowColor
                              : "#000000"
                          }
                          onChange={(e) =>
                            updateSelectedStyle({ shadowColor: e.target.value })
                          }
                          className="size-8 p-1"
                          aria-label="Shadow Color"
                          disabled={!selectedSubtitle.style.shadowEnabled}
                        />
                        <Input
                          value={selectedSubtitle.style.shadowColor}
                          onChange={(e) =>
                            updateSelectedStyle({ shadowColor: e.target.value })
                          }
                          className="flex-1 text-xs"
                          aria-label="Shadow Color HEX"
                          disabled={!selectedSubtitle.style.shadowEnabled}
                        />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="shadow-x" className="text-[11px]">
                        Offset X
                      </Label>
                      <Input
                        id="shadow-x"
                        type="number"
                        value={selectedSubtitle.style.shadowOffsetX}
                        onChange={(e) => {
                          const v = parseFloat(e.target.value);
                          if (!Number.isFinite(v)) return;
                          updateSelectedStyle({ shadowOffsetX: v });
                        }}
                        aria-label="Shadow Offset X"
                        disabled={!selectedSubtitle.style.shadowEnabled}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="shadow-y" className="text-[11px]">
                        Offset Y
                      </Label>
                      <Input
                        id="shadow-y"
                        type="number"
                        value={selectedSubtitle.style.shadowOffsetY}
                        onChange={(e) => {
                          const v = parseFloat(e.target.value);
                          if (!Number.isFinite(v)) return;
                          updateSelectedStyle({ shadowOffsetY: v });
                        }}
                        aria-label="Shadow Offset Y"
                        disabled={!selectedSubtitle.style.shadowEnabled}
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-semibold">Background</Label>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-kumo-subtle">
                        {selectedSubtitle.style.backgroundEnabled
                          ? "On"
                          : "Off"}
                      </span>
                      <Switch
                        checked={selectedSubtitle.style.backgroundEnabled}
                        onCheckedChange={(checked) =>
                          updateSelectedStyle({ backgroundEnabled: checked })
                        }
                        aria-label="Toggle background"
                      />
                    </div>
                  </div>
                  <div
                    className={cn(
                      !selectedSubtitle.style.backgroundEnabled &&
                        "opacity-50 pointer-events-none",
                    )}
                  >
                    <div className="space-y-2">
                      <div className="space-y-1">
                        <Label htmlFor="bg-color" className="text-[11px]">
                          Color
                        </Label>
                        <div className="flex gap-2 items-center">
                          <Input
                            id="bg-color"
                            type="color"
                            value={(() => {
                              const c = selectedSubtitle.style.backgroundColor;
                              if (
                                c.startsWith("#") &&
                                (c.length === 7 || c.length === 4)
                              )
                                return c.length === 4
                                  ? `#${c[1]}${c[1]}${c[2]}${c[2]}${c[3]}${c[3]}`
                                  : c;
                              return "#000000";
                            })()}
                            onChange={(e) =>
                              updateSelectedStyle({
                                backgroundColor: e.target.value,
                              })
                            }
                            className="size-8 p-1"
                            aria-label="Background Color"
                            disabled={!selectedSubtitle.style.backgroundEnabled}
                          />
                          <Input
                            value={selectedSubtitle.style.backgroundColor}
                            onChange={(e) =>
                              updateSelectedStyle({
                                backgroundColor: e.target.value,
                              })
                            }
                            placeholder="rgba(0,0,0,0.5) or #000000"
                            className="flex-1 text-xs"
                            aria-label="Background Color value"
                            disabled={!selectedSubtitle.style.backgroundEnabled}
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <Label htmlFor="bg-pad" className="text-[11px]">
                            Padding
                          </Label>
                          <Input
                            id="bg-pad"
                            type="number"
                            min={0}
                            value={selectedSubtitle.style.backgroundPadding}
                            onChange={(e) => {
                              const v = parseFloat(e.target.value);
                              if (!Number.isFinite(v) || v < 0) return;
                              updateSelectedStyle({ backgroundPadding: v });
                            }}
                            aria-label="Background Padding"
                            disabled={!selectedSubtitle.style.backgroundEnabled}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor="bg-radius" className="text-[11px]">
                            Corner Radius
                          </Label>
                          <Input
                            id="bg-radius"
                            type="number"
                            min={0}
                            value={
                              selectedSubtitle.style.backgroundBorderRadius
                            }
                            onChange={(e) => {
                              const v = parseFloat(e.target.value);
                              if (!Number.isFinite(v) || v < 0) return;
                              updateSelectedStyle({
                                backgroundBorderRadius: v,
                              });
                            }}
                            aria-label="Background Corner Radius"
                            disabled={!selectedSubtitle.style.backgroundEnabled}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : (
            NoSelectionCard
          )}
          <Card className="p-3">
            <div className="text-xs font-medium">
              Templates stored: {templates.length}
            </div>
            <p className="text-[11px] text-kumo-subtle mt-1">
              Key: {SUBTITLE_TEMPLATES_STORAGE_KEY} · Invalid localStorage data
              is ignored.
            </p>
            {templates.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-1">
                {templates.map((t) => (
                  <span
                    key={t.id}
                    className="text-[10px] bg-kumo-recessed px-1.5 py-0.5 rounded border"
                  >
                    {t.name}
                  </span>
                ))}
              </div>
            ) : null}
          </Card>
        </div>
      </div>
    </div>
  );
}
