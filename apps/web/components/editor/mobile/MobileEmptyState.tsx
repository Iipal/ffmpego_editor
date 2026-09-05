"use client";

import { Film, Layers, Monitor, Smartphone } from "lucide-react";
import { CapabilityCard } from "../shared/CapabilityCard";
import {
  DashedPreviewHint,
  EmptyStateShell,
  UploaderCard,
} from "../shared/EmptyState";

export function MobileEmptyState() {
  return (
    <EmptyStateShell
      title="Mobile editor"
      description="Convert 16:9 landscape into 9:16 portrait with a stacked two-zone layout. Position camera and gameplay, preview 1080×1920 live. Non-destructive, original untouched."
    >
      <UploaderCard />

      <div className="grid gap-3 sm:grid-cols-3">
        <CapabilityCard
          icon={Layers}
          title="Two zones"
          desc="Stacked layout over 1080×1920 canvas. Drag zones, resize with locked 9:16 aspect, zoom per zone."
          meta="stacked · 9:16 · zoom 0.5–3×"
        />
        <CapabilityCard
          icon={Smartphone}
          title="Portrait preview"
          desc="Live canvas preview with draggable split. Safe-area overlay shows platform cut-off."
          meta="1080 × 1920 · drag divider"
        />
        <CapabilityCard
          icon={Film}
          title="Export"
          desc="Single FFmpeg filter trims, crops and stacks locally via Bun. Progress + save picker."
          meta="mp4 CRF 10 · 30fps · local"
        />
      </div>

      <DashedPreviewHint
        icon={<Monitor className="size-3.5" aria-hidden />}
        label="Source and portrait preview"
      >
        <div className="grid gap-3 md:grid-cols-[1.35fr_0.9fr]">
          <div className="aspect-video rounded-md border border-kumo-hairline bg-kumo-base flex items-center justify-center">
            <span className="text-xs text-kumo-subtle">
              16:9 source — position zones
            </span>
          </div>
          <div className="flex justify-center">
            <div className="aspect-9/16 w-32 rounded-xl border border-kumo-hairline bg-kumo-base flex items-center justify-center">
              <span className="text-[11px] text-kumo-subtle">9:16 STACKED</span>
            </div>
          </div>
        </div>
        <span suppressHydrationWarning className="sr-only">
          {new Date().toLocaleTimeString()}
        </span>
      </DashedPreviewHint>
    </EmptyStateShell>
  );
}
