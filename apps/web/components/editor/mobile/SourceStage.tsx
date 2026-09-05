"use client";

import { memo, useCallback, useEffect, useMemo, useRef } from "react";
import { resizeZoneAspectLocked } from "@/lib/mobile-layout";
import type { CropZone } from "@/lib/mobile-layout";
import { ZoneOverlay } from "./ZoneOverlay";
import { NoVideoPlaceholder } from "./placeholders";
import {
  ensureGlobalPointerListeners,
  globalPointerMoveHandlers,
  globalPointerUpHandlers,
} from "./mobile-helpers";
import type { SourceStageProps } from "./types";

export const SourceStage = memo(function SourceStage({
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
  }, [volume, isMuted]);

  const onMoveRef = useRef(onMove);
  const onResizeRef = useRef(onResize);
  const onSelectRef = useRef(onSelect);
  useEffect(() => {
    onMoveRef.current = onMove;
    onResizeRef.current = onResize;
    onSelectRef.current = onSelect;
  }, [onMove, onResize, onSelect]);

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
      <span className="pointer-events-none absolute bottom-1 left-1 rounded bg-black/55 px-1.5 py-0.5 font-mono text-[10px] leading-none text-white tabular-nums">
        {layout.mode === "full" ? "Full" : "Stacked"} · {layout.zones.length}{" "}
        zones
      </span>
    </div>
  );
});
