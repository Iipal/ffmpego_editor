"use client";

import { ChevronDown } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/**
 * Shared "Advanced" collapsible for the per-page `customFFmpegArgs` free-text
 * field (crop `Sidebar`, mobile `PreviewPanel`, `CutSettingsSidebar`,
 * subtitles `SubtitleSettingsPanel`, bulk `BulkSettingsPanel`). Same Shadcn
 * primitives + styling everywhere so the five export forms stay visually
 * identical; the backend (`parseCustomArgs` shell-quote + structural
 * denylist) rejects managed flags (`-i/-map/-ss/-t/-vf` where the exporter
 * owns the graph) with a 4xx the export error paths surface.
 */
export function CustomArgsCollapsible({
  value,
  onChange,
  hint,
}: {
  value: string;
  onChange: (v: string) => void;
  hint?: string;
}) {
  return (
    <Collapsible>
      <CollapsibleTrigger className="flex w-full items-center justify-between text-xs font-semibold tracking-normal">
        Advanced <ChevronDown className="size-4 text-kumo-subtle" />
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-2 pt-3">
        <Label>FFmpeg arguments</Label>
        <Textarea
          value={value}
          placeholder="-vf eq=contrast=1.2 -b:v 2M"
          onChange={(event) => onChange(event.target.value)}
        />
        <p className="text-[11px] leading-4 text-kumo-subtle">
          {hint ??
            "Passed to ffmpeg after the exporter's own flags. Managed flags (-i, -map, -ss, -t) and page-owned filters are rejected — use this only for advanced overrides."}
        </p>
      </CollapsibleContent>
    </Collapsible>
  );
}
