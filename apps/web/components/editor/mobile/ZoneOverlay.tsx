"use client";

import { memo } from "react";
import { cn } from "@/lib/utils";
import { mobileLayoutService } from "@/lib/mobile-layout";
import { ZoneGridOverlay } from "./placeholders";
import type { ZoneOverlayProps } from "./types";

const HANDLE_POSITIONS = {
  nw: "top-0 left-0 cursor-nw-resize",
  ne: "top-0 right-0 cursor-ne-resize",
  sw: "bottom-0 left-0 cursor-sw-resize",
  se: "bottom-0 right-0 cursor-se-resize",
} as const;

const RESIZE_HANDLES = ["nw", "ne", "sw", "se"] as const;

export const ZoneOverlay = memo(function ZoneOverlay({
  zone,
  isSelected,
  onSelect,
  onPointerDownMove,
  onPointerDownHandle,
  onZoom,
  onNudge,
}: ZoneOverlayProps) {
  const label = zone.id === "zone-1" ? "Zone 1" : "Zone 2";
  const roleLabel = zone.role ? `· ${zone.role}` : "";

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (zone.locked) return;
    const step = e.shiftKey ? 0.05 : 0.01;
    let dx = 0;
    let dy = 0;
    if (e.key === "ArrowLeft") dx = -step;
    else if (e.key === "ArrowRight") dx = step;
    else if (e.key === "ArrowUp") dy = -step;
    else if (e.key === "ArrowDown") dy = step;
    else if (e.key === "Enter") {
      onSelect(zone.id as "zone-1" | "zone-2");
      return;
    } else return;
    e.preventDefault();
    e.stopPropagation();
    onSelect(zone.id as "zone-1" | "zone-2");
    onNudge(zone.id, dx, dy);
  };

  return (
    <div
      onPointerDown={(e) => onPointerDownMove(e, zone.id)}
      onClick={() => onSelect(zone.id as "zone-1" | "zone-2")}
      onKeyDown={onKeyDown}
      role="button"
      tabIndex={0}
      aria-label={`${label} crop zone${zone.locked ? " locked" : ""}. Arrow keys nudge, resize in Zone card sliders.`}
      title="Drag to move · arrow keys nudge · resize in Zone card"
      aria-pressed={isSelected}
      className={cn(
        "absolute cursor-move rounded-md border transition-colors",
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
        ? RESIZE_HANDLES.map((h) => (
            <button
              key={h}
              type="button"
              onPointerDown={(e) => onPointerDownHandle(e, zone.id, h)}
              onClick={(e) => e.stopPropagation()}
              aria-label={`Resize ${label} ${h}. Drag, or resize precisely in Zone card sliders.`}
              title="Drag to resize · precise resize in Zone card"
              className={cn(
                "absolute flex size-6 -m-2 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white",
                HANDLE_POSITIONS[h],
              )}
            >
              <span
                aria-hidden
                className="size-2.5 rounded-full border-2 border-white bg-kumo-brand shadow-sm transition-transform hover:scale-110"
              />
            </button>
          ))
        : null}
      {isSelected && !zone.locked ? (
        <div className="absolute -right-8 top-1/2 hidden -translate-y-1/2 sm:flex flex-col items-center gap-1">
          <div
            onPointerDown={(e) => {
              e.stopPropagation();
              const startY = e.clientY;
              const startZoom = zone.zoom;
              const onMove = (ev: PointerEvent) => {
                const dy = (startY - ev.clientY) / 120;
                onZoom(
                  zone.id,
                  mobileLayoutService.clamp(startZoom + dy, 0.5, 3),
                );
              };
              const onUp = () => {
                window.removeEventListener("pointermove", onMove);
                window.removeEventListener("pointerup", onUp);
              };
              window.addEventListener("pointermove", onMove);
              window.addEventListener("pointerup", onUp);
            }}
            title="Drag to zoom · or use +/- buttons"
            className="flex cursor-ns-resize flex-col items-center gap-1"
            aria-hidden
          >
            <span className="h-12 w-1 rounded-full bg-white/35 shadow-sm" />
            <span className="rounded bg-black/60 px-1 py-0.5 font-mono text-[9px] leading-none text-white tabular-nums">
              {zone.zoom.toFixed(2)}×
            </span>
          </div>
          <div className="flex gap-1">
            <button
              type="button"
              aria-label={`Zoom ${label} in`}
              onClick={(e) => {
                e.stopPropagation();
                onZoom(
                  zone.id,
                  mobileLayoutService.clamp(zone.zoom + 0.1, 0.5, 3),
                );
              }}
              className="rounded bg-black/60 px-1.5 py-0.5 text-[11px] leading-none text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              +
            </button>
            <button
              type="button"
              aria-label={`Zoom ${label} out`}
              onClick={(e) => {
                e.stopPropagation();
                onZoom(
                  zone.id,
                  mobileLayoutService.clamp(zone.zoom - 0.1, 0.5, 3),
                );
              }}
              className="rounded bg-black/60 px-1.5 py-0.5 text-[11px] leading-none text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              −
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
});
