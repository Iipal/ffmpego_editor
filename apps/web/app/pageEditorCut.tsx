"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Film, Plus, Scissors, Trash2, Upload } from "lucide-react";
import { useVideoState, useVideoStore } from "@/store/useVideoStore";
import { useVideoMetadataMutation } from "@/hooks/useVideoMetadata";
import { MobilePreviewShared } from "@/components/editor/MobilePreviewShared";
import { VideoUploader } from "@/components/editor/VideoUploader";
import { UploadProgress } from "@/components/editor/UploadProgress";
import {
  ACCEPTED_VIDEO_INPUT_ATTR,
  isAcceptedVideoFile,
  isFileTooLarge,
  formatFileSize,
  MAX_UPLOAD_BYTES,
} from "@/lib/video-file";
import { formatTime } from "@/lib/format-time";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  clamp,
  createDefaultLayout,
  loadPrefForMode,
  MIN_SPLIT,
  MAX_SPLIT,
  OUTPUT_W,
  OUTPUT_H,
} from "@/lib/mobile-layout";
import type { MobileLayout, CropZone } from "@/lib/mobile-layout";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CutMode = "full-size" | "2-stack" | "1-stack";

interface Cut {
  id: string;
  start: number;
  end: number;
}

function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function sortCuts(cuts: Cut[]): Cut[] {
  return [...cuts].sort((a, b) => a.start - b.start);
}

function cutsOverlap(cuts: Cut[]): Cut[] {
  const sorted = sortCuts(cuts);
  const bad = new Set<string>();
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].start < sorted[i - 1].end - 0.001) {
      bad.add(sorted[i].id);
      bad.add(sorted[i - 1].id);
    }
  }
  return cuts.filter((c) => bad.has(c.id));
}

function totalDuration(cuts: Cut[]): number {
  return cuts.reduce((a, c) => a + Math.max(0, c.end - c.start), 0);
}

// ---------------------------------------------------------------------------
// UploadOtherButton
// ---------------------------------------------------------------------------

