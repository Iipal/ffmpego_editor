"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { clamp } from "@/lib/mobile-layout";
import { MIN_SUBTITLE_DURATION } from "@/lib/subtitles/subtitleDefaults";
import type {
  Subtitle,
  SubtitleTemplate,
} from "@/lib/subtitles/subtitleTypes";
import { getSubtitleTrack } from "./subtitle-helpers";

export type SubtitleBasicsPanelProps = {
  selected: Subtitle;
  templates: SubtitleTemplate[];
  newTemplateName: string;
  onNewTemplateNameChange: (v: string) => void;
  onApplyTemplate: (templateId: string) => void;
  onSaveTemplate: () => void;
  onUpdateSubtitle: (id: string, patch: Partial<Subtitle>) => void;
  onDelete: () => void;
  trackCount: number;
  onMoveToTrack: (id: string, newTrack: number) => void;
  onAddTrack: () => void;
  trimStart: number;
  trimEnd: number;
};

export function SubtitleBasicsPanel({
  selected,
  templates,
  newTemplateName,
  onNewTemplateNameChange,
  onApplyTemplate,
  onSaveTemplate,
  onUpdateSubtitle,
  onDelete,
  trackCount,
  onMoveToTrack,
  onAddTrack,
  trimStart,
  trimEnd,
}: SubtitleBasicsPanelProps) {
  return (
    <>
      <div className="space-y-2">
        <Label htmlFor="template-select">Template</Label>
        <Select
          value=""
          onValueChange={(v) => {
            if (v) onApplyTemplate(v as string);
          }}
        >
          <SelectTrigger id="template-select" aria-label="Template">
            <SelectValue
              placeholder={
                templates.length
                  ? "Select template to apply"
                  : "No templates saved"
              }
            />
          </SelectTrigger>
          <SelectContent>
            {templates.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex gap-2">
          <Input
            placeholder="Template name"
            value={newTemplateName}
            onChange={(e) => onNewTemplateNameChange(e.target.value)}
            aria-label="New template name"
          />
          <Button
            variant="outline"
            size="sm"
            onClick={onSaveTemplate}
            disabled={!newTemplateName.trim() || !selected}
            aria-label="Save Current Style as Template"
          >
            Save Style as Template
          </Button>
        </div>
        {templates.length > 0 ? (
          <p className="text-[10px] text-kumo-subtle">
            Applying a template replaces all 15 style fields (including
            outline/shadow/background toggles). Text/timing/position are
            preserved.
          </p>
        ) : null}
      </div>

      <div className="h-px bg-border" />

      <div className="space-y-2">
        <Label htmlFor="sub-text">Text</Label>
        <Textarea
          id="sub-text"
          value={selected.text}
          onChange={(e) =>
            onUpdateSubtitle(selected.id, { text: e.target.value })
          }
          placeholder="Subtitle text"
          rows={2}
          aria-label="Subtitle text"
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label htmlFor="sub-start" className="text-xs">
            Start (s)
          </Label>
          <Input
            id="sub-start"
            type="number"
            step="0.05"
            value={selected.startTime.toFixed(2)}
            onChange={(e) => {
              const v = parseFloat(e.target.value);
              if (!Number.isFinite(v)) return;
              let ns = clamp(v, trimStart, trimEnd - MIN_SUBTITLE_DURATION);
              let ne = selected.endTime;
              if (ns >= ne)
                ne = clamp(
                  ns + MIN_SUBTITLE_DURATION,
                  ns + MIN_SUBTITLE_DURATION,
                  trimEnd,
                );
              onUpdateSubtitle(selected.id, { startTime: ns, endTime: ne });
            }}
            aria-label="Subtitle start time"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="sub-end" className="text-xs">
            End (s)
          </Label>
          <Input
            id="sub-end"
            type="number"
            step="0.05"
            value={selected.endTime.toFixed(2)}
            onChange={(e) => {
              const v = parseFloat(e.target.value);
              if (!Number.isFinite(v)) return;
              let ne = clamp(v, trimStart + MIN_SUBTITLE_DURATION, trimEnd);
              let ns = selected.startTime;
              if (ne <= ns)
                ns = clamp(
                  ne - MIN_SUBTITLE_DURATION,
                  trimStart,
                  ne - MIN_SUBTITLE_DURATION,
                );
              onUpdateSubtitle(selected.id, { startTime: ns, endTime: ne });
            }}
            aria-label="Subtitle end time"
          />
        </div>
      </div>

      <Button
        variant="destructive"
        size="sm"
        onClick={onDelete}
        aria-label="Delete Subtitle"
        className="w-full"
      >
        Delete Subtitle
      </Button>

      <div className="space-y-2">
        <Label htmlFor="sub-track">Track</Label>
        <div className="flex gap-2">
          <Select
            value={String(getSubtitleTrack(selected))}
            onValueChange={(v) => {
              if (v === null) return;
              onMoveToTrack(selected.id, parseInt(v as string, 10));
            }}
          >
            <SelectTrigger id="sub-track" aria-label="Track" className="flex-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Array.from({ length: trackCount }).map((_, i) => (
                <SelectItem key={i} value={String(i)}>
                  Track {i + 1}
                </SelectItem>
              ))}
              <SelectItem value={String(trackCount)}>
                + New Track {trackCount + 1}
              </SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            onClick={onAddTrack}
            aria-label="Add Track"
          >
            + Track
          </Button>
        </div>
        <p className="text-[10px] text-kumo-subtle">
          Move between tracks to avoid overlap. New subtitles at overlapping
          time auto-create a new track.
        </p>
      </div>

      <div className="h-px bg-border" />

      <div className="space-y-2">
        <Label className="text-xs font-semibold">Position</Label>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label htmlFor="pos-x" className="text-[11px]">
              X (0-100)
            </Label>
            <Input
              id="pos-x"
              type="number"
              min={0}
              max={100}
              value={selected.position.x}
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                if (!Number.isFinite(v)) return;
                const x = clamp(v, 0, 100);
                onUpdateSubtitle(selected.id, {
                  position: { ...selected.position, x },
                });
              }}
              aria-label="Position X"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="pos-y" className="text-[11px]">
              Y (0-100)
            </Label>
            <Input
              id="pos-y"
              type="number"
              min={0}
              max={100}
              value={selected.position.y}
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                if (!Number.isFinite(v)) return;
                const y = clamp(v, 0, 100);
                onUpdateSubtitle(selected.id, {
                  position: { ...selected.position, y },
                });
              }}
              aria-label="Position Y"
            />
          </div>
        </div>
      </div>
    </>
  );
}
