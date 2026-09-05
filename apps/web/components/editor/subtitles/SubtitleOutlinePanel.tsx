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

export type SubtitleOutlinePanelProps = {
  selected: Subtitle;
  onUpdateStyle: (patch: Partial<SubtitleStyle>) => void;
};

export function SubtitleOutlinePanel({
  selected,
  onUpdateStyle,
}: SubtitleOutlinePanelProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-xs font-semibold">Outline</Label>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-kumo-subtle">
            {selected.style.outlineEnabled ? "On" : "Off"}
          </span>
          <Switch
            checked={selected.style.outlineEnabled}
            onCheckedChange={(checked) =>
              onUpdateStyle({ outlineEnabled: checked })
            }
            aria-label="Toggle outline"
          />
        </div>
      </div>
      <div
        className={cn(
          "grid grid-cols-2 gap-2",
          !selected.style.outlineEnabled && "opacity-50 pointer-events-none",
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
            value={selected.style.outlineThickness}
            onChange={(e) => {
              const v = parseFloat(e.target.value);
              if (!Number.isFinite(v) || v < 0) return;
              onUpdateStyle({ outlineThickness: v });
            }}
            aria-label="Outline Thickness"
            disabled={!selected.style.outlineEnabled}
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
                isValidHexColor(selected.style.outlineColor)
                  ? selected.style.outlineColor
                  : "#000000"
              }
              onChange={(e) => onUpdateStyle({ outlineColor: e.target.value })}
              className="size-8 p-1"
              aria-label="Outline Color"
              disabled={!selected.style.outlineEnabled}
            />
            <Input
              value={selected.style.outlineColor}
              onChange={(e) => onUpdateStyle({ outlineColor: e.target.value })}
              className="flex-1 text-xs"
              aria-label="Outline Color HEX"
              disabled={!selected.style.outlineEnabled}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
