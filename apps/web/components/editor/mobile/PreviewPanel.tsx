"use client";

import { Activity } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { formatTime } from "@/lib/format-time";
import { MAX_SPLIT, MIN_SPLIT } from "@/lib/mobile-layout";
import type { MobileLayout } from "@/lib/mobile-layout";
import { PortraitPreview, DynamicPortraitPreview } from "./PortraitPreview";
import { preloadHeavyPreview } from "./mobile-helpers";

type PreviewPanelProps = {
  layout: MobileLayout;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  onSplit: (v: number) => void;
  safe: boolean;
  setSafe: (v: boolean) => void;
  useWatermark: boolean;
  setUseWatermark: (v: boolean) => void;
  ignoreTrim: boolean;
  setIgnoreTrim: (v: boolean) => void;
  onSavePreference: () => void;
  deferredFilter: string;
  isFilterStale: boolean;
  isPending: boolean;
  trimStart: number;
  trimEnd: number;
  trimmedDuration: number;
};

export function PreviewPanel({
  layout,
  videoRef,
  onSplit,
  safe,
  setSafe,
  useWatermark,
  setUseWatermark,
  ignoreTrim,
  setIgnoreTrim,
  onSavePreference,
  deferredFilter,
  isFilterStale,
  isPending,
  trimStart,
  trimEnd,
  trimmedDuration,
}: PreviewPanelProps) {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-sm font-semibold tracking-normal">
            Preview · {layout.mode === "stacked" ? "Stacked" : "Full"}{" "}
            <span className="font-mono text-[11px] font-normal tabular-nums text-kumo-subtle">
              1080 × 1920
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div onMouseEnter={preloadHeavyPreview} onFocus={preloadHeavyPreview}>
            <Activity mode="visible">
              <PortraitPreview
                layout={layout}
                videoRef={videoRef}
                onSplit={onSplit}
                safe={safe}
                useWatermark={useWatermark}
              />
            </Activity>
            <span className="hidden">
              {false ? (
                <DynamicPortraitPreview
                  layout={layout}
                  videoRef={videoRef}
                  onSplit={onSplit}
                  safe={safe}
                  useWatermark={useWatermark}
                />
              ) : null}
            </span>
          </div>
          <div className="space-y-2 pt-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs">
                Split {Math.round(layout.splitRatio * 100)}% /{" "}
                {Math.round((1 - layout.splitRatio) * 100)}%
              </Label>
              <span className="text-[10px] text-kumo-subtle">
                drag divider or slider
              </span>
            </div>
            <Slider
              value={[layout.splitRatio]}
              min={MIN_SPLIT}
              max={MAX_SPLIT}
              step={0.01}
              onValueChange={(v) =>
                onSplit(Array.isArray(v) ? (v[0] as number) : (v as number))
              }
              disabled={layout.mode === "full"}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-xs">Safe area</Label>
            <Switch checked={safe} onCheckedChange={setSafe} />
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-xs">Use watermark</Label>
            <Switch checked={useWatermark} onCheckedChange={setUseWatermark} />
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-xs">Ignore Trim Settings</Label>
            <Switch checked={ignoreTrim} onCheckedChange={setIgnoreTrim} />
          </div>
          <Button className="w-full" onClick={onSavePreference}>
            Save preference
          </Button>
          <p className="text-[10px] leading-3 text-kumo-subtle">
            Static zones across {ignoreTrim ? "full video" : "trimmed clip"}.
            Final render 1080×1920 · same geometry as preview.{" "}
            {ignoreTrim ? "Trim ignored on export." : "Trim applied to export."}
          </p>
          {isPending ? (
            <span className="text-[10px] text-kumo-subtle">
              Updating preview…
            </span>
          ) : null}
        </CardContent>
      </Card>
      <Card className="p-3 space-y-2">
        <div className="text-xs font-medium">FFmpeg</div>
        <code
          className="block text-[10px] leading-3 break-all bg-kumo-recessed p-2 rounded"
          style={isFilterStale ? { opacity: 0.7 } : undefined}
          suppressHydrationWarning
        >
          {deferredFilter}
        </code>
        <div className="text-[11px] tabular-nums text-kumo-subtle space-y-1">
          <div className="flex justify-between">
            <span>Trim</span>
            <span>
              {formatTime(trimStart)} → {formatTime(trimEnd)}
            </span>
          </div>
          <div className="flex justify-between">
            <span>Duration</span>
            <span>{formatTime(trimmedDuration)}</span>
          </div>
        </div>
      </Card>
    </div>
  );
}
