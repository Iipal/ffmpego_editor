"use client";

import type { Dispatch, SetStateAction } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Film } from "lucide-react";
import {
  clamp,
  MAX_SPLIT,
  MIN_SPLIT,
  OUTPUT_H,
  OUTPUT_W,
} from "@/lib/mobile-layout";
import type { MobileLayout } from "@/lib/mobile-layout";
import { ZoneSliders } from "./ZoneSliders";
import type { CutMode } from "./types";

export function CutSettingsSidebar({
  mode,
  onModeChange,
  sourceWidth,
  sourceHeight,
  watermarkStack,
  onWatermarkStackChange,
  watermarkSingle,
  onWatermarkSingleChange,
  stackedLayout,
  setStackedLayout,
  singleLayout,
  onUpdateZone,
  onSyncFromMobile,
  exportName,
  onExportNameChange,
  exportPlaceholder,
  cutsCount,
  overlapCount,
  isExporting,
  onExport,
}: {
  mode: CutMode;
  onModeChange: (v: CutMode) => void;
  sourceWidth: number;
  sourceHeight: number;
  watermarkStack: boolean;
  onWatermarkStackChange: (v: boolean) => void;
  watermarkSingle: boolean;
  onWatermarkSingleChange: (v: boolean) => void;
  stackedLayout: MobileLayout;
  setStackedLayout: Dispatch<SetStateAction<MobileLayout>>;
  singleLayout: MobileLayout;
  onUpdateZone: (
    layout: "stacked" | "full",
    id: string,
    z: MobileLayout["zones"][number],
  ) => void;
  onSyncFromMobile: () => void;
  exportName: string;
  onExportNameChange: (v: string) => void;
  exportPlaceholder: string;
  cutsCount: number;
  overlapCount: number;
  isExporting: boolean;
  onExport: () => void;
}) {
  return (
    <Card>
      <CardHeader className="py-3">
        <CardTitle className="text-sm font-semibold tracking-normal">
          Cut settings
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Mode</Label>
          <Select value={mode} onValueChange={(v) => onModeChange(v as CutMode)}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="full-size">Full-size (original)</SelectItem>
              <SelectItem value="2-stack">9:16 2-Stack</SelectItem>
              <SelectItem value="1-stack">9:16 1-Zone</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-[11px] leading-4 text-kumo-subtle">
            {mode === "full-size"
              ? `Original ${sourceWidth || "—"}×${sourceHeight || "—"} kept, cuts concatenated.`
              : `Reframed to ${OUTPUT_W}×${OUTPUT_H} with Mobile zones, cuts concatenated.`}
          </p>
        </div>

        {mode === "2-stack" ? (
          <div className="space-y-2 rounded-lg border border-kumo-hairline bg-kumo-recessed/40 p-2.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Use watermark</Label>
              <Switch
                checked={watermarkStack}
                onCheckedChange={onWatermarkStackChange}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">
                Split {Math.round(stackedLayout.splitRatio * 100)} /{" "}
                {Math.round((1 - stackedLayout.splitRatio) * 100)}
              </Label>
              <Slider
                value={[stackedLayout.splitRatio]}
                min={MIN_SPLIT}
                max={MAX_SPLIT}
                step={0.01}
                onValueChange={(v) => {
                  const val = Array.isArray(v)
                    ? (v[0] as number)
                    : (v as number);
                  setStackedLayout((p) => ({
                    ...p,
                    splitRatio: clamp(val, MIN_SPLIT, MAX_SPLIT),
                  }));
                }}
              />
            </div>
            {stackedLayout.zones.map((z, i) => (
              <div
                key={z.id}
                className="space-y-1.5 border-t border-kumo-hairline pt-2"
              >
                <span className="text-xs font-medium">Zone {i + 1}</span>
                <ZoneSliders
                  zone={z}
                  onChange={(nz) => onUpdateZone("stacked", z.id, nz)}
                />
              </div>
            ))}
          </div>
        ) : null}

        {mode === "1-stack" ? (
          <div className="space-y-2 rounded-lg border border-kumo-hairline bg-kumo-recessed/40 p-2.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Use watermark</Label>
              <Switch
                checked={watermarkSingle}
                onCheckedChange={onWatermarkSingleChange}
              />
            </div>
            {singleLayout.zones.map((z, i) => (
              <div key={z.id} className="space-y-1.5">
                <span className="text-xs font-medium">
                  Zone {i + 1} (full height 9:16)
                </span>
                <ZoneSliders
                  zone={z}
                  onChange={(nz) => onUpdateZone("full", z.id, nz)}
                />
              </div>
            ))}
          </div>
        ) : null}

        <Button
          size="sm"
          variant="secondary"
          onClick={onSyncFromMobile}
          className="w-full"
        >
          Sync zones from Mobile editor
        </Button>

        <div className="space-y-1.5">
          <Label className="text-xs">Export filename</Label>
          <Input
            value={exportName}
            onChange={(e) => onExportNameChange(e.target.value)}
            placeholder={exportPlaceholder}
            className="h-8 text-xs"
          />
        </div>

        <Button
          className="w-full"
          onClick={onExport}
          disabled={cutsCount === 0 || overlapCount > 0 || isExporting}
        >
          <Film className="size-3.5" aria-hidden />
          {isExporting ? "Exporting…" : `Export ${cutsCount} cut(s)`}
        </Button>
        <p className="text-[10px] leading-3 text-kumo-subtle">
          Renders POST /transcode/cut with cuts + mode {mode}. Output{" "}
          {mode === "full-size" ? "original size" : "1080×1920"} · 30fps mp4.
        </p>
      </CardContent>
    </Card>
  );
}
