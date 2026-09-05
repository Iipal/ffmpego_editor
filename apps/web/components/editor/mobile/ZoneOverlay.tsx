"use client";

import { memo } from "react";
import { cn } from "@/lib/utils";
import { clamp } from "@/lib/mobile-layout";
import { ZoneGridOverlay } from "./placeholders";
import type { ZoneOverlayProps } from "./types";

const HANDLE_POSITIONS = {
  nw: "top-0 left-0 cursor-nw-resize",
  ne: "top-0 right-0 cursor-ne-resize",
  sw: "bottom-0 left-0 cursor-sw-resize",
  se: "bottom-0 right-0 cursor-se-resize",
} as const;

export const ZoneOverlay = memo(function ZoneOverlay({
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
