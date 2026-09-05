"use client";

import { Monitor, Smartphone } from "lucide-react";

export const NoVideoPlaceholder = (
  <div className="flex aspect-video items-center justify-center rounded-lg border border-dashed border-kumo-line bg-kumo-recessed text-xs leading-4 text-kumo-subtle">
    <span className="inline-flex items-center gap-1.5">
      <Monitor className="size-3.5 opacity-60" aria-hidden />
      No video — upload to position zones
    </span>
  </div>
);

export const NoPreviewPlaceholder = (
  <div className="mx-auto flex aspect-9/16 w-full max-w-70 items-center justify-center rounded-xl border border-dashed border-kumo-line bg-kumo-recessed text-xs leading-4 text-kumo-subtle">
    <span className="inline-flex items-center gap-1.5 font-mono text-[11px] tabular-nums">
      <Smartphone className="size-3.5 opacity-60" aria-hidden />
      Preview appears after upload
    </span>
  </div>
);

export const ZoneGridOverlay = (
  <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 opacity-30 pointer-events-none">
    <div className="border-r border-b border-white/40" />
    <div className="border-r border-b border-white/40" />
    <div className="border-b border-white/40" />
    <div className="border-r border-white/40" />
    <div className="border-r border-white/40" />
    <div />
    <div className="border-r border-white/40" />
    <div className="border-r border-white/40" />
    <div />
  </div>
);

export const SafeAreaOverlay = (
  <div className="absolute inset-2 rounded-md border border-white/20 pointer-events-none" />
);

export const SafeAreaFullOverlay = (
  <div className="absolute inset-3 rounded-md border border-white/20 pointer-events-none" />
);
