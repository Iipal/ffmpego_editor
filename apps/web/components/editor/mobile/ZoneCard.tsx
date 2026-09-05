"use client";

import { memo, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Lock, LockOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ZoneCardProps } from "./types";

export const ZoneCard = memo(function ZoneCard({
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
