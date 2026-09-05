"use client";

import { CardContent } from "@/components/ui/card";
import { Card } from "@/components/ui/card";
import { DynamicCard } from "./heavy";

// rendering-hoist-jsx: static elements created once (avoid per-render recreation)
export const LoadingPlaceholder = (
  <div className="text-xs text-kumo-subtle py-8 text-center">Loading jobs…</div>
);
export const NoJobsForAll = (
  <div className="rounded-lg border border-dashed border-kumo-line bg-kumo-recessed p-8 text-center">
    <p className="text-sm font-medium text-kumo-strong">No jobs</p>
    <p className="text-xs text-kumo-subtle mt-1">
      No transcode jobs yet. Exports will appear here.
    </p>
  </div>
);
export const TipsHoisted = (
  <Card size="sm" className="bg-kumo-recessed">
    <CardContent className="py-3">
      <p className="text-xs text-kumo-subtle leading-relaxed">
        <span className="font-medium text-kumo-default">Tips:</span> Pending ={" "}
        <code className="px-1 py-0.5 rounded bg-kumo-base border border-kumo-line font-mono">
          processing
        </code>
        . Use &quot;Clear pending&quot; to kill hanging FFmpeg processes and
        delete their temp inputs. &quot;Clear all&quot; wipes completed/failed
        too and sweeps <code className="font-mono">apps/api/temp_*</code> +{" "}
        <code className="font-mono">/tmp/&lt;uuid&gt;-*</code>.
      </p>
    </CardContent>
  </Card>
);
// Demonstrates DynamicCard bundle-conditionally loaded (kept hidden; ensures analyzable path is exercised)
export const DynamicCardProbe = (
  <span className="hidden">
    {false ? (
      <DynamicCard>
        <CardContent>probe</CardContent>
      </DynamicCard>
    ) : null}
  </span>
);
