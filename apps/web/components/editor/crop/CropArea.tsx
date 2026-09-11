"use client";

import { Crop, Save } from "lucide-react";
import { SidebarToggle } from "@/components/editor/Sidebar";
import { AreaShell } from "@/components/shared/AreaShell";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useCropControls } from "./hooks";

// Design goals (replaces all previous crop boilerplate):
//  - Single source of truth: `store.crop` is the only mutable state.
//  - Percentages are always 0..100 relative to source pixels (store invariant).
//  - Pixel readout is derived, never stored.
//  - No useDeferredValue / useTransition / stale flags — crop is synchronous.
//  - No manual Map caches, no duplicated localStorage logic, no avg stats.
//  - Visual: one authoritative bar that tells the user what will be exported.
//  - Actions: enable/disable crop mode, reset to full frame, aspect badge.
//  - The interactive rectangle itself lives in CropOverlay (pointer handling);
//    this component is the *control & readout* surface for the crop area.

export function CropArea() {
  const {
    crop,
    aspectRatio,
    isCropMode,
    hasSource,
    px,
    cropLabel,
    sourceLabel,
    isFullFrame,
    resetCrop,
    toggleCropMode,
    saveCrop,
  } = useCropControls();

  return (
    <AreaShell
      icon={<Crop className="size-3.5" aria-hidden />}
      title="Crop area"
      badges={
        <>
          <span
            className={cn(
              "inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium leading-none tabular-nums",
              isFullFrame
                ? "border-kumo-hairline bg-kumo-base text-kumo-subtle"
                : "border-kumo-brand/20 bg-kumo-brand/10 text-kumo-brand",
            )}
          >
            {aspectRatio}
          </span>
          {isCropMode ? (
            <span className="inline-flex items-center gap-1 text-[11px] font-normal text-kumo-success">
              <span
                className="size-1.5 rounded-full bg-kumo-success"
                aria-hidden
              />
              editing
            </span>
          ) : null}
        </>
      }
      subtitle={
        <>
          {cropLabel}
          <span aria-hidden className="mx-1 text-kumo-hairline">
            ·
          </span>
          source {sourceLabel}
        </>
      }
      actions={
        <>
          <Button
            size="sm"
            variant={isCropMode ? "default" : "outline"}
            onClick={toggleCropMode}
            className="h-7 rounded-md text-xs"
          >
            {isCropMode ? "Done" : "Edit crop"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={resetCrop}
            className="h-7 rounded-md text-xs"
            title="Restore saved crop from localStorage"
          >
            Reset
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={saveCrop}
            className="h-7 gap-1.5 rounded-md text-xs"
            title="Save crop to localStorage"
            aria-label="Save crop settings"
          >
            <Save className="size-3.5" aria-hidden />
            Save
          </Button>

          <SidebarToggle />
        </>
      }
      readouts={[
        {
          label: "X / Y (pct)",
          value: (
            <>
              <div className="mt-0.5 font-mono text-xs tabular-nums">
                {crop.x.toFixed(1)}% · {crop.y.toFixed(1)}%
              </div>
              {px && (
                <div className="font-mono text-[11px] tabular-nums text-kumo-subtle">
                  {px.x} · {px.y} px
                </div>
              )}
            </>
          ),
        },
        {
          label: "Size (pct)",
          value: (
            <>
              <div className="mt-0.5 font-mono text-xs tabular-nums">
                {crop.width.toFixed(1)}% × {crop.height.toFixed(1)}%
              </div>
              {px && (
                <div className="font-mono text-[11px] tabular-nums text-kumo-subtle">
                  {px.w} × {px.h} px
                </div>
              )}
            </>
          ),
        },
        {
          label: "End (pct)",
          value: (
            <>
              <div className="mt-0.5 font-mono text-xs tabular-nums">
                {(crop.x + crop.width).toFixed(1)}% ·{" "}
                {(crop.y + crop.height).toFixed(1)}%
              </div>
              {px && (
                <div className="font-mono text-[11px] tabular-nums text-kumo-subtle">
                  {px.x2} · {px.y2} px
                </div>
              )}
            </>
          ),
        },
        {
          label: "FFmpeg",
          value: (
            <div className="mt-0.5 font-mono text-[11px] leading-4 tabular-nums text-kumo-subtle">
              {hasSource && px
                ? `crop=${px.w}:${px.h}:${px.x}:${px.y}`
                : `crop=${crop.width.toFixed(1)}%:${crop.height.toFixed(1)}%:${crop.x.toFixed(1)}%:${crop.y.toFixed(1)}%`}
            </div>
          ),
        },
      ]}
      hint={
        isCropMode ? (
          <span>
            Drag the rectangle to move · drag handles to resize · aspect lock in
            sidebar
          </span>
        ) : (
          <span>Click “Edit crop” to adjust the rectangle on the video</span>
        )
      }
    />
  );
}
