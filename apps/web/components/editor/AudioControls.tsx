"use client";

import { useEffect } from "react";
import { useSelector } from "@tanstack/react-store";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
  audioStore,
  setAudioState,
  type AudioTrackState,
} from "@/store/audioSlice";
import { sourceStore } from "@/store/sourceSlice";
import { formatTime } from "@/lib/format-time";
import { API_BASE_URL } from "@/lib/api-client";
import { useAudioAnalysis } from "@/hooks/useAudioAnalysis";
import { AudioWaveform } from "./AudioWaveform";

function updateTrack(trackIndex: number, update: Partial<AudioTrackState>) {
  setAudioState((previous) => ({
    ...previous,
    tracks: previous.tracks.map((track) =>
      track.trackIndex === trackIndex ? { ...track, ...update } : track,
    ),
  }));
}

function TrackControls({
  track,
  file,
  duration,
  currentTime,
  trimRange,
}: {
  track: AudioTrackState;
  file: File;
  duration: number;
  currentTime: number;
  trimRange: [number, number];
}) {
  const addMuteSegment = () => {
    const start = Math.max(trimRange[0], Math.min(currentTime, trimRange[1]));
    const end = Math.min(trimRange[1], Math.max(start + 0.1, currentTime + 1));
    if (end > start)
      updateTrack(track.trackIndex, {
        muteSegments: [...track.muteSegments, { start, end }],
      });
  };
  const extract = async (format: "mp3" | "wav") => {
    const form = new FormData();
    form.append("file", file);
    const response = await fetch(
      `${API_BASE_URL}/api/audio/extract?format=${format}&track=${track.trackIndex}`,
      { method: "POST", body: form },
    );
    if (!response.ok) return;
    const url = URL.createObjectURL(await response.blob());
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${file.name.replace(/\.[^.]+$/, "")}-track-${track.trackIndex + 1}.${format}`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-3 rounded-md border border-kumo-line p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-xs font-medium">
            Track {track.trackIndex + 1}
            {track.title ? ` · ${track.title}` : ""}
          </p>
          <p className="text-[11px] text-kumo-subtle">
            {[
              track.language,
              track.codec,
              `${track.channels}ch`,
              `${Math.round(track.sampleRate / 1000)}kHz`,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <Label htmlFor={`audio-enabled-${track.trackIndex}`}>Include</Label>
          <Switch
            id={`audio-enabled-${track.trackIndex}`}
            checked={track.enabled}
            onCheckedChange={(enabled) =>
              updateTrack(track.trackIndex, { enabled })
            }
          />
        </div>
      </div>
      {/* Per-track details collapse with the Include switch: a disabled
          track shows only its header row, an enabled one the full controls. */}
      <Collapsible open={track.enabled}>
        <CollapsibleContent className="space-y-3">
          <div className="relative h-10 overflow-hidden rounded bg-kumo-recessed">
            <AudioWaveform
              file={file}
              trackIndex={track.trackIndex}
              duration={duration}
              currentTime={currentTime}
              trimRange={trimRange}
              muteSegments={track.muteSegments}
            />
          </div>
          <div className="space-y-2">
            <Label>Gain: {track.gainDb.toFixed(1)} dB</Label>
            <Slider
              min={-24}
              max={12}
              step={0.5}
              value={[track.gainDb]}
              onValueChange={(value) =>
                updateTrack(track.trackIndex, {
                  gainDb: Array.isArray(value)
                    ? Number(value[0] ?? 0)
                    : Number(value),
                })
              }
            />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor={`audio-normalize-${track.trackIndex}`}>
              Normalize to -14 LUFS
            </Label>
            <Switch
              id={`audio-normalize-${track.trackIndex}`}
              checked={track.loudnormEnabled}
              onCheckedChange={(loudnormEnabled) =>
                updateTrack(track.trackIndex, { loudnormEnabled })
              }
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Label className="space-y-1 text-xs">
              Fade in (s)
              <Input
                type="number"
                min={0}
                max={60}
                step={0.1}
                value={track.fadeInSeconds}
                onChange={(event) =>
                  updateTrack(track.trackIndex, {
                    fadeInSeconds: Math.max(0, Number(event.target.value) || 0),
                  })
                }
              />
            </Label>
            <Label className="space-y-1 text-xs">
              Fade out (s)
              <Input
                type="number"
                min={0}
                max={60}
                step={0.1}
                value={track.fadeOutSeconds}
                onChange={(event) =>
                  updateTrack(track.trackIndex, {
                    fadeOutSeconds: Math.max(
                      0,
                      Number(event.target.value) || 0,
                    ),
                  })
                }
              />
            </Label>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addMuteSegment}
            >
              Mute from playhead
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => extract("mp3")}
            >
              Extract MP3
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => extract("wav")}
            >
              Extract WAV
            </Button>
          </div>
          {track.muteSegments.length > 0 && (
            <div className="space-y-1 text-xs text-kumo-subtle">
              {track.muteSegments.map((segment, index) => (
                <div
                  className="flex items-center justify-between"
                  key={`${segment.start}-${segment.end}-${index}`}
                >
                  <span>
                    Mute {formatTime(segment.start)} - {formatTime(segment.end)}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      updateTrack(track.trackIndex, {
                        muteSegments: track.muteSegments.filter(
                          (_, i) => i !== index,
                        ),
                      })
                    }
                  >
                    Remove
                  </Button>
                </div>
              ))}
            </div>
          )}
          {track.loudness &&
            Number.isFinite(track.loudness.inputIntegratedLufs) &&
            Number.isFinite(track.loudness.inputTruePeak) && (
              <p className="text-[11px] text-kumo-subtle">
                Measured: {track.loudness.inputIntegratedLufs.toFixed(1)} LUFS ·{" "}
                {track.loudness.inputTruePeak.toFixed(1)} dBTP
              </p>
            )}
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

export function AudioControls() {
  const audio = useSelector(audioStore);
  const source = useSelector(sourceStore);
  const { currentTime, trimRange, duration } = source;
  const file = source.file;
  const { data } = useAudioAnalysis(file, 0);

  useEffect(() => {
    setAudioState((previous) => ({ ...previous, tracks: [] }));
  }, [file]);

  useEffect(() => {
    if (!data) return;
    setAudioState((previous) => {
      const existing = new Map(
        previous.tracks.map((track) => [track.trackIndex, track]),
      );
      return {
        ...previous,
        tracks: data.tracks.map((track) => ({
          ...track,
          enabled: existing.get(track.trackIndex)?.enabled ?? true,
          gainDb: existing.get(track.trackIndex)?.gainDb ?? 0,
          loudnormEnabled:
            existing.get(track.trackIndex)?.loudnormEnabled ?? false,
          loudnormTargetLufs:
            existing.get(track.trackIndex)?.loudnormTargetLufs ?? -14,
          fadeInSeconds: existing.get(track.trackIndex)?.fadeInSeconds ?? 0,
          fadeOutSeconds: existing.get(track.trackIndex)?.fadeOutSeconds ?? 0,
          muteSegments: existing.get(track.trackIndex)?.muteSegments ?? [],
          waveform: existing.get(track.trackIndex)?.waveform ?? null,
          loudness: existing.get(track.trackIndex)?.loudness ?? null,
        })),
      };
    });
  }, [data]);

  if (!file) return null;
  return (
    <Card className="overflow-hidden">
      <Collapsible defaultOpen>
        <CardHeader className="py-3">
          <CollapsibleTrigger className="flex w-full items-center justify-between text-sm font-semibold tracking-normal">
            <span>
              Audio Controls
              <span className="ml-1.5 font-mono text-[11px] font-normal tabular-nums text-kumo-subtle">
                {audio.tracks.length === 0
                  ? "analyzing…"
                  : `${audio.tracks.length} track${audio.tracks.length === 1 ? "" : "s"}`}
              </span>
            </span>
            <ChevronDown className="size-4 text-kumo-subtle" />
          </CollapsibleTrigger>
        </CardHeader>
        <CollapsibleContent>
          <CardContent className="space-y-3">
            {audio.tracks.length === 0 ? (
              <p className="text-xs text-kumo-subtle">
                Analyzing embedded audio tracks...
              </p>
            ) : (
              audio.tracks.map((track) => (
                <TrackControls
                  key={track.trackIndex}
                  track={track}
                  file={file}
                  duration={duration}
                  currentTime={currentTime}
                  trimRange={trimRange}
                />
              ))
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
