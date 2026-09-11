"use client";

import dynamic from "next/dynamic";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { googleFonts } from "@/lib/subtitles/googleFonts";
import type { Subtitle, SubtitleStyle } from "@/lib/subtitles/subtitleStorage";
import { NOOP } from "@/lib/utils";
import { isValidHexColor, normalizeHex } from "./subtitle-helpers";
import { NumberField } from "./StyleFields";

export type SubtitleFontPanelProps = {
  selected: Subtitle;
  onUpdateStyle: (patch: Partial<SubtitleStyle>) => void;
};

// GoogleFontPicker pulls Popover+Command+font catalog — dynamic-imported here
// where it renders (only needed when a subtitle is selected).
const DynamicGoogleFontPicker = dynamic(
  () =>
    import("@/components/editor/GoogleFontPicker").then((m) => ({
      default: m.GoogleFontPicker,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="h-9 w-full rounded-md border border-kumo-line bg-kumo-recessed animate-pulse" />
    ),
  },
);

export function SubtitleFontPanel({
  selected,
  onUpdateStyle,
}: SubtitleFontPanelProps) {
  return (
    <>
      <div className="space-y-2">
        <Label htmlFor="font-family">Font Family</Label>
        <DynamicGoogleFontPicker
          value={selected.style.fontFamily}
          onValueChange={(v) => {
            googleFonts.ensureGoogleFontLoaded(v).catch(NOOP);
            onUpdateStyle({ fontFamily: v });
          }}
          id="font-family"
          placeholder="Search Google Fonts…"
          previewText={selected.text}
        />
        <p className="text-[11px] text-kumo-subtle">
          Dynamic Google Fonts search — fonts are loaded on demand via Google
          Fonts CDN.
        </p>
      </div>

      <NumberField
        id="font-size"
        label="Font Size"
        value={selected.style.fontSize}
        onValue={(v) => {
          if (v <= 0) return;
          onUpdateStyle({ fontSize: v });
        }}
        min={1}
        labelClassName="text-xs"
        className="space-y-2"
        ariaLabel="Font Size"
      />

      <div className="space-y-2">
        <Label className="text-xs">Text Color</Label>
        <div className="flex gap-2 items-center">
          <Input
            type="color"
            value={
              selected.style.color.length === 7
                ? selected.style.color
                : "#FFFFFF"
            }
            onChange={(e) => onUpdateStyle({ color: e.target.value })}
            className="size-9 p-1 cursor-pointer"
            aria-label="Text Color picker"
          />
          <Input
            value={selected.style.color}
            onChange={(e) => onUpdateStyle({ color: e.target.value })}
            onBlur={(e) => {
              const v = normalizeHex(e.target.value);
              if (isValidHexColor(v)) onUpdateStyle({ color: v });
            }}
            placeholder="#FFFFFF"
            aria-label="Text Color HEX"
            className="flex-1"
          />
        </div>
      </div>
    </>
  );
}
