"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GoogleFontPicker } from "@/components/editor/GoogleFontPicker";
import { ensureGoogleFontLoaded } from "@/lib/subtitles/googleFonts";
import type {
  Subtitle,
  SubtitleStyle,
} from "@/lib/subtitles/subtitleTypes";
import { NOOP } from "./heavy-modules";
import { isValidHexColor, normalizeHex } from "./subtitle-helpers";

export type SubtitleFontPanelProps = {
  selected: Subtitle;
  onUpdateStyle: (patch: Partial<SubtitleStyle>) => void;
};

export function SubtitleFontPanel({
  selected,
  onUpdateStyle,
}: SubtitleFontPanelProps) {
  return (
    <>
      <div className="space-y-2">
        <Label htmlFor="font-family">Font Family</Label>
        <GoogleFontPicker
          value={selected.style.fontFamily}
          onValueChange={(v) => {
            ensureGoogleFontLoaded(v).catch(NOOP);
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

      <div className="space-y-2">
        <Label htmlFor="font-size" className="text-xs">
          Font Size
        </Label>
        <Input
          id="font-size"
          type="number"
          min={1}
          value={selected.style.fontSize}
          onChange={(e) => {
            const v = parseFloat(e.target.value);
            if (!Number.isFinite(v) || v <= 0) return;
            onUpdateStyle({ fontSize: v });
          }}
          aria-label="Font Size"
        />
      </div>

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
