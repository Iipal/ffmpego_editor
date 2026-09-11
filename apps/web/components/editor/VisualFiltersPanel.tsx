"use client";

import { useSelector } from "@tanstack/react-store";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { readSliderValue } from "@/lib/utils";
import { cutStore, setCutState } from "@/store/cutSlice";
import { filterStore, resetFilters, setFilterState } from "@/store/filterSlice";
import {
  buildVisualVideoFilters,
  DEFAULT_VISUAL_FILTERS,
  isVisualFiltersDefault,
  visualPreviewNotes,
} from "@repo/ffmpeg-filters";

// Small per-slider reset button. Shown next to the value readout, disabled
// when the control is already at its default.
function SliderReset({
  label,
  disabled,
  onReset,
}: {
  label: string;
  disabled: boolean;
  onReset: () => void;
}) {
  return (
    <Button
      variant="ghost"
      size="icon-xs"
      disabled={disabled}
      onClick={onReset}
      aria-label={label}
      title={label}
    >
      <RotateCcw />
    </Button>
  );
}

export function VisualFiltersPanel() {
  const filters = useSelector(filterStore);
  const { exportSpeed, exportFormat } = useSelector(cutStore);
  const vf = buildVisualVideoFilters(filters);
  const isDefault = isVisualFiltersDefault(filters);
  const notes = visualPreviewNotes(filters);
  const disabledForFormat =
    exportFormat === "webm-tg"
      ? "Telegram sticker preset ignores the visual stack (strict 512px output)."
      : null;

  return (
    <div className="space-y-5">
      {disabledForFormat && (
        <p className="text-[11px] leading-4 text-amber-600 dark:text-amber-400">
          {disabledForFormat}
        </p>
      )}

      {/* Color correction (eq) */}
      <section className="space-y-3" aria-label="Color correction">
        <h4 className="text-xs font-semibold">Color</h4>
        {(
          [
            {
              key: "brightness",
              label: "Brightness",
              min: -1,
              max: 1,
              step: 0.01,
            },
            { key: "contrast", label: "Contrast", min: 0, max: 2, step: 0.01 },
            {
              key: "saturation",
              label: "Saturation",
              min: 0,
              max: 3,
              step: 0.01,
            },
            { key: "gamma", label: "Gamma", min: 0.1, max: 10, step: 0.1 },
          ] as const
        ).map((row) => {
          const defaultValue = DEFAULT_VISUAL_FILTERS.eq[row.key];
          const isRowDefault = filters.eq[row.key] === defaultValue;
          return (
            <div key={row.key} className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor={`vf-${row.key}`}>{row.label}</Label>
                <span className="flex items-center gap-1">
                  <span className="text-xs text-kumo-subtle tabular-nums">
                    {filters.eq[row.key].toFixed(2)}
                  </span>
                  <SliderReset
                    label={`Reset ${row.label.toLowerCase()} to default`}
                    disabled={isRowDefault}
                    onReset={() =>
                      setFilterState((previous) => ({
                        ...previous,
                        eq: { ...previous.eq, [row.key]: defaultValue },
                      }))
                    }
                  />
                </span>
              </div>
              <Slider
                id={`vf-${row.key}`}
                value={[filters.eq[row.key]]}
                min={row.min}
                max={row.max}
                step={row.step}
                onValueChange={(value) =>
                  setFilterState((previous) => ({
                    ...previous,
                    eq: { ...previous.eq, [row.key]: readSliderValue(value) },
                  }))
                }
                aria-label={row.label}
              />
            </div>
          );
        })}
      </section>

      {/* Denoise (hqdn3d) */}
      <section className="space-y-3" aria-label="Denoise">
        <div className="flex items-center justify-between">
          <Label htmlFor="vf-denoise">Denoise (hqdn3d)</Label>
          <Switch
            id="vf-denoise"
            checked={filters.denoise.enabled}
            onCheckedChange={(enabled) =>
              setFilterState((previous) => ({
                ...previous,
                denoise: { ...previous.denoise, enabled },
              }))
            }
          />
        </div>
        {filters.denoise.enabled && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="vf-denoise-strength">Strength</Label>
              <span className="flex items-center gap-1">
                <span className="text-xs text-kumo-subtle tabular-nums">
                  {filters.denoise.strength.toFixed(1)}
                </span>
                <SliderReset
                  label="Reset denoise strength to default"
                  disabled={
                    filters.denoise.strength ===
                    DEFAULT_VISUAL_FILTERS.denoise.strength
                  }
                  onReset={() =>
                    setFilterState((previous) => ({
                      ...previous,
                      denoise: {
                        ...previous.denoise,
                        strength: DEFAULT_VISUAL_FILTERS.denoise.strength,
                      },
                    }))
                  }
                />
              </span>
            </div>
            <Slider
              id="vf-denoise-strength"
              value={[filters.denoise.strength]}
              min={0}
              max={10}
              step={0.5}
              onValueChange={(value) =>
                setFilterState((previous) => ({
                  ...previous,
                  denoise: {
                    ...previous.denoise,
                    strength: readSliderValue(value),
                  },
                }))
              }
              aria-label="Denoise strength"
            />
          </div>
        )}
      </section>

      {/* Deshake */}
      <section aria-label="Stabilization">
        <div className="flex items-center justify-between">
          <Label htmlFor="vf-deshake">Stabilize (deshake)</Label>
          <Switch
            id="vf-deshake"
            checked={filters.deshake.enabled}
            onCheckedChange={(enabled) =>
              setFilterState((previous) => ({
                ...previous,
                deshake: { enabled },
              }))
            }
          />
        </div>
      </section>

      {/* Rotate / flip */}
      <section className="space-y-3" aria-label="Rotate and flip">
        <h4 className="text-xs font-semibold">Rotate / flip</h4>
        <div className="flex items-center justify-between">
          <Label htmlFor="vf-flip-h">Flip horizontal</Label>
          <Switch
            id="vf-flip-h"
            checked={filters.transform.flipH}
            onCheckedChange={(flipH) =>
              setFilterState((previous) => ({
                ...previous,
                transform: { ...previous.transform, flipH },
              }))
            }
          />
        </div>
        <div className="flex items-center justify-between">
          <Label htmlFor="vf-flip-v">Flip vertical</Label>
          <Switch
            id="vf-flip-v"
            checked={filters.transform.flipV}
            onCheckedChange={(flipV) =>
              setFilterState((previous) => ({
                ...previous,
                transform: { ...previous.transform, flipV },
              }))
            }
          />
        </div>
        <div className="space-y-2">
          <Label>Rotate clockwise</Label>
          <Select
            value={String(filters.transform.rotate)}
            onValueChange={(value) =>
              value &&
              setFilterState((previous) => ({
                ...previous,
                transform: {
                  ...previous.transform,
                  rotate: Number(value) as 0 | 90 | 180 | 270,
                },
              }))
            }
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="0">None</SelectItem>
              <SelectItem value="90">90°</SelectItem>
              <SelectItem value="180">180°</SelectItem>
              <SelectItem value="270">270°</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </section>

      {/* Speed ramp — single source is cutSlice.exportSpeed */}
      <section className="space-y-2" aria-label="Speed ramp">
        <div className="flex items-center justify-between">
          <Label htmlFor="vf-speed">Speed ramp (export)</Label>
          <span className="flex items-center gap-1">
            <span className="text-xs text-kumo-subtle tabular-nums">
              {exportSpeed.toFixed(1)}x
            </span>
            <SliderReset
              label="Reset export speed to 1x"
              disabled={exportSpeed === 1}
              onReset={() =>
                setCutState((previous) => ({ ...previous, exportSpeed: 1 }))
              }
            />
          </span>
        </div>
        <Slider
          id="vf-speed"
          value={[exportSpeed]}
          min={0.1}
          max={2}
          step={0.1}
          onValueChange={(value) =>
            setCutState((previous) => ({
              ...previous,
              exportSpeed: readSliderValue(value) || 1,
            }))
          }
          aria-label="Export speed"
        />
        <p className="text-[11px] leading-4 text-kumo-subtle">
          Server renders via setpts + atempo; the player previews pacing live.
        </p>
      </section>

      {/* Generated -vf + reset */}
      <section className="space-y-2" aria-label="Generated filter chain">
        <div className="flex items-center justify-between">
          <Label>Filter chain (-vf)</Label>
          <Button
            variant="outline"
            size="sm"
            disabled={isDefault}
            onClick={() => {
              resetFilters();
              setCutState((previous) => ({ ...previous, exportSpeed: 1 }));
            }}
          >
            Reset
          </Button>
        </div>
        <pre className="overflow-auto rounded-md border border-kumo-line bg-kumo-recessed p-2 text-[11px] leading-4 whitespace-pre-wrap break-all">
          <code>
            {vf.length ? vf.join(",") : "(no visual filters — passthrough)"}
          </code>
        </pre>
        {notes.map((note) => (
          <p key={note} className="text-[11px] leading-4 text-kumo-subtle">
            {note}
          </p>
        ))}
      </section>
    </div>
  );
}
