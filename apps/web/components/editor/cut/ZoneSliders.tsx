"use client";

import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { clamp } from "@/lib/mobile-layout";
import type { CropZone } from "@/lib/mobile-layout";

export function ZoneSliders({
  zone,
  onChange,
}: {
  zone: CropZone;
  onChange: (z: CropZone) => void;
}) {
  const num = (v: number, min: number, max: number) =>
    clamp(Math.round(v * 1000) / 1000, min, max);
  return (
    <div className="grid grid-cols-2 gap-2">
      {(
        [
          ["x", 0, 0.9],
          ["y", 0, 0.9],
          ["width", 0.05, 1],
          ["height", 0.05, 1],
        ] as const
      ).map(([key, min, max]) => (
        <div key={key} className="space-y-1">
          <Label className="font-mono text-[10px] tabular-nums text-kumo-subtle">
            {key} {(zone[key] as number).toFixed(2)}
          </Label>
          <Slider
            value={[zone[key] as number]}
            min={min}
            max={max}
            step={0.01}
            onValueChange={(v) => {
              const val = Array.isArray(v) ? (v[0] as number) : (v as number);
              onChange({ ...zone, [key]: num(val, min, max) });
            }}
          />
        </div>
      ))}
    </div>
  );
}
