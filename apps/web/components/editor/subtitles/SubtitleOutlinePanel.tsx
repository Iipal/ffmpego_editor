"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Subtitle, SubtitleStyle } from "@/lib/subtitles/subtitleStorage";
import { isValidHexColor } from "./subtitle-helpers";
import { NumberField, ToggleSection } from "./StyleFields";

export type SubtitleOutlinePanelProps = {
  selected: Subtitle;
  onUpdateStyle: (patch: Partial<SubtitleStyle>) => void;
};

export function SubtitleOutlinePanel({
  selected,
  onUpdateStyle,
}: SubtitleOutlinePanelProps) {
  return (
    <ToggleSection
      title="Outline"
      enabled={selected.style.outlineEnabled}
      onToggle={(checked) => onUpdateStyle({ outlineEnabled: checked })}
      toggleLabel="Toggle outline"
      bodyClassName="grid grid-cols-2 gap-2"
    >
      <NumberField
        id="outline-thick"
        label="Thickness"
        value={selected.style.outlineThickness}
        onValue={(v) => {
          if (v < 0) return;
          onUpdateStyle({ outlineThickness: v });
        }}
        min={0}
        step={0.5}
        disabled={!selected.style.outlineEnabled}
        ariaLabel="Outline Thickness"
      />
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
    </ToggleSection>
  );
}
