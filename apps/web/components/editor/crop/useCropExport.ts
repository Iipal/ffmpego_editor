"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useSelector } from "@tanstack/react-store";
import { sourceStore } from "@/store/sourceSlice";
import { cropStore } from "@/store/cropSlice";
import { cutStore, setCutState } from "@/store/cutSlice";
import { audioStore, getAudioRenderSettings } from "@/store/audioSlice";
import { filterStore, setFilterState } from "@/store/filterSlice";
import { exportQueue } from "@/lib/export-queue";
import { exportQueueStore, isQueueItemActive } from "@/store/exportQueueSlice";
import { exportPresets, type ExportPreset } from "@/lib/export-presets";
import { preflight } from "@/lib/preflight";
import { validateSettings } from "@/lib/validate-settings";
import { uploadChunked } from "@/lib/upload-chunked";
import { saveBlobFile } from "@/lib/save-blob-file";
import { trackHistoryEntry } from "@/store/exportHistorySlice";
import { openComparison } from "@/store/compareSlice";
import { videoFileService } from "@/lib/video-file";
import { isVisualFiltersDefault } from "@repo/ffmpeg-filters";

/**
 * Export-side logic extracted from the crop `Sidebar` god file: presets,
 * preflight gate, queue status, audio extract + video export.
 * Each consumer subscribes only to the slices it renders; the crop rect is
 * read imperatively at click time so canvas drags never re-render the form.
 */
