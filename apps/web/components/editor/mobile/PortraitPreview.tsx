"use client";

import { memo } from "react";
import dynamic from "next/dynamic";
import { OUTPUT_H, OUTPUT_W } from "@/lib/mobile-layout";
import { HEAVY_MODULES } from "./mobile-helpers";
import { usePortraitCanvas } from "./usePortraitCanvas";
import {
  NoPreviewPlaceholder,
  SafeAreaFullOverlay,
  SafeAreaOverlay,
} from "./placeholders";
import type { PortraitPreviewProps } from "./types";

export const DynamicPortraitPreview = dynamic(
  () =>
    HEAVY_MODULES.portrait().then((m) => ({
      default:
        m.MobilePreviewShared as unknown as React.ComponentType<PortraitPreviewProps>,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="mx-auto aspect-9/16 w-full max-w-70 rounded-xl border border-kumo-line bg-kumo-recessed animate-pulse" />
    ),
  },
);

export const PortraitPreview = memo(function PortraitPreview({
  layout,
  videoRef,
  onSplit,
  safe,
  useWatermark,
}: PortraitPreviewProps) {
  const {
    canvasFullRef,
    canvasTopRef,
    canvasBottomRef,
    wrapRef,
    deferredSplit,
    startDrag,
  } = usePortraitCanvas(layout, videoRef, onSplit, useWatermark);

  const video = videoRef.current;
  if (!video || !video.src) return NoPreviewPlaceholder;

  if (layout.mode === "full") {
    return (
      <div className="flex flex-col items-center gap-2">
        <div
          ref={wrapRef}
          className="relative aspect-9/16 w-full max-w-70 overflow-hidden rounded-lg border border-kumo-line bg-black shadow-[0_1px_2px_rgba(0,0,0,0.05)] flex items-center justify-center"
        >
          <canvas ref={canvasFullRef} className="block max-w-full h-auto" />
          {safe ? SafeAreaFullOverlay : null}
          <span className="absolute left-1.5 top-1.5 inline-flex items-center rounded-md border border-white/15 bg-black/55 px-1.5 py-0.5 font-mono text-[11px] font-medium leading-none text-white tabular-nums shadow-sm">
            Full
          </span>
        </div>
        <div className="font-mono text-[11px] tabular-nums text-kumo-subtle">
          {OUTPUT_W} × {OUTPUT_H} · Full 9:16
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <div
        ref={wrapRef}
        className="relative aspect-9/16 w-full max-w-70 overflow-hidden rounded-lg border border-kumo-line bg-black shadow-[0_1px_2px_rgba(0,0,0,0.05)] flex flex-col"
      >
        <div
          className="relative overflow-hidden flex items-center justify-center"
          style={{ height: `${deferredSplit * 100}%` }}
        >
          <canvas ref={canvasTopRef} className="block" />
          {safe ? SafeAreaOverlay : null}
          <span className="absolute left-1.5 top-1.5 inline-flex items-center rounded-md border border-white/15 bg-black/55 px-1.5 py-0.5 font-mono text-[11px] font-medium leading-none text-white tabular-nums shadow-sm">
            Zone 1
          </span>
        </div>
        <div
          onPointerDown={startDrag}
          className="h-2 shrink-0 z-10 flex items-center justify-center cursor-row-resize border-y border-kumo-hairline bg-kumo-recessed hover:bg-kumo-line/60 transition-colors"
        >
          <div className="h-0.5 w-8 rounded bg-kumo-subtle/50" />
        </div>
        <div
          className="relative overflow-hidden flex items-center justify-center"
          style={{ height: `${(1 - deferredSplit) * 100}%` }}
        >
          <canvas ref={canvasBottomRef} className="block" />
          {safe ? SafeAreaOverlay : null}
          <span className="absolute left-1.5 top-1.5 inline-flex items-center rounded-md border border-white/15 bg-black/55 px-1.5 py-0.5 font-mono text-[11px] font-medium leading-none text-white tabular-nums shadow-sm">
            Zone 2
          </span>
        </div>
      </div>
      <div className="font-mono text-[11px] tabular-nums text-kumo-subtle">
        {OUTPUT_W} × {OUTPUT_H} · {(deferredSplit * 100).toFixed(0)}% /{" "}
        {((1 - deferredSplit) * 100).toFixed(0)}%
      </div>
    </div>
  );
});
