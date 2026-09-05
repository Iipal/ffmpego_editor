import { Crop, Film, Monitor, Scissors } from "lucide-react";
import { CapabilityCard } from "../shared/CapabilityCard";
import {
  DashedPreviewHint,
  EmptyStateShell,
  UploaderCard,
} from "../shared/EmptyState";

export function CropEmptyState() {
  return (
    <EmptyStateShell
      title="Crop editor"
      description="Trim, crop and export your video. Select aspect ratio and fine-tune the crop area. Non-destructive edits, original file untouched."
    >
      <UploaderCard />

      <div className="grid gap-3 sm:grid-cols-3">
        <CapabilityCard
          icon={Scissors}
          title="Trim"
          desc="Set in and out points on the timeline. Preview loop keeps playback inside selection."
          meta="timeline · 0.1s precision · loop"
        />
        <CapabilityCard
          icon={Crop}
          title="Crop"
          desc="Drag handles or choose 1:1, 16:9, 21:9. Pixel readout updates as you adjust."
          meta="custom · 1:1 · 16:9 · 21:9"
        />
        <CapabilityCard
          icon={Film}
          title="Export"
          desc="Pick format, fps and quality. FFmpeg runs locally via Bun with progress feedback."
          meta="mp4 · webm · mov · crf 0–60"
        />
      </div>

      <DashedPreviewHint
        icon={<Monitor className="size-3.5" aria-hidden />}
        label="Crop preview"
      >
        <div className="aspect-video rounded-md border border-kumo-hairline bg-kumo-base flex items-center justify-center">
          <span className="text-xs text-kumo-subtle">
            Drop a video to start editing
          </span>
        </div>
      </DashedPreviewHint>
    </EmptyStateShell>
  );
}
