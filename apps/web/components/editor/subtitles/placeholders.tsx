import { Captions, Monitor, Palette, Timer } from "lucide-react";
import { Card } from "@/components/ui/card";
import { CapabilityCard } from "../shared/CapabilityCard";
import {
  DashedPreviewHint,
  EmptyStateShell,
  UploaderCard,
} from "../shared/EmptyState";

export function NoVideoPlaceholderCard() {
  return (
    <EmptyStateShell
      title="Subtitles Editor"
      description="Create, edit and style subtitles over your 9:16 mobile preview. Uses the same crop layout as Mobile editor."
    >
      <UploaderCard />

      <div className="grid gap-3 sm:grid-cols-3">
        <CapabilityCard
          icon={Captions}
          title="Timed captions"
          desc="Add subtitles at the playhead, edit text and timing per row. Changes appear live in the preview."
          meta="add at playhead · per-row timing"
        />
        <CapabilityCard
          icon={Palette}
          title="Full styling"
          desc="Font, size, color, outline, shadow and background boxes tuned to stay readable on video."
          meta="font · outline · background"
        />
        <CapabilityCard
          icon={Timer}
          title="Export with burn-in"
          desc="Subtitles are burned into the 9:16 export locally via FFmpeg. Progress + save picker."
          meta="9:16 · burned-in · local"
        />
      </div>

      <DashedPreviewHint
        icon={<Monitor className="size-3.5" aria-hidden />}
        label="Portrait preview with subtitles"
      >
        <div className="flex justify-center">
          <div className="aspect-9/16 w-40 rounded-xl border border-kumo-hairline bg-kumo-base flex items-end justify-center pb-4">
            <div className="flex flex-col items-center gap-1">
              <div className="h-2 w-24 rounded-sm bg-kumo-line" />
              <div className="h-2 w-16 rounded-sm bg-kumo-line" />
            </div>
          </div>
        </div>
      </DashedPreviewHint>
    </EmptyStateShell>
  );
}

export const EmptySubtitleListPlaceholder = (
  <p className="text-xs text-kumo-subtle text-center py-6 border border-dashed rounded-lg">
    No subtitles yet
  </p>
);

export const NoSelectionCard = (
  <Card className="p-6 text-center">
    <p className="text-xs text-kumo-subtle">
      Select a subtitle to edit its style, position and timing. Changes appear
      live in the preview.
    </p>
  </Card>
);
