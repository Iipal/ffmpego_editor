"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import type {
  Subtitle,
  SubtitleStyle,
} from "@/lib/subtitles/subtitleTypes";

export type SubtitleBackgroundPanelProps = {
  selected: Subtitle;
  onUpdateStyle: (patch: Partial<SubtitleStyle>) => void;
};

export function SubtitleBackgroundPanel({
  selected,
  onUpdateStyle,
}: SubtitleBackgroundPanelProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-xs font-semibold">Background</Label>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-kumo-subtle">
            {selected.style.backgroundEnabled ? "On" : "Off"}
          </span>
          <Switch
            checked={selected.style.backgroundEnabled}
            onCheckedChange={(checked) =>
              onUpdateStyle({ backgroundEnabled: checked })
            }
            aria-label="Toggle background"
          />
        </div>
      </div>
      <div
        className={cn(
          !selected.style.backgroundEnabled &&
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
                  const c = selected.style.backgroundColor;
                  if (c.startsWith("#") && (c.length === 7 || c.length === 4))
                    return c.length === 4
                      ? `#${c[1]}${c[1]}${c[2]}${c[2]}${c[3]}${c[3]}`
                      : c;
                  return "#000000";
                })()}
                onChange={(e) =>
                  onUpdateStyle({ backgroundColor: e.target.value })
                }
                className="size-8 p-1"
                aria-label="Background Color"
                disabled={!selected.style.backgroundEnabled}
              />
              <Input
                value={selected.style.backgroundColor}
                onChange={(e) =>
                  onUpdateStyle({ backgroundColor: e.target.value })
                }
                placeholder="rgba(0,0,0,0.5) or #000000"
                className="flex-1 text-xs"
                aria-label="Background Color value"
                disabled={!selected.style.backgroundEnabled}
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
                value={selected.style.backgroundPadding}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  if (!Number.isFinite(v) || v < 0) return;
                  onUpdateStyle({ backgroundPadding: v });
                }}
                aria-label="Background Padding"
                disabled={!selected.style.backgroundEnabled}
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
                value={selected.style.backgroundBorderRadius}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  if (!Number.isFinite(v) || v < 0) return;
                  onUpdateStyle({ backgroundBorderRadius: v });
                }}
                aria-label="Background Corner Radius"
                disabled={!selected.style.backgroundEnabled}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
