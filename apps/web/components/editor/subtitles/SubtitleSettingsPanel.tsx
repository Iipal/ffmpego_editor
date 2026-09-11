"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CustomArgsCollapsible } from "@/components/editor/CustomArgsCollapsible";
import { formatTime } from "@/lib/format-time";
import { SubtitleStorage } from "@/lib/subtitles/subtitleStorage";
import type { Subtitle, SubtitleStyle } from "@/lib/subtitles/subtitleStorage";
import { NoSelectionCard } from "./placeholders";
import { SubtitleBackgroundPanel } from "./SubtitleBackgroundPanel";
import {
  SubtitleBasicsPanel,
  type SubtitleBasicsPanelProps,
} from "./SubtitleBasicsPanel";
import { SubtitleFontPanel } from "./SubtitleFontPanel";
import { SubtitleOutlinePanel } from "./SubtitleOutlinePanel";
import { SubtitleShadowPanel } from "./SubtitleShadowPanel";

export type SubtitleSettingsPanelProps = Omit<
  SubtitleBasicsPanelProps,
  "selected"
> & {
  selected: Subtitle | null;
  onUpdateStyle: (patch: Partial<SubtitleStyle>) => void;
  customFFmpegArgs: string;
  onCustomFFmpegArgsChange: (v: string) => void;
};

export function SubtitleSettingsPanel({
  selected,
  templates,
  onUpdateStyle,
  customFFmpegArgs,
  onCustomFFmpegArgsChange,
  ...basics
}: SubtitleSettingsPanelProps) {
  return (
    <>
      {selected ? (
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm">Subtitle Settings</CardTitle>
            <p
              className="text-xs text-kumo-subtle truncate"
              suppressHydrationWarning
            >
              {selected.text || "New subtitle"} ·{" "}
              {formatTime(selected.startTime)} – {formatTime(selected.endTime)}
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <SubtitleBasicsPanel
              selected={selected}
              templates={templates}
              {...basics}
            />
            <SubtitleFontPanel
              selected={selected}
              onUpdateStyle={onUpdateStyle}
            />
            <SubtitleOutlinePanel
              selected={selected}
              onUpdateStyle={onUpdateStyle}
            />
            <SubtitleShadowPanel
              selected={selected}
              onUpdateStyle={onUpdateStyle}
            />
            <SubtitleBackgroundPanel
              selected={selected}
              onUpdateStyle={onUpdateStyle}
            />
          </CardContent>
        </Card>
      ) : (
        NoSelectionCard
      )}
      <Card className="p-3">
        <CustomArgsCollapsible
          value={customFFmpegArgs}
          onChange={onCustomFFmpegArgsChange}
        />
      </Card>
      <Card className="p-3">
        <div className="text-xs font-medium">
          Templates stored: {templates.length}
        </div>

        {templates.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-1">
            {templates.map((t) => (
              <span
                key={t.id}
                className="text-[10px] bg-kumo-recessed px-1.5 py-0.5 rounded border"
              >
                {t.name}
              </span>
            ))}
          </div>
        ) : null}
      </Card>
    </>
  );
}
