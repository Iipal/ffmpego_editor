"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Subtitle, SubtitleStyle } from "@/lib/subtitles/subtitleStorage";
import { isValidHexColor } from "./subtitle-helpers";
import { NumberField, ToggleSection } from "./StyleFields";

export type SubtitleShadowPanelProps = {
  selected: Subtitle;
  onUpdateStyle: (patch: Partial<SubtitleStyle>) => void;
};

export function SubtitleShadowPanel({
  selected,
  onUpdateStyle,
}: SubtitleShadowPanelProps) {
  return (
    <ToggleSection
      title="Shadow"
      enabled={selected.style.shadowEnabled}
      onToggle={(checked) => onUpdateStyle({ shadowEnabled: checked })}
      toggleLabel="Toggle shadow"
      bodyClassName="grid grid-cols-2 gap-2"
    >
      <NumberField
        id="shadow-size"
        label="Size"
        value={selected.style.shadowSize}
        onValue={(v) => {
          if (v < 0) return;
          onUpdateStyle({ shadowSize: v });
        }}
        min={0}
        disabled={!selected.style.shadowEnabled}
        ariaLabel="Shadow Size"
      />
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
      <NumberField
        id="shadow-x"
        label="Offset X"
        value={selected.style.shadowOffsetX}
        onValue={(v) => onUpdateStyle({ shadowOffsetX: v })}
        disabled={!selected.style.shadowEnabled}
        ariaLabel="Shadow Offset X"
      />
      <NumberField
        id="shadow-y"
        label="Offset Y"
        value={selected.style.shadowOffsetY}
        onValue={(v) => onUpdateStyle({ shadowOffsetY: v })}
        disabled={!selected.style.shadowEnabled}
        ariaLabel="Shadow Offset Y"
      />
    </ToggleSection>
  );
}
