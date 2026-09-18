"use client";

import { Crop, Save } from "lucide-react";
import { SidebarToggle } from "@/components/editor/Sidebar";
import { AreaShell } from "@/components/shared/AreaShell";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useCropControls } from "./hooks";

// Stage toolbar for the crop job: identity + Edit/Done + Reset/Save.
// Numeric readouts live once in the sidebar Crop card — this bar stays
// slim so the video stage is the hero. The ffmpeg string rides along in
// the subtitle so the export contract is visible where the rect is drawn.
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

  const ffmpeg =
    hasSource && px
      ? `crop=${px.w}:${px.h}:${px.x}:${px.y}`
      : `crop=${crop.width.toFixed(1)}%:${crop.height.toFixed(1)}%:${crop.x.toFixed(1)}%:${crop.y.toFixed(1)}%`;

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
          {isFullFrame ? "Full frame" : cropLabel}
          <span aria-hidden className="mx-1 text-kumo-hairline">
            ·
          </span>
          source {sourceLabel}
          {isFullFrame ? null : (
            <>
              <span aria-hidden className="mx-1 text-kumo-hairline">
                ·
              </span>
              <span className="font-mono tabular-nums">{ffmpeg}</span>
            </>
          )}
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
      hint={
        isCropMode ? (
          <span>
            Drag the rectangle to move · drag handles to resize · aspect lock in
            sidebar
          </span>
        ) : undefined
      }
    />
  );
}