export function useCropExport() {
  const source = useSelector(sourceStore);
  const cut = useSelector(cutStore);
  const audio = useSelector(audioStore);
  const visualFilters = useSelector(filterStore);
  const queueItems = useSelector(exportQueueStore).items;

  const basename = source.file
    ? videoFileService.stripExtension(source.file.name)
    : "";

  const editorQueueItems = useMemo(
    () =>
      queueItems.filter((i) => i.kind === "crop" || i.kind === "audio-extract"),
    [queueItems],
  );
  const activeExports = useMemo(
    () => editorQueueItems.filter(isQueueItemActive),
    [editorQueueItems],
  );
  const activeExport = activeExports[0] ?? null;
  const lastFailure = useMemo(
    () => editorQueueItems.find((i) => i.status === "failed") ?? null,
    [editorQueueItems],
  );

  // Named presets (builtins + localStorage customs) + preflight gate.
  const [presetId, setPresetId] = useState("");
  const [customPresetName, setCustomPresetName] = useState("");
  const [presetsTick, setPresetsTick] = useState(0);
  const presets = useMemo(() => {
    void presetsTick;
    return exportPresets.all();
  }, [presetsTick]);
  const selectedPreset = presets.find((p) => p.id === presetId);

  const preflightResult = preflight.check({
    hasFile: !!source.file,
    sourceWidth: source.sourceWidth,
    sourceHeight: source.sourceHeight,
    duration: source.duration,
    trimRange: source.trimRange,
    ignoreTrim: cut.ignoreTrim,
    exportFormat: cut.exportFormat,
    exportFps: cut.exportFps,
    exportSpeed: cut.exportSpeed,
    watermark: cut.watermark,
    hasMobileLayout: false,
    presetTarget: cut.presetTarget,
    bitrateKbps: source.bitrateKbps,
  });

  const gatePreflight = async (): Promise<boolean> => {
    const errors = preflightResult.issues.filter((i) => i.level === "error");
    if (errors.length) {
      toast.error("Export blocked by preflight.", {
        description: errors.map((i) => i.message).join("\n"),
      });
      return false;
    }
    const conn = await preflight.probeApiConnectivity();
    if (conn) {
      toast.error("Export blocked.", { description: conn });
      return false;
    }
    return true;
  };

  const applyPreset = (id: string) => {
    setPresetId(id);
    const preset = presets.find((p) => p.id === id);
    if (!preset) return;
    const patch = exportPresets.toPatch(preset, cut.exportFilename, basename);
    // Preset keys are cut-slice fields, except visualFilters which lives in
    // filterStore (update() in the old Sidebar routed the same way by key set).
    const { visualFilters: nextFilters, ...cutPatch } = patch;
    setCutState((previous) => ({ ...previous, ...cutPatch }));
    if (nextFilters) {
      setFilterState(() => structuredClone(nextFilters));
    }
    toast.success(`Preset applied: ${preset.name}`, {
      description:
        preset.target === "audio-extract"
          ? "Audio-only pull — video settings are ignored."
          : "Review the export fields, then Export.",
    });
  };

  const saveCurrentAsPreset = () => {
    const name = customPresetName.trim();
    if (!name) {
      toast.error("Name the preset before saving.");
      return;
    }
    const preset: ExportPreset = {
      version: 1,
      id: exportPresets.newCustomId(),
      name,
      target: cut.presetTarget,
      settings:
        cut.presetTarget === "audio-extract"
          ? {}
          : {
              exportFormat: cut.exportFormat,
              exportFps: cut.exportFps,
              exportQuality: cut.exportQuality,
              exportSpeed: cut.exportSpeed,
              watermark: cut.watermark,
              customFFmpegArgs: cut.customFFmpegArgs || undefined,
              ignoreTrim: cut.ignoreTrim || undefined,
              visualFilters: isVisualFiltersDefault(visualFilters)
                ? undefined
                : structuredClone(visualFilters),
            },
      ...(cut.presetTarget === "audio-extract"
        ? { audioFormat: cut.audioFormat }
        : {}),
    };
    exportPresets.save(preset);
    setPresetsTick((t) => t + 1);
    setPresetId(preset.id);
    setCustomPresetName("");
    toast.success(`Preset saved: ${name}`);
  };

  const deleteSelectedPreset = () => {
    if (!selectedPreset || exportPresets.isBuiltin(selectedPreset.id)) return;
    exportPresets.remove(selectedPreset.id);
    setPresetsTick((t) => t + 1);
    setPresetId("");
    toast.success(`Preset deleted: ${selectedPreset.name}`);
  };

  const startAudioExtract = () => {
    const file = source.file;
    if (!file) return;
    const name = `${cut.exportFilename || basename || "audio"}.${cut.audioFormat}`;
    const audioFormat = cut.audioFormat;
    const sourceUrl = source.mediaUrl;
    exportQueue.enqueue({
      kind: "audio-extract",
      endpoint: `/api/audio/extract?format=${audioFormat}`,
      file,
      label: name,
      async run(report) {
        report({ status: "processing", progress: 50 });
        // Large files reuse the shared chunked session (uploaded once for
        // analysis/preview); small files keep the direct FormData path.
        return uploadChunked.postBlob(
          `/api/audio/extract?format=${audioFormat}`,
          file,
        );
      },
      async onFinish({ blob }) {
        const saved = await saveBlobFile.save(blob, name);
        trackHistoryEntry({
          jobId: `extract-${Date.now()}`,
          endpoint: "/api/audio/extract",
          kind: "audio-extract",
          label: saved,
          createdAt: Date.now(),
          audioFormat,
        });
        openComparison({
          title: saved,
          sourceUrl,
          outputUrl: URL.createObjectURL(blob),
          outputKind: "audio",
          meta: "Audio-only pull",
        });
      },
    });
  };

  const startExport = async () => {
    const src = sourceStore.state;
    const crp = cropStore.state;
    const ct = cutStore.state;
    const aud = audioStore.state;
    const filters = filterStore.state;
    if (!src.file) return;
    if (ct.presetTarget === "audio-extract") {
      startAudioExtract();
      return;
    }
    if (!(await gatePreflight())) return;

    const settings = {
      crop: crp.crop,
      visualFilters: isVisualFiltersDefault(filters)
        ? undefined
        : structuredClone(filters),
      customFFmpegArgs: ct.customFFmpegArgs,
      exportFormat: ct.exportFormat,
      exportFps: ct.exportFps,
      exportFilename: ct.exportFilename,
      exportQuality: ct.exportQuality,
      exportSpeed: ct.exportSpeed,
      sourceHeight: src.sourceHeight,
      sourceWidth: src.sourceWidth,
      trimRange: src.trimRange,
      watermark: ct.watermark,
      ignoreTrim: ct.ignoreTrim,
      audioTrackIndex: ct.audioTrackIndex,
      audioTracks: aud.tracks.length
        ? getAudioRenderSettings(aud.tracks)
        : undefined,
    };
    // Fail fast on malformed settings (same schemas the API enforces)
    // before spending upload bytes.
    validateSettings.assertGeneric(JSON.stringify(settings));
    const base = src.file ? videoFileService.stripExtension(src.file.name) : "";
    const ext = ct.exportFormat === "webm-tg" ? "webm" : ct.exportFormat;
    const label = `${ct.exportFilename || base || "export"}.${ext}`;
    exportQueue.enqueue({
      kind: "crop",
      endpoint: "/api/transcode",
      file: src.file,
      settingsJson: JSON.stringify(settings),
      label,
      meta: "Export complete",
    });
  };

  return {
    source,
    cut,
    audioTracks: audio.tracks,
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
    startAudioExtract,
    activeExport,
    activeExportsCount: activeExports.length,
    lastFailure,
  };
}