const UploadOtherButton = memo(function UploadOtherButton() {
  const inputRef = useRef<HTMLInputElement>(null);
  const videoStore = useVideoStore();
  const metadataMutation = useVideoMetadataMutation();

  const onPick = useCallback(
    (file: File | undefined) => {
      if (!file) return;
      if (!isAcceptedVideoFile(file)) {
        toast.error("Unsupported format. Use MP4/WebM/MOV/MKV (Matroska)");
        return;
      }
      if (isFileTooLarge(file)) {
        toast.error(
          `File too large (${formatFileSize(file.size)}). Max ${formatFileSize(MAX_UPLOAD_BYTES)}.`,
        );
        return;
      }
      const mediaUrl = URL.createObjectURL(file);
      videoStore.setState((prev) => {
        if (prev.mediaUrl) URL.revokeObjectURL(prev.mediaUrl);
        return {
          ...prev,
          file,
          mediaUrl,
          currentTime: 0,
          duration: 0,
          isPlaying: false,
          sourceWidth: 0,
          sourceHeight: 0,
          transcodeStatus: "idle",
          transcodeProgress: 0,
          transcodeOutputPath: null,
          transcodeError: null,
        };
      });
      metadataMutation.mutate(file);
    },
    [videoStore, metadataMutation],
  );

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_VIDEO_INPUT_ATTR}
        className="hidden"
        tabIndex={-1}
        onChange={(e) => {
          onPick(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <Button
        size="sm"
        variant="secondary"
        onClick={() => inputRef.current?.click()}
        className="h-7 gap-1.5 rounded-md text-xs font-medium"
      >
        <Upload className="size-3.5" aria-hidden />
        Upload other video
      </Button>
    </>
  );
});

// ---------------------------------------------------------------------------
// Cut block on timeline (drag to move, handles to resize by video-length)
// ---------------------------------------------------------------------------

type CutBlockProps = {
  cut: Cut;
  index: number;
  duration: number;
  isSelected: boolean;
  hasOverlap: boolean;
  onSelect: (id: string) => void;
  onChange: (id: string, next: Cut) => void;
};

const CutBlock = memo(function CutBlock({
  cut,
  index,
  duration,
  isSelected,
  hasOverlap,
  onSelect,
  onChange,
}: CutBlockProps) {
  const left = duration > 0 ? (cut.start / duration) * 100 : 0;
  const width =
    duration > 0 ? Math.max(1.5, ((cut.end - cut.start) / duration) * 100) : 0;

  const dragState = useRef<{
    kind: "move" | "l" | "r";
    startX: number;
    orig: Cut;
    trackW: number;
  } | null>(null);

  const onPointerDown = useCallback(
    (kind: "move" | "l" | "r") => (e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      onSelect(cut.id);
      const track = (e.currentTarget as HTMLElement).closest(
        "[data-cut-track]",
      ) as HTMLElement | null;
      const trackW = track?.getBoundingClientRect().width ?? 1;
      dragState.current = {
        kind,
        startX: e.clientX,
        orig: { ...cut },
        trackW,
      };
      const move = (ev: PointerEvent) => {
        const st = dragState.current;
        if (!st) return;
        const dt = ((ev.clientX - st.startX) / st.trackW) * duration;
        const o = st.orig;
        const minLen = 0.2;
        if (st.kind === "l") {
          const ns = clamp(o.start + dt, 0, o.end - minLen);
          onChange(cut.id, { ...o, start: Math.round(ns * 100) / 100 });
        } else if (st.kind === "r") {
          const ne = clamp(o.end + dt, o.start + minLen, duration);
          onChange(cut.id, { ...o, end: Math.round(ne * 100) / 100 });
        } else {
          const len = o.end - o.start;
          const ns = clamp(o.start + dt, 0, Math.max(0, duration - len));
          onChange(cut.id, {
            ...o,
            start: Math.round(ns * 100) / 100,
            end: Math.round((ns + len) * 100) / 100,
          });
        }
      };
      const up = () => {
        dragState.current = null;
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    },
    [cut, duration, onChange, onSelect],
  );

  return (
    <div
      onPointerDown={onPointerDown("move")}
      onClick={() => onSelect(cut.id)}
      role="button"
      tabIndex={0}
      aria-label={`Cut ${index + 1} ${formatTime(cut.start)} to ${formatTime(cut.end)}`}
      className={cn(
        "absolute top-1 bottom-1 flex cursor-grab items-stretch overflow-hidden rounded-md border text-[10px] font-medium tabular-nums select-none touch-none active:cursor-grabbing",
        isSelected
          ? "border-kumo-brand bg-kumo-brand/15 shadow-[0_0_0_1px_var(--kumo-brand)]"
          : "border-kumo-line bg-kumo-brand/8 hover:bg-kumo-brand/12",
        hasOverlap && "border-kumo-warn bg-kumo-warn/10",
      )}
      style={{ left: `${left}%`, width: `${width}%` }}
    >
      <div
        onPointerDown={onPointerDown("l")}
        className="w-2 shrink-0 cursor-ew-resize bg-kumo-brand/25 hover:bg-kumo-brand/50"
        aria-hidden
      />
      <span className="flex flex-1 items-center justify-center truncate px-1 text-kumo-strong">
        C{index + 1} · {(cut.end - cut.start).toFixed(1)}s
      </span>
      <div
        onPointerDown={onPointerDown("r")}
        className="w-2 shrink-0 cursor-ew-resize bg-kumo-brand/25 hover:bg-kumo-brand/50"
        aria-hidden
      />
    </div>
  );
});

// ---------------------------------------------------------------------------
// Zone sliders (compact editor for stack modes, synced from Mobile editor)
// ---------------------------------------------------------------------------

function ZoneSliders({
  zone,
  onChange,
}: {
  zone: CropZone;
  onChange: (z: CropZone) => void;
}) {
  const num = (v: number, min: number, max: number) =>
    clamp(Math.round(v * 1000) / 1000, min, max);
  return (
    <div className="grid grid-cols-2 gap-2">
      {(
        [
          ["x", 0, 0.9],
          ["y", 0, 0.9],
          ["width", 0.05, 1],
          ["height", 0.05, 1],
        ] as const
      ).map(([key, min, max]) => (
        <div key={key} className="space-y-1">
          <Label className="font-mono text-[10px] tabular-nums text-kumo-subtle">
            {key} {(zone[key] as number).toFixed(2)}
          </Label>
          <Slider
            value={[zone[key] as number]}
            min={min}
            max={max}
            step={0.01}
            onValueChange={(v) => {
              const val = Array.isArray(v) ? (v[0] as number) : (v as number);
              onChange({ ...zone, [key]: num(val, min, max) });
            }}
          />
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function CutEditorPage() {
  const { file, mediaUrl, uploadStatus } = useVideoState() as unknown as {
    file: File | null;
    mediaUrl: string | null;
    uploadStatus: string;
  };
  const {
    duration: srcDuration,
    sourceWidth,
    sourceHeight,
  } = useVideoState() as unknown as {
    duration: number;
    sourceWidth: number;
    sourceHeight: number;
  };
  const videoStore = useVideoStore();
  const videoRef = useRef<HTMLVideoElement>(null);

  const [mode, setMode] = useState<CutMode>("full-size");
  const [stackedLayout, setStackedLayout] = useState<MobileLayout>(
    () => loadPrefForMode("stacked") ?? createDefaultLayout("stacked", 0.5),
  );
  const [singleLayout, setSingleLayout] = useState<MobileLayout>(
    () => loadPrefForMode("full") ?? createDefaultLayout("full", 0.5),
  );
  const [watermarkStack, setWatermarkStack] = useState(true);
  const [watermarkSingle, setWatermarkSingle] = useState(true);

  const [cuts, setCuts] = useState<Cut[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playAll, setPlayAll] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportName, setExportName] = useState("");
  const [volume, setVolume] = useState(1);

  const duration = srcDuration || 0;
  const hasVideo = !!mediaUrl && !!file;

  const sorted = useMemo(() => sortCuts(cuts), [cuts]);
  const overlapIds = useMemo(
    () => new Set(cutsOverlap(cuts).map((c) => c.id)),
    [cuts],
  );
  const outDuration = useMemo(() => totalDuration(cuts), [cuts]);
  const selected = cuts.find((c) => c.id === selectedId) ?? null;

  const activeLayout: MobileLayout | null =
    mode === "2-stack"
      ? stackedLayout
      : mode === "1-stack"
        ? singleLayout
        : null;
  const activeWatermark = mode === "2-stack" ? watermarkStack : watermarkSingle;

  // Keep video element in sync: time updates, play-all-cuts preview jumping
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onTime = () => {
      setCurrentTime(v.currentTime);
      if (playAll && sorted.length > 0) {
        const idx = sorted.findIndex(
          (c) =>
            v.currentTime >= c.start - 0.05 && v.currentTime < c.end - 0.02,
        );
        if (idx === -1) {
          const next = sorted.find((c) => c.start > v.currentTime + 0.02);
          if (next) v.currentTime = next.start;
          else {
            setPlayAll(false);
            v.pause();
          }
        }
      }
    };
    const onPlay = () => setIsPlaying(true);
    const onPause = () => {
      setIsPlaying(false);
      setPlayAll(false);
    };
    const onMeta = () => {
      const d = v.duration;
      if (Number.isFinite(d)) {
        videoStore.setState((prev) =>
          prev.duration !== d
            ? ({ ...prev, duration: d } as typeof prev)
            : prev,
        );
      }
    };
    v.addEventListener("timeupdate", onTime);
    v.addEventListener("seeked", onTime);
    v.addEventListener("play", onPlay);
    v.addEventListener("pause", onPause);
    v.addEventListener("loadedmetadata", onMeta);
    return () => {
      v.removeEventListener("timeupdate", onTime);
      v.removeEventListener("seeked", onTime);
      v.removeEventListener("play", onPlay);
      v.removeEventListener("pause", onPause);
      v.removeEventListener("loadedmetadata", onMeta);
    };
  }, [mediaUrl, playAll, sorted, videoStore]);

  useEffect(() => {
    if (videoRef.current) videoRef.current.volume = volume;
  }, [volume]);

  const seekTo = useCallback(
    (t: number) => {
      const v = videoRef.current;
      if (!v) return;
      v.currentTime = clamp(t, 0, Math.max(0.01, v.duration || duration || 0));
    },
    [duration],
  );

  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (isPlaying) v.pause();
    else v.play().catch(() => {});
  }, [isPlaying]);

  const playCut = useCallback(
    (cut: Cut) => {
      setPlayAll(false);
      seekTo(cut.start + 0.01);
      videoRef.current?.play().catch(() => {});
    },
    [seekTo],
  );

  const playAllCuts = useCallback(() => {
    if (sorted.length === 0) {
      toast.error("Add at least one cut first");
      return;
    }
    setPlayAll(true);
    seekTo(sorted[0].start + 0.01);
    videoRef.current?.play().catch(() => {});
  }, [sorted, seekTo]);

  const patchCut = useCallback((id: string, next: Cut) => {
    setCuts((prev) => prev.map((c) => (c.id === id ? next : c)));
  }, []);

  const addCut = useCallback(() => {
    if (!duration) {
      toast.error("Video duration unknown yet");
      return;
    }
    const t = clamp(currentTime, 0, Math.max(0, duration - 0.3));
    const end = clamp(t + 2, t + 0.2, duration);
    if (end - t < 0.2) {
      toast.error("Not enough room at playhead");
      return;
    }
    const cut: Cut = {
      id: newId(),
      start: Math.round(t * 100) / 100,
      end: Math.round(end * 100) / 100,
    };
    setCuts((prev) => [...prev, cut]);
    setSelectedId(cut.id);
    seekTo(cut.start);
  }, [currentTime, duration, seekTo]);

  const deleteSelected = useCallback(() => {
    if (!selectedId) return;
    setCuts((prev) => prev.filter((c) => c.id !== selectedId));
    setSelectedId(null);
  }, [selectedId]);

  const syncFromMobile = useCallback(() => {
    const s = loadPrefForMode("stacked");
    const f = loadPrefForMode("full");
    if (s) setStackedLayout(s);
    if (f) setSingleLayout(f);
    toast.success("Zones synced from Mobile editor");
  }, []);

  const updateZone = useCallback(
    (layout: "stacked" | "full", id: string, z: CropZone) => {
      if (layout === "stacked") {
        setStackedLayout((prev) => ({
          ...prev,
          zones: prev.zones.map((zz) => (zz.id === id ? z : zz)),
        }));
      } else {
        setSingleLayout((prev) => ({
          ...prev,
          zones: prev.zones.map((zz) => (zz.id === id ? z : zz)),
        }));
      }
    },
    [],
  );

  const onExport = useCallback(async () => {
    if (!file) {
      toast.error("No video loaded");
      return;
    }
    if (cuts.length === 0) {
      toast.error("Add at least one cut");
      return;
    }
    if (overlapIds.size > 0) {
      toast.error("Cuts overlap — resize them first");
      return;
    }
    const sw = sourceWidth || 1920;
    const sh = sourceHeight || 1080;
    const base =
      (exportName.trim() || file.name.replace(/\.[^.]+$/, "") || "cut") +
      (mode === "full-size"
        ? "_cut"
        : mode === "2-stack"
          ? "_cut_1080x1920"
          : "_cut_1zone_1080x1920");
    const outName = `${base}.mp4`;

    const settingsJson = JSON.stringify({
      mode,
      cuts: sortCuts(cuts).map((c) => ({ start: c.start, end: c.end })),
      sourceWidth: sw,
      sourceHeight: sh,
      exportFilename: base,
      exportFps: 60,
      exportQuality: 10,
      exportSpeed: 1,
      customFFmpegArgs: "",
      watermark: mode === "full-size" ? false : activeWatermark,
      splitRatio: mode === "2-stack" ? stackedLayout.splitRatio : undefined,
      zones:
        mode === "full-size"
          ? undefined
          : mode === "2-stack"
            ? stackedLayout.zones
            : singleLayout.zones,
    });

    setIsExporting(true);
    toast.loading(`Exporting ${cuts.length} cut(s)…`, { id: "cut-export" });
    try {
      const [{ API_BASE_URL }, chunkedMod] = await Promise.all([
        import("@/lib/api-client"),
        import("@/lib/upload-chunked"),
      ]);
      const { shouldUseChunked, uploadFileChunked, uploadFormWithProgress } =
        chunkedMod;
      const vs = videoStore;
      const setUpload = (sent: number, total: number) =>
        vs.setState((p) => ({
          ...p,
          uploadStage: "transcode",
          uploadStatus: "uploading",
          uploadProgress: total ? Math.round((sent / total) * 100) : 0,
          uploadBytesSent: sent,
          uploadBytesTotal: total,
        }));
      vs.setState((p) => ({
        ...p,
        uploadStage: "transcode",
        uploadStatus: "uploading",
        uploadProgress: 0,
        uploadBytesSent: 0,
        uploadBytesTotal: file.size,
      }));

      let res: Response;
      if (shouldUseChunked(file)) {
        const { uploadId } = await uploadFileChunked(file, {
          onProgress: setUpload,
        });
        setUpload(file.size, file.size);
        const fd2 = new FormData();
        fd2.append("settings", settingsJson);
        res = await fetch(`${API_BASE_URL}/api/transcode/cut`, {
          method: "POST",
          headers: { "x-upload-id": uploadId },
          body: fd2,
        });
      } else {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("settings", settingsJson);
        const json = await uploadFormWithProgress<{
          jobId: string;
          progressUrl: string;
        }>("/api/transcode/cut", fd, { onUploadProgress: setUpload });
        res = new Response(JSON.stringify(json), { status: 200 });
      }
      vs.setState((p) => ({ ...p, uploadProgress: 100, uploadStatus: "done" }));
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(payload?.error ?? `Export failed: ${res.status}`);
      }
      const j = (await res.json()) as { jobId: string; progressUrl: string };
      const progressUrl = new URL(j.progressUrl, API_BASE_URL).toString();
      await new Promise<void>((resolve, reject) => {
        const source = new EventSource(progressUrl);
        source.onmessage = (event) => {
          try {
            const p = JSON.parse(event.data) as {
              status: string;
              progress: number;
              error?: string;
            };
            if (p.status === "processing") {
              toast.loading(`Exporting cuts… ${Math.round(p.progress)}%`, {
                id: "cut-export",
              });
            }
            if (p.status === "completed") {
              source.close();
              resolve();
            }
            if (p.status === "failed") {
              source.close();
              reject(new Error(p.error ?? "Export failed"));
            }
          } catch {}
        };
        source.onerror = () => {
          source.close();
          reject(new Error("Lost connection to export progress"));
        };
      });
      toast.loading("Downloading file…", { id: "cut-export" });
      const dl = await fetch(
        `${API_BASE_URL}/api/transcode/download/${j.jobId}`,
      );
      if (!dl.ok) throw new Error(`Download failed: ${dl.status}`);
      const blob = await dl.blob();
      if ("showSaveFilePicker" in window) {
        try {
          const handle = await (
            window as unknown as {
              showSaveFilePicker: (o: {
                suggestedName?: string;
                types?: Array<{
                  description?: string;
                  accept: Record<string, string[]>;
                }>;
              }) => Promise<{
                createWritable: () => Promise<{
                  write: (b: Blob) => Promise<void>;
                  close: () => Promise<void>;
                }>;
                name: string;
              }>;
            }
          ).showSaveFilePicker({
            suggestedName: outName,
            types: [
              { description: "MP4 video", accept: { "video/mp4": [".mp4"] } },
            ],
          });
          const w = await handle.createWritable();
          await w.write(blob);
          await w.close();
          toast.success("Cuts video saved", {
            id: "cut-export",
            description: handle.name,
          });
          return;
        } catch (e) {
          if ((e as DOMException)?.name === "AbortError") {
            toast.dismiss("cut-export");
            return;
          }
        }
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = outName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      toast.success("Cuts video saved", {
        id: "cut-export",
        description: outName,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Export failed";
      toast.error(msg, { id: "cut-export" });
      videoStore.setState((p) => ({ ...p, uploadStatus: "error" }));
    } finally {
      setIsExporting(false);
    }
  }, [
    file,
    cuts,
    overlapIds,
    sourceWidth,
    sourceHeight,
    exportName,
    mode,
    activeWatermark,
    stackedLayout,
    singleLayout,
    videoStore,
  ]);

  if (!hasVideo) {
    return (
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-1.5">
          <h2 className="text-base font-semibold leading-none tracking-normal">
            Cut editor
          </h2>
          <p className="max-w-prose text-sm leading-5 text-kumo-subtle">
            Cut multiple parts of the video and render them as one file.
            Full-size keeps the original resolution, or reframe to 9:16 with the
            Mobile zones.
          </p>
        </div>
        <Card className="p-6 sm:p-8">
          <CardContent className="p-0">
            <VideoUploader />
            <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-kumo-hairline pt-4 text-xs text-kumo-subtle">
              <span className="inline-flex items-center gap-1.5 font-mono text-[11px] tabular-nums">
                <span
                  className="size-1.5 rounded-full bg-kumo-success"
                  aria-hidden
                />
                Local only
              </span>
              <span aria-hidden className="text-kumo-hairline">
                ·
              </span>
              <span>MP4 · WebM · MOV · MKV up to 10 GB</span>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const fileName = file?.name ?? "";
  const modeBadge =
    mode === "full-size"
      ? `Full-size ${sourceWidth || "—"}×${sourceHeight || "—"}`
      : mode === "2-stack"
        ? "9:16 2-Stack 1080×1920"
        : "9:16 1-Zone 1080×1920";

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-kumo-hairline pb-4">
        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold leading-none tracking-normal">
              Cut editor
            </h2>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-kumo-hairline bg-kumo-recessed px-2 py-0.5 text-[11px] font-medium leading-none text-kumo-subtle">
              <Scissors className="size-3" aria-hidden />
              {modeBadge}
              <span aria-hidden className="opacity-40">
                ·
              </span>
              <span className="tabular-nums">
                {cuts.length} cut(s) · {formatTime(outDuration)}
              </span>
            </span>
          </div>
          <p className="flex flex-wrap items-center gap-1.5 text-xs leading-4 text-kumo-subtle">
            <span
              className="min-w-0 max-w-64 truncate font-mono text-[11px] tabular-nums"
              title={fileName}
            >
              {fileName || "untitled"}
            </span>
            <span aria-hidden className="text-kumo-hairline">
              ·
            </span>
            <span className="tabular-nums">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-1.5 justify-end">
          <UploadOtherButton />
          <span aria-hidden className="h-5 w-px bg-kumo-hairline mx-0.5" />
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              setCuts([]);
              setSelectedId(null);
            }}
            className="h-7 rounded-md text-xs"
          >
            Clear cuts
          </Button>
          <Button
            size="sm"
            onClick={onExport}
            disabled={cuts.length === 0 || overlapIds.size > 0 || isExporting}
            className="h-7 rounded-md text-xs font-medium"
          >
            <Film className="size-3.5" aria-hidden />
            {isExporting ? "Exporting…" : `Export ${cuts.length} cut(s)`}
          </Button>
        </div>
      </header>

      {uploadStatus === "uploading" || uploadStatus === "error" ? (
        <div className="rounded-md border border-kumo-hairline bg-kumo-recessed p-3">
          <UploadProgress />
        </div>
      ) : null}

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.6fr)_340px]">
        <div className="flex flex-col gap-4">
          <Card className="overflow-hidden">
            <CardHeader className="py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle className="text-sm font-semibold tracking-normal">
                  Preview
                  <span className="ml-1.5 font-mono text-[11px] font-normal tabular-nums text-kumo-subtle">
                    {modeBadge}
                  </span>
                </CardTitle>
                <Select
                  value={mode}
                  onValueChange={(v) => setMode(v as CutMode)}
                >
                  <SelectTrigger className="h-7 w-40 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="full-size">Full-size</SelectItem>
                    <SelectItem value="2-stack">9:16 2-Stack</SelectItem>
                    <SelectItem value="1-stack">9:16 1-Zone</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Single source video: visible in full-size, hidden feeder for 9:16 canvas */}
              <video
                ref={videoRef}
                src={mediaUrl ?? undefined}
                className={cn(
                  "w-full overflow-hidden rounded-lg border border-kumo-line bg-black",
                  mode === "full-size" ? "block aspect-video" : "hidden",
                )}
                playsInline
                preload="metadata"
              />
              {mode !== "full-size" && activeLayout ? (
                <div className="flex justify-center">
                  <MobilePreviewShared
                    layout={activeLayout}
                    videoRef={videoRef}
                    safe={false}
                    showBg={false}
                  />
                </div>
              ) : null}

              <div className="flex items-center gap-2">
                <Button
                  size="icon-sm"
                  variant="outline"
                  onClick={togglePlay}
                  aria-label={isPlaying ? "Pause" : "Play"}
                >
                  {isPlaying ? "⏸" : "▶"}
                </Button>
                <Button
                  size="xs"
                  variant="outline"
                  onClick={playAllCuts}
                  disabled={sorted.length === 0}
                >
                  Play cuts
                </Button>
                <Slider
                  value={[currentTime]}
                  min={0}
                  max={duration || 30}
                  step={0.01}
                  onValueChange={(v) => {
                    const t = Array.isArray(v) ? v[0] : v;
                    seekTo(t as number);
                  }}
                  className="flex-1"
                />
                <span className="whitespace-nowrap text-xs tabular-nums text-kumo-subtle">
                  {formatTime(currentTime)} / {formatTime(duration)}
                </span>
              </div>

              {/* Cut timeline editor */}
              <div className="space-y-2 rounded-lg border border-kumo-hairline bg-kumo-recessed/20 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold">
                    Cuts · {cuts.length} · out {formatTime(outDuration)}
                  </span>
                  <div className="flex gap-1.5">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={addCut}
                      className="h-6 rounded-md px-2 text-xs"
                    >
                      <Plus className="size-3" aria-hidden />
                      Cut at {formatTime(currentTime)}
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={deleteSelected}
                      disabled={!selectedId}
                      className="h-6 rounded-md px-2 text-xs"
                    >
                      <Trash2 className="size-3" aria-hidden />
                      Delete
                    </Button>
                  </div>
                </div>
                <div
                  data-cut-track
                  className="relative h-14 rounded-md border border-kumo-line bg-kumo-base"
                >
                  {/* playhead */}
                  {duration > 0 ? (
                    <div
                      className="pointer-events-none absolute top-0 bottom-0 z-10 w-0.5 bg-kumo-strong/70"
                      style={{
                        left: `${clamp((currentTime / duration) * 100, 0, 100)}%`,
                      }}
                      aria-hidden
                    />
                  ) : null}
                  {sorted.map((c, i) => (
                    <CutBlock
                      key={c.id}
                      cut={c}
                      index={i}
                      duration={duration || 1}
                      isSelected={c.id === selectedId}
                      hasOverlap={overlapIds.has(c.id)}
                      onSelect={setSelectedId}
                      onChange={patchCut}
                    />
                  ))}
                  {cuts.length === 0 ? (
                    <span className="absolute inset-0 flex items-center justify-center text-[11px] text-kumo-subtle">
                      No cuts — press “Cut at playhead”, then drag edges to
                      resize by length
                    </span>
                  ) : null}
                </div>
                <div className="flex justify-between text-[10px] tabular-nums text-kumo-subtle">
                  <span>0:00</span>
                  <span>drag blocks to move · drag edges to resize</span>
                  <span>{formatTime(duration)}</span>
                </div>
                {overlapIds.size > 0 ? (
                  <p className="text-xs text-kumo-warn">
                    Cuts overlap — resize them so they don&apos;t intersect.
                  </p>
                ) : null}

                {/* Cut list with precise numeric editing */}
                <div className="space-y-1.5">
                  {sorted.map((c, i) => (
                    <div
                      key={c.id}
                      className={cn(
                        "flex flex-wrap items-center gap-2 rounded-md border p-2",
                        c.id === selectedId
                          ? "border-kumo-brand bg-kumo-brand/4"
                          : "border-kumo-hairline bg-kumo-recessed",
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedId(c.id);
                          playCut(c);
                        }}
                        className="text-xs font-semibold hover:underline"
                      >
                        C{i + 1}
                      </button>
                      <Label className="font-mono text-[10px] text-kumo-subtle">
                        start
                      </Label>
                      <Input
                        type="number"
                        step={0.05}
                        min={0}
                        max={duration}
                        value={c.start}
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          if (!Number.isFinite(v)) return;
                          patchCut(c.id, {
                            ...c,
                            start: clamp(v, 0, c.end - 0.2),
                          });
                        }}
                        className="h-7 w-24 font-mono text-xs tabular-nums"
                      />
                      <Label className="font-mono text-[10px] text-kumo-subtle">
                        end
                      </Label>
                      <Input
                        type="number"
                        step={0.05}
                        min={0}
                        max={duration}
                        value={c.end}
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          if (!Number.isFinite(v)) return;
                          patchCut(c.id, {
                            ...c,
                            end: clamp(v, c.start + 0.2, duration),
                          });
                        }}
                        className="h-7 w-24 font-mono text-xs tabular-nums"
                      />
                      <span className="font-mono text-[11px] tabular-nums text-kumo-subtle">
                        {(c.end - c.start).toFixed(2)}s
                      </span>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setSelectedId(c.id);
                          playCut(c);
                        }}
                        className="h-6 px-2 text-xs"
                      >
                        Preview
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setCuts((prev) => prev.filter((x) => x.id !== c.id));
                          if (selectedId === c.id) setSelectedId(null);
                        }}
                        className="h-6 px-2 text-xs"
                        aria-label={`Delete cut ${i + 1}`}
                      >
                        <Trash2 className="size-3" aria-hidden />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar settings */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm font-semibold tracking-normal">
                Cut settings
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Mode</Label>
                <Select
                  value={mode}
                  onValueChange={(v) => setMode(v as CutMode)}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="full-size">
                      Full-size (original)
                    </SelectItem>
                    <SelectItem value="2-stack">9:16 2-Stack</SelectItem>
                    <SelectItem value="1-stack">9:16 1-Zone</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-[11px] leading-4 text-kumo-subtle">
                  {mode === "full-size"
                    ? `Original ${sourceWidth || "—"}×${sourceHeight || "—"} kept, cuts concatenated.`
                    : `Reframed to ${OUTPUT_W}×${OUTPUT_H} with Mobile zones, cuts concatenated.`}
                </p>
              </div>

              {mode === "2-stack" ? (
                <div className="space-y-2 rounded-lg border border-kumo-hairline bg-kumo-recessed/40 p-2.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">Use watermark</Label>
                    <Switch
                      checked={watermarkStack}
                      onCheckedChange={setWatermarkStack}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">
                      Split {Math.round(stackedLayout.splitRatio * 100)} /{" "}
                      {Math.round((1 - stackedLayout.splitRatio) * 100)}
                    </Label>
                    <Slider
                      value={[stackedLayout.splitRatio]}
                      min={MIN_SPLIT}
                      max={MAX_SPLIT}
                      step={0.01}
                      onValueChange={(v) => {
                        const val = Array.isArray(v)
                          ? (v[0] as number)
                          : (v as number);
                        setStackedLayout((p) => ({
                          ...p,
                          splitRatio: clamp(val, MIN_SPLIT, MAX_SPLIT),
                        }));
                      }}
                    />
                  </div>
                  {stackedLayout.zones.map((z, i) => (
                    <div
                      key={z.id}
                      className="space-y-1.5 border-t border-kumo-hairline pt-2"
                    >
                      <span className="text-xs font-medium">Zone {i + 1}</span>
                      <ZoneSliders
                        zone={z}
                        onChange={(nz) => updateZone("stacked", z.id, nz)}
                      />
                    </div>
                  ))}
                </div>
              ) : null}

              {mode === "1-stack" ? (
                <div className="space-y-2 rounded-lg border border-kumo-hairline bg-kumo-recessed/40 p-2.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">Use watermark</Label>
                    <Switch
                      checked={watermarkSingle}
                      onCheckedChange={setWatermarkSingle}
                    />
                  </div>
                  {singleLayout.zones.map((z, i) => (
                    <div key={z.id} className="space-y-1.5">
                      <span className="text-xs font-medium">
                        Zone {i + 1} (full height 9:16)
                      </span>
                      <ZoneSliders
                        zone={z}
                        onChange={(nz) => updateZone("full", z.id, nz)}
                      />
                    </div>
                  ))}
                </div>
              ) : null}

              <Button
                size="sm"
                variant="secondary"
                onClick={syncFromMobile}
                className="w-full"
              >
                Sync zones from Mobile editor
              </Button>

              <div className="space-y-1.5">
                <Label className="text-xs">Export filename</Label>
                <Input
                  value={exportName}
                  onChange={(e) => setExportName(e.target.value)}
                  placeholder={file?.name.replace(/\.[^.]+$/, "") ?? "cut"}
                  className="h-8 text-xs"
                />
              </div>

              <Button
                className="w-full"
                onClick={onExport}
                disabled={
                  cuts.length === 0 || overlapIds.size > 0 || isExporting
                }
              >
                <Film className="size-3.5" aria-hidden />
                {isExporting ? "Exporting…" : `Export ${cuts.length} cut(s)`}
              </Button>
              <p className="text-[10px] leading-3 text-kumo-subtle">
                Renders POST /transcode/cut with cuts + mode {mode}. Output{" "}
                {mode === "full-size" ? "original size" : "1080×1920"} · 30fps
                mp4.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
