"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Subtitle, SubtitleStyle } from "@/lib/subtitles/subtitleStorage";
import { NumberField, ToggleSection } from "./StyleFields";

export type SubtitleBackgroundPanelProps = {
  selected: Subtitle;
  onUpdateStyle: (patch: Partial<SubtitleStyle>) => void;
};

export function SubtitleBackgroundPanel({
  selected,
  onUpdateStyle,
}: SubtitleBackgroundPanelProps) {
  // rerender-derived-state-no-effect: derive color input value during render
  const bgRaw = selected.style.backgroundColor;
  const bgColorValue =
    bgRaw.startsWith("#") && (bgRaw.length === 7 || bgRaw.length === 4)
      ? bgRaw.length === 4
        ? `#${bgRaw[1]}${bgRaw[1]}${bgRaw[2]}${bgRaw[2]}${bgRaw[3]}${bgRaw[3]}`
        : bgRaw
      : "#000000";
  return (
    <ToggleSection
      title="Background"
      enabled={selected.style.backgroundEnabled}
      onToggle={(checked) => onUpdateStyle({ backgroundEnabled: checked })}
      toggleLabel="Toggle background"
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
                value={bgColorValue}
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
            <NumberField
              id="bg-pad"
              label="Padding"
              value={selected.style.backgroundPadding}
              onValue={(v) => {
                if (v < 0) return;
                onUpdateStyle({ backgroundPadding: v });
              }}
              min={0}
              disabled={!selected.style.backgroundEnabled}
              ariaLabel="Background Padding"
            />
            <NumberField
              id="bg-radius"
              label="Corner Radius"
              value={selected.style.backgroundBorderRadius}
              onValue={(v) => {
                if (v < 0) return;
                onUpdateStyle({ backgroundBorderRadius: v });
              }}
              min={0}
              disabled={!selected.style.backgroundEnabled}
              ariaLabel="Background Corner Radius"
            />
          </div>
        </div>
    </ToggleSection>
  );
}
