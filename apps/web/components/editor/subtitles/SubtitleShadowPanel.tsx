"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import type {
  Subtitle,
  SubtitleStyle,
} from "@/lib/subtitles/subtitleTypes";
import { isValidHexColor } from "./subtitle-helpers";

export type SubtitleShadowPanelProps = {
  selected: Subtitle;
  onUpdateStyle: (patch: Partial<SubtitleStyle>) => void;
};

export function SubtitleShadowPanel({
  selected,
  onUpdateStyle,
}: SubtitleShadowPanelProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-xs font-semibold">Shadow</Label>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-kumo-subtle">
            {selected.style.shadowEnabled ? "On" : "Off"}
          </span>
          <Switch
            checked={selected.style.shadowEnabled}
            onCheckedChange={(checked) =>
              onUpdateStyle({ shadowEnabled: checked })
            }
            aria-label="Toggle shadow"
          />
        </div>
      </div>
      <div
        className={cn(
          "grid grid-cols-2 gap-2",
          !selected.style.shadowEnabled && "opacity-50 pointer-events-none",
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
            value={selected.style.shadowSize}
            onChange={(e) => {
              const v = parseFloat(e.target.value);
              if (!Number.isFinite(v) || v < 0) return;
              onUpdateStyle({ shadowSize: v });
            }}
            aria-label="Shadow Size"
            disabled={!selected.style.shadowEnabled}
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
                isValidHexColor(selected.style.shadowColor) &&
                selected.style.shadowColor.length === 7
                  ? selected.style.shadowColor
                  : "#000000"
              }
              onChange={(e) => onUpdateStyle({ shadowColor: e.target.value })}
              className="size-8 p-1"
              aria-label="Shadow Color"
              disabled={!selected.style.shadowEnabled}
            />
            <Input
              value={selected.style.shadowColor}
              onChange={(e) => onUpdateStyle({ shadowColor: e.target.value })}
              className="flex-1 text-xs"
              aria-label="Shadow Color HEX"
              disabled={!selected.style.shadowEnabled}
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
            value={selected.style.shadowOffsetX}
            onChange={(e) => {
              const v = parseFloat(e.target.value);
              if (!Number.isFinite(v)) return;
              onUpdateStyle({ shadowOffsetX: v });
            }}
            aria-label="Shadow Offset X"
            disabled={!selected.style.shadowEnabled}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="shadow-y" className="text-[11px]">
            Offset Y
          </Label>
          <Input
            id="shadow-y"
            type="number"
            value={selected.style.shadowOffsetY}
            onChange={(e) => {
              const v = parseFloat(e.target.value);
              if (!Number.isFinite(v)) return;
              onUpdateStyle({ shadowOffsetY: v });
            }}
            aria-label="Shadow Offset Y"
            disabled={!selected.style.shadowEnabled}
          />
        </div>
      </div>
    </div>
  );
}
