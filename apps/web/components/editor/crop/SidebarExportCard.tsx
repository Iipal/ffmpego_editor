"use client";

import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { readSliderValue } from "@/lib/utils";
import { setCutState } from "@/store/cutSlice";
import { setAudioState } from "@/store/audioSlice";
import { CustomArgsCollapsible } from "@/components/editor/CustomArgsCollapsible";
import { exportPresets } from "@/lib/export-presets";
import { useCropExport } from "./useCropExport";
import { SidebarPreflightSummary } from "./SidebarPreflightSummary";

/** Export section: presets, format/quality/fps, tracks, progress, export. */
export function SidebarExportCard() {
  const {
    source,
    cut,
    audioTracks,
    basename,
    presets,
    presetId,
    selectedPreset,
    customPresetName,
    setCustomPresetName,
    applyPreset,
    saveCurrentAsPreset,
    deleteSelectedPreset,
    preflightResult,
    startExport,
    activeExport,
    activeExportsCount,
    lastFailure,
  } = useCropExport();

  return (
    <Card className="p-4 rounded-lg">
      <Collapsible defaultOpen>
        <CollapsibleTrigger className="flex w-full items-center justify-between text-xs font-semibold tracking-normal">
          Export <ChevronDown className="size-4 text-kumo-subtle" />
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-4 pt-3">
          <div className="space-y-2">
            <Label>Preset</Label>
            <div className="flex gap-2">
              <Select
                value={presetId}
                onValueChange={(v) => v && applyPreset(v)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Custom settings" />
                </SelectTrigger>
                <SelectContent>
                  {presets.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedPreset &&
                !exportPresets.isBuiltin(selectedPreset.id) && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={deleteSelectedPreset}
                    aria-label="Delete preset"
                  >
                    Delete
                  </Button>
                )}
            </div>
            {selectedPreset?.description && (
              <p className="text-[11px] leading-4 text-kumo-subtle">
                {selectedPreset.description}
              </p>
            )}
            <div className="flex gap-2">
              <Input
                value={customPresetName}
                onChange={(e) => setCustomPresetName(e.target.value)}
                placeholder="Save current as preset…"
                aria-label="New preset name"
              />
              <Button variant="outline" size="sm" onClick={saveCurrentAsPreset}>
                Save
              </Button>
            </div>
          </div>
          {cut.presetTarget === "audio-extract" && (
            <div className="space-y-2">
              <p className="text-[11px] leading-4 text-kumo-subtle">
                Audio-only pull — video format, quality and trim pacing are
                ignored; the trimmed range sets the audio length.
              </p>
              <Label>Audio format</Label>
              <Select
                value={cut.audioFormat}
                onValueChange={(value) =>
                  value &&
                  setCutState((previous) => ({
                    ...previous,
                    audioFormat: value as "mp3" | "wav",
                  }))
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="mp3">MP3</SelectItem>
                  <SelectItem value="wav">WAV</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          <Label>Output format</Label>
          <Select
            value={cut.exportFormat}
            onValueChange={(value) =>
              value &&
              setCutState((previous) => ({
                ...previous,
                exportFormat: value as typeof cut.exportFormat,
                presetTarget: "transcode",
              }))
            }
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="mp4">MP4</SelectItem>
              <SelectItem value="webm">WebM</SelectItem>
              <SelectItem value="mov">MOV</SelectItem>
              <SelectItem value="webm-tg">WebM Telegram (sticker)</SelectItem>
              <SelectItem value="gif">GIF preview</SelectItem>
            </SelectContent>
          </Select>
          {cut.exportFormat === "gif" && (
            <p className="text-[11px] leading-4 text-kumo-subtle">
              Silent GIF preview: scaled to 480px wide, no audio, custom
              framerate applies. Mobile layout and watermark are skipped.
            </p>
          )}
          <div className="space-y-2 pt-2">
            <Label>Filename</Label>
            <Input
              value={cut.exportFilename || basename}
              onChange={(event) =>
                setCutState((previous) => ({
                  ...previous,
                  exportFilename: event.target.value,
                }))
              }
              placeholder="output-file-name"
            />
          </div>
          {cut.exportFormat !== "mov" && cut.exportFormat !== "gif" && (
            <div className="flex flex-col space-y-2">
              <div className="flex items-center justify-between">
                <Label>
                  Quality CRF{" "}
                  <span className="text-[10px] -mx-1.5">(Lower is better)</span>
                </Label>
                <span className="text-xs text-kumo-subtle tabular-nums">
                  {cut.exportQuality}
                </span>
              </div>
              <Slider
                value={[cut.exportQuality]}
                min={0}
                max={60}
                step={1}
                onValueChange={(value) =>
                  setCutState((previous) => ({
                    ...previous,
                    exportQuality: readSliderValue(value),
                  }))
                }
                aria-label="Export quality crf"
              />
            </div>
          )}
          {cut.exportFormat !== "webm-tg" && (
            <>
              <Label>Framerate</Label>
              <Select
                value={String(cut.exportFps)}
                onValueChange={(value) =>
                  value &&
                  setCutState((previous) => ({
                    ...previous,
                    exportFps: Number(value),
                  }))
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="30">30 fps</SelectItem>
                  <SelectItem value="60">60 fps</SelectItem>
                </SelectContent>
              </Select>
            </>
          )}
          {cut.exportFormat !== "webm-tg" && (
            <>
              <Input
                type="number"
                min="1"
                placeholder="Custom fps"
                onChange={(event) =>
                  event.target.value &&
                  setCutState((previous) => ({
                    ...previous,
                    exportFps: Number(event.target.value),
                  }))
                }
              />
              <CustomArgsCollapsible
                value={cut.customFFmpegArgs}
                onChange={(customFFmpegArgs) =>
                  setCutState((previous) => ({ ...previous, customFFmpegArgs }))
                }
                hint="Most color, denoise, stabilize, flip and speed needs are covered by the Filters card above — use this only for advanced overrides."
              />
            </>
          )}
          <div className="flex items-center justify-between">
            <Label htmlFor="export-ignore-trim">Ignore trim</Label>
            <Switch
              id="export-ignore-trim"
              checked={cut.ignoreTrim}
              onCheckedChange={(ignoreTrim) =>
                setCutState((previous) => ({ ...previous, ignoreTrim }))
              }
            />
          </div>
          {cut.exportFormat !== "webm-tg" && (
            <>
              <div className="flex items-center justify-between">
                <Label htmlFor="export-watermark">Watermark</Label>
                <Switch
                  id="export-watermark"
                  checked={cut.watermark}
                  onCheckedChange={(watermark) =>
                    setCutState((previous) => ({ ...previous, watermark }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Audio tracks</Label>
                {audioTracks.length === 0 ? (
                  <p className="text-[11px] leading-4 text-kumo-subtle">
                    No audio tracks detected in this file.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {audioTracks.map((track) => (
                      <li
                        key={track.trackIndex}
                        className="flex items-center justify-between gap-2"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-xs font-medium">
                            Track {track.trackIndex + 1}
                            {track.title ? ` · ${track.title}` : ""}
                          </p>
                          <p className="truncate text-[11px] text-kumo-subtle">
                            {[
                              track.language,
                              track.codec,
                              `${track.channels}ch`,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </p>
                        </div>
                        <Switch
                          id={`export-audio-enabled-${track.trackIndex}`}
                          checked={track.enabled}
                          onCheckedChange={(enabled) =>
                            setAudioState((previous) => ({
                              ...previous,
                              tracks: previous.tracks.map((t) =>
                                t.trackIndex === track.trackIndex
                                  ? { ...t, enabled }
                                  : t,
                              ),
                            }))
                          }
                          aria-label={`Include track ${track.trackIndex + 1} in export`}
                        />
                      </li>
                    ))}
                  </ul>
                )}
                <p className="text-[11px] leading-4 text-kumo-subtle">
                  Same switches as Audio controls — disabled tracks are left out
                  of the export.
                </p>
              </div>
            </>
          )}
          {activeExport ? (
            <div className="space-y-1">
              <div
                className="flex items-center justify-between text-xs text-kumo-subtle"
                aria-live="polite"
              >
                <span>
                  {activeExport.status === "queued"
                    ? activeExport.queuePosition != null
                      ? `Queued #${activeExport.queuePosition + 1} — waiting for a worker…`
                      : "Queued — waiting for a worker…"
                    : activeExport.status === "uploading"
                      ? `Uploading export ${Math.round(activeExport.progress)}%`
                      : activeExport.status === "saving"
                        ? "Saving file…"
                        : `Exporting ${Math.round(activeExport.progress)}%`}
                </span>
                {activeExportsCount > 1 && (
                  <span className="tabular-nums">
                    {activeExportsCount} in queue
                  </span>
                )}
              </div>
              <Progress
                value={activeExport.progress}
                aria-label="Export progress"
              />
            </div>
          ) : null}
          {lastFailure?.error ? (
            <p className="text-xs text-red-600 wrap-break-word">
              {lastFailure.error}
            </p>
          ) : null}
          <SidebarPreflightSummary preflightResult={preflightResult} />
          <Button
            className="w-full"
            onClick={startExport}
            disabled={
              source.sourceWidth === 0 ||
              source.sourceHeight === 0 ||
              !preflightResult.ok
            }
          >
            {cut.presetTarget === "audio-extract"
              ? "Extract audio"
              : "Export video"}
          </Button>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
