"use client";

import { memo, useCallback, useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Film, FolderInput, FolderOutput, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatTime } from "@/lib/format-time";
import { isAcceptedVideoFile } from "@/lib/video-file";
import {
  clamp,
  createDefaultLayout,
  loadPrefForMode,
  MIN_SPLIT,
  MAX_SPLIT,
  OUTPUT_W,
  OUTPUT_H,
  validateLayout,
} from "@/lib/mobile-layout";
import type { CropZone, MobileLayout } from "@/lib/mobile-layout";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type BulkStatus =
  | "idle"
  | "queued"
  | "uploading"
  | "processing"
  | "saving"
  | "completed"
  | "failed";

interface BulkItem {
  id: string;
  file: File;
  url: string;
  name: string;
  baseName: string;
  size: number;
  duration: number;
  width: number;
  height: number;
  selected: boolean;
  status: BulkStatus;
  progress: number;
  error: string | null;
}

// Minimal File System Access API typings (lib.dom may not include them)
interface FsWritable {
  write: (data: Blob) => Promise<void>;
  close: () => Promise<void>;
}
interface FsFileHandle {
  createWritable: () => Promise<FsWritable>;
}
interface FsDirHandle {
  getFileHandle: (name: string, opts?: { create?: boolean }) => Promise<FsFileHandle>;
}

// ---------------------------------------------------------------------------
// Shared watermark image cache
// ---------------------------------------------------------------------------

let wmImg: HTMLImageElement | null = null;
let wmPromise: Promise<HTMLImageElement | null> | null = null;
function ensureWatermark(): Promise<HTMLImageElement | null> {
  if (wmImg) return Promise.resolve(wmImg);
  if (!wmPromise) {
    wmPromise = new Promise((resolve) => {
      const img = new window.Image();
      img.src = "/minozavr.png";
      img.onload = () => {
        wmImg = img;
        resolve(img);
      };
      img.onerror = () => resolve(null);
    });
  }
  return wmPromise;
}

// ---------------------------------------------------------------------------
// Stacked 9:16 preview cell — static frame drawn from the file's own video
// ---------------------------------------------------------------------------

const PREVIEW_W = 180;

type CellPreviewProps = {
  url: string;
  layout: MobileLayout;
  useWatermark: boolean;
  onMeta: (meta: { duration: number; width: number; height: number }) => void;
};

const CellPreview = memo(function CellPreview({
  url,
  layout,
  useWatermark,
  onMeta,
}: CellPreviewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const topRef = useRef<HTMLCanvasElement>(null);
  const bottomRef = useRef<HTMLCanvasElement>(null);
  const onMetaRef = useRef(onMeta);
  useEffect(() => {
    onMetaRef.current = onMeta;
  }, [onMeta]);

  const draw = useCallback(() => {
    const video = videoRef.current;
    if (!video || video.readyState < 2 || video.videoWidth === 0) return;
    const split = clamp(layout.splitRatio, MIN_SPLIT, MAX_SPLIT);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const totalH = PREVIEW_W * (OUTPUT_H / OUTPUT_W);
    const parts: Array<{
      canvas: HTMLCanvasElement | null;
      zone: CropZone;
      h: number;
    }> = [
      { canvas: topRef.current, zone: layout.zones[0], h: totalH * split },
      { canvas: bottomRef.current, zone: layout.zones[1], h: totalH * (1 - split) },
    ];
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    for (const { canvas, zone, h } of parts) {
      if (!canvas || !zone) continue;
      canvas.width = Math.round(PREVIEW_W * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = `${PREVIEW_W}px`;
      canvas.style.height = `${h}px`;
      const ctx = canvas.getContext("2d");
      if (!ctx) continue;
      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, PREVIEW_W, h);
      const sx = Math.max(0, Math.round(zone.x * vw));
      const sy = Math.max(0, Math.round(zone.y * vh));
      const sw = Math.max(1, Math.round(zone.width * vw));
      const sh = Math.max(1, Math.round(zone.height * vh));
      const z = zone.zoom ?? 1;
      const zsw = sw / z;
      const zsh = sh / z;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(
        video,
        sx + (sw - zsw) / 2,
        sy + (sh - zsh) / 2,
        zsw,
        zsh,
        0,
        0,
        PREVIEW_W,
        h,
      );
      ctx.restore();
    }
    if (useWatermark && wmImg) {
      const img = wmImg as HTMLImageElement;
      const drawWm = (
        canvas: HTMLCanvasElement | null,
        slice: "top" | "bottom",
        h: number,
      ) => {
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.save();
        ctx.scale(dpr, dpr);
        if (slice === "top") {
          ctx.drawImage(img, 0, 0, 1080, 1920 * split, 0, 0, PREVIEW_W, h);
        } else {
          const h1 = 1920 * split;
          ctx.drawImage(img, 0, h1, 1080, 1920 - h1, 0, 0, PREVIEW_W, h);
        }
        ctx.restore();
      };
      drawWm(topRef.current, "top", totalH * split);
      drawWm(bottomRef.current, "bottom", totalH * (1 - split));
    }
  }, [layout, useWatermark]);

  // Redraw when layout / watermark toggles
  const drawRef = useRef(draw);
  useEffect(() => {
    drawRef.current = draw;
  }, [draw]);
  useEffect(() => {
    if (useWatermark) {
      void ensureWatermark().then(() => drawRef.current());
    } else {
      drawRef.current();
    }
  }, [useWatermark, layout]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const onLoaded = () => {
      const d = video.duration;
      onMetaRef.current({
        duration: Number.isFinite(d) ? d : 0,
        width: video.videoWidth,
        height: video.videoHeight,
      });
      // Seek slightly in so the preview frame is rarely black
      try {
        video.currentTime = Math.min(1, (Number.isFinite(d) ? d : 2) * 0.1);
      } catch {}
    };
    const onSeeked = () => drawRef.current();
    const onData = () => drawRef.current();
    video.addEventListener("loadedmetadata", onLoaded);
    video.addEventListener("seeked", onSeeked);
    video.addEventListener("loadeddata", onData);
    return () => {
      video.removeEventListener("loadedmetadata", onLoaded);
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("loadeddata", onData);
    };
  }, [url]);

  return (
    <div className="flex flex-col items-center">
      <video
        ref={videoRef}
        src={url}
        className="hidden"
        muted
        playsInline
        preload="auto"
        crossOrigin="anonymous"
      />
      <div className="overflow-hidden rounded-lg border border-kumo-line bg-black flex flex-col">
        <canvas ref={topRef} className="block" />
        <div className="h-0.5 shrink-0 bg-kumo-hairline" />
        <canvas ref={bottomRef} className="block" />
      </div>
    </div>
  );
});

// ---------------------------------------------------------------------------
// Status helpers
// ---------------------------------------------------------------------------

const STATUS_LABEL: Record<BulkStatus, string> = {
  idle: "Ready",
  queued: "Queued",
  uploading: "Uploading",
  processing: "Rendering",
  saving: "Saving",
  completed: "Done",
  failed: "Failed",
};

function statusColor(s: BulkStatus): string {
  switch (s) {
    case "completed":
      return "bg-kumo-success";
    case "failed":
      return "bg-kumo-warn";
    case "uploading":
    case "processing":
    case "saving":
      return "bg-kumo-brand animate-pulse";
    default:
      return "bg-kumo-subtle/40";
  }
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

function loadStackedLayout(): MobileLayout {
  try {
    return (
      loadPrefForMode("stacked") ??
      loadPrefForMode("full") ??
      createDefaultLayout("stacked", 0.5)
    );
  } catch {
    return createDefaultLayout("stacked", 0.5);
  }
}

function baseNameOf(name: string): string {
  return name.replace(/\.[^.]+$/, "") || name;
}

export default function MobileBulkEditorPage() {
  const [items, setItems] = useState<BulkItem[]>([]);
  const [layout, setLayout] = useState<MobileLayout>(() => loadStackedLayout());
  const [useWatermark, setUseWatermark] = useState(true);
  const [inputFolderName, setInputFolderName] = useState<string | null>(null);
  const [outputDirHandle, setOutputDirHandle] =
    useState<FsDirHandle | null>(null);
  const [outputDirName, setOutputDirName] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const itemsRef = useRef<BulkItem[]>([]);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  // webkitdirectory is not in React's input props — set imperatively
  useEffect(() => {
    folderInputRef.current?.setAttribute("webkitdirectory", "");
  }, []);

  // Revoke object URLs on unmount
  useEffect(() => {
    const snapshot = itemsRef;
    return () => {
      for (const it of snapshot.current) URL.revokeObjectURL(it.url);
    };
  }, []);

  const stackedLayout = layout.mode === "full" ? null : layout;
  const layoutError = stackedLayout ? validateLayout(stackedLayout) : "Open the Mobile editor and save a stacked 2-zone layout, then press Sync zones.";

  const patchItem = useCallback((id: string, patch: Partial<BulkItem>) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }, []);

  const handleMeta = useCallback(
    (id: string, meta: { duration: number; width: number; height: number }) => {
      patchItem(id, meta);
    },
    [patchItem],
  );

  // -- folder picking --------------------------------------------------------

  const onFolderChosen = useCallback((files: FileList | File[] | null) => {
    if (!files) return;
    const list = Array.from(files);
    // Only files in the selected folder root — ignore anything from sub-folders.
    // webkitRelativePath is "<folder>/<file>" for root files vs
    // "<folder>/<sub>/.../<file>" for nested ones.
    const rootFiles = list.filter((f) => {
      const rel = (f as File & { webkitRelativePath?: string }).webkitRelativePath;
      if (!rel) return true;
      return rel.split("/").length === 2;
    });
    const skippedNested = list.length - rootFiles.length;
    const videos = rootFiles.filter(isAcceptedVideoFile);
    if (videos.length === 0) {
      toast.error("No supported videos in folder (MP4/WebM/MOV/MKV)");
      return;
    }
    setItems((prev) => {
      for (const it of prev) URL.revokeObjectURL(it.url);
      return videos.map((file, i) => ({
        id: `${Date.now()}-${i}`,
        file,
        url: URL.createObjectURL(file),
        name: file.name,
        baseName: baseNameOf(file.name),
        size: file.size,
        duration: 0,
        width: 0,
        height: 0,
        selected: true,
        status: "idle" as BulkStatus,
        progress: 0,
        error: null,
      }));
    });
    const first = list[0] as File & { webkitRelativePath?: string };
    const folder = first?.webkitRelativePath?.split("/")[0] || null;
    setInputFolderName(folder ?? `${videos.length} files`);
    toast.success(
      `Found ${videos.length} video${videos.length === 1 ? "" : "s"} in folder root`,
      skippedNested > 0
        ? {
            description: `Ignored ${skippedNested} file${skippedNested === 1 ? "" : "s"} from sub-folders`,
          }
        : undefined,
    );
  }, []);

  const pickInputFolder = useCallback(() => {
    folderInputRef.current?.click();
  }, []);

  const pickOutputFolder = useCallback(async () => {
    const w = window as unknown as {
      showDirectoryPicker?: (opts?: { mode?: string }) => Promise<FsDirHandle & { name?: string }>;
    };
    if (!w.showDirectoryPicker) {
      toast.error("Output folder picker not supported — files will download normally");
      return;
    }
    try {
      const handle = await w.showDirectoryPicker({ mode: "readwrite" });
      setOutputDirHandle(handle);
      setOutputDirName(handle.name ?? "selected folder");
      toast.success("Output folder set — files will save there directly");
    } catch (e) {
      if ((e as DOMException)?.name !== "AbortError") {
        toast.error("Could not open output folder");
      }
    }
  }, []);

  const syncLayout = useCallback(() => {
    setLayout(loadStackedLayout());
    toast.success("Zones synced from Mobile editor");
  }, []);

  const setAllSelected = useCallback((v: boolean) => {
    setItems((prev) => prev.map((it) => ({ ...it, selected: v })));
  }, []);

  // -- bulk export -----------------------------------------------------------

  const onBulkExport = useCallback(async () => {
    if (isExporting) return;
    if (!stackedLayout || layoutError) {
      toast.error(layoutError ?? "Invalid layout");
      return;
    }
    const queue = itemsRef.current.filter(
      (it) => it.selected && (it.status === "idle" || it.status === "failed"),
    );
    if (queue.length === 0) {
      toast.error("Nothing to export — select files first");
      return;
    }
    setIsExporting(true);
    const [{ API_BASE_URL }, chunkedMod] = await Promise.all([
      import("@/lib/api-client"),
      import("@/lib/upload-chunked"),
    ]);
    const { shouldUseChunked, uploadFileChunked, uploadFormWithProgress } =
      chunkedMod;
    let done = 0;
    let failed = 0;

    for (const item of queue) {
      const { id, file } = item;
      const meta = itemsRef.current.find((it) => it.id === id);
      const duration = meta?.duration ?? 0;
      const sw = meta?.width || 1920;
      const sh = meta?.height || 1080;
      const outName = `${baseNameOf(file.name)}_mobile_1080x1920.mp4`;
      const base = baseNameOf(file.name);
      patchItem(id, { status: "uploading", progress: 0, error: null });
      try {
        const settingsJson = JSON.stringify({
          mobileLayout: stackedLayout,
          sourceWidth: sw,
          sourceHeight: sh,
          trimRange: [0, duration > 0 ? duration : 0.001],
          ignoreTrim: true,
          ignoreTrimSettings: true,
          exportFormat: "mp4",
          exportFps: 30,
          exportFilename: base,
          exportQuality: 10,
          exportSpeed: 1,
          customFFmpegArgs: "",
          watermark: useWatermark,
        });
        let jobId: string;
        let progressUrl: string;
        const onUpload = (sent: number, total: number) =>
          patchItem(id, {
            progress: total ? Math.round((sent / total) * 50) : 0,
          });
        if (shouldUseChunked(file)) {
          const { uploadId } = await uploadFileChunked(file, {
            onProgress: onUpload,
          });
          patchItem(id, { progress: 50 });
          const fd = new FormData();
          fd.append("settings", settingsJson);
          const res = await fetch(`${API_BASE_URL}/api/transcode/mobile`, {
            method: "POST",
            headers: { "x-upload-id": uploadId },
            body: fd,
          });
          if (!res.ok) {
            const payload = (await res.json().catch(() => null)) as {
              error?: string;
            } | null;
            throw new Error(payload?.error ?? `Export failed: ${res.status}`);
          }
          const j = (await res.json()) as { jobId: string; progressUrl: string };
          jobId = j.jobId;
          progressUrl = new URL(j.progressUrl, API_BASE_URL).toString();
        } else {
          const fd = new FormData();
          fd.append("file", file);
          fd.append("settings", settingsJson);
          const j = await uploadFormWithProgress<{
            jobId: string;
            progressUrl: string;
          }>("/api/transcode/mobile", fd, { onUploadProgress: onUpload });
          jobId = j.jobId;
          progressUrl = new URL(j.progressUrl, API_BASE_URL).toString();
        }
        patchItem(id, { status: "processing", progress: 50 });
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
                patchItem(id, {
                  progress: 50 + Math.round((p.progress / 100) * 45),
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
        patchItem(id, { status: "saving", progress: 97 });
        const dl = await fetch(`${API_BASE_URL}/api/transcode/download/${jobId}`);
        if (!dl.ok) {
          const payload = (await dl.json().catch(() => null)) as {
            error?: string;
          } | null;
          throw new Error(payload?.error ?? `Download failed: ${dl.status}`);
        }
        const blob = await dl.blob();
        if (outputDirHandle) {
          const fh = await outputDirHandle.getFileHandle(outName, {
            create: true,
          });
          const w = await fh.createWritable();
          await w.write(blob);
          await w.close();
        } else {
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = outName;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          setTimeout(() => URL.revokeObjectURL(url), 5000);
        }
        patchItem(id, { status: "completed", progress: 100 });
        done++;
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Export failed";
        if ((e as DOMException)?.name === "AbortError") {
          patchItem(id, { status: "idle", progress: 0 });
        } else {
          patchItem(id, { status: "failed", progress: 0, error: msg });
          failed++;
        }
      }
    }
    setIsExporting(false);
    if (failed === 0) toast.success(`Bulk export done — ${done} file${done === 1 ? "" : "s"}`);
    else toast.error(`Bulk export finished with ${failed} failure${failed === 1 ? "" : "s"} (${done} ok)`);
  }, [isExporting, stackedLayout, layoutError, outputDirHandle, useWatermark, patchItem]);

  // -- derived ---------------------------------------------------------------

  const selectedCount = items.filter((it) => it.selected).length;
  const completedCount = items.filter((it) => it.status === "completed").length;
  const failedCount = items.filter((it) => it.status === "failed").length;
  const splitLabel = stackedLayout
    ? `${Math.round(stackedLayout.splitRatio * 100)} / ${Math.round((1 - stackedLayout.splitRatio) * 100)}`
    : "—";

  // -- empty state ------------------------------------------------------------

  if (items.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-1.5">
          <h2 className="text-base font-semibold leading-none tracking-normal">
            Mobile bulk export
          </h2>
          <p className="max-w-prose text-sm leading-5 text-kumo-subtle">
            Render a whole folder to 9:16 stacked two-zone portrait. Uses the
            zones saved in the Mobile editor, full length, one by one.
          </p>
        </div>
        <Card className="p-6 sm:p-8">
          <CardContent className="p-0">
            <input
              ref={folderInputRef}
              type="file"
              multiple
              className="hidden"
              tabIndex={-1}
              onChange={(e) => {
                onFolderChosen(e.target.files);
                e.target.value = "";
              }}
            />
            <button
              type="button"
              onClick={pickInputFolder}
              className="flex w-full cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-kumo-line bg-kumo-recessed px-6 py-12 text-center transition-colors hover:border-kumo-brand hover:bg-kumo-brand/4"
            >
              <span className="inline-flex size-10 items-center justify-center rounded-lg border border-kumo-line bg-kumo-base text-kumo-subtle">
                <FolderInput className="size-5" aria-hidden />
              </span>
              <span className="flex flex-col gap-1">
                <span className="text-sm font-medium">Select input folder</span>
                <span className="text-xs text-kumo-subtle">
                  Only MP4 · WebM · MOV · MKV in the folder root — sub-folders ignored
                </span>
              </span>
            </button>
            <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-kumo-hairline pt-4 text-xs text-kumo-subtle">
              <span className="inline-flex items-center gap-1.5 font-mono text-[11px] tabular-nums">
                <span className="size-1.5 rounded-full bg-kumo-success" aria-hidden />
                Local only
              </span>
              <span aria-hidden className="text-kumo-hairline">·</span>
              <span className="tabular-nums">Full length · ignore trim · 1080×1920</span>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // -- main -------------------------------------------------------------------

  return (
    <div className="flex flex-col gap-6">
      <input
        ref={folderInputRef}
        type="file"
        multiple
        className="hidden"
        tabIndex={-1}
        onChange={(e) => {
          onFolderChosen(e.target.files);
          e.target.value = "";
        }}
      />
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-kumo-hairline pb-4">
        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold leading-none tracking-normal">
              Mobile bulk export
            </h2>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-kumo-hairline bg-kumo-recessed px-2 py-0.5 text-[11px] font-medium leading-none text-kumo-subtle">
              <span className="size-1.5 rounded-full bg-kumo-brand" aria-hidden />
              Stacked {splitLabel}
              <span aria-hidden className="opacity-40">·</span>
              <span className="tabular-nums">
                {completedCount}/{items.length} done
              </span>
            </span>
          </div>
          <p className="flex flex-wrap items-center gap-1.5 text-xs leading-4 text-kumo-subtle">
            <span>
              {inputFolderName ?? "Input folder"} · {items.length} video
              {items.length === 1 ? "" : "s"} · {selectedCount} selected
            </span>
            <span aria-hidden className="text-kumo-hairline">·</span>
            <span className="tabular-nums">Full length · 1080 × 1920</span>
            {failedCount > 0 ? (
              <>
                <span aria-hidden className="text-kumo-hairline">·</span>
                <span className="text-kumo-warn">{failedCount} failed</span>
              </>
            ) : null}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-1.5 justify-end">
          <Button size="sm" variant="secondary" onClick={() => setAllSelected(true)} className="h-7 rounded-md text-xs">
            Select all
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setAllSelected(false)} className="h-7 rounded-md text-xs">
            Select none
          </Button>
          <span aria-hidden className="h-5 w-px bg-kumo-hairline mx-0.5" />
          <Button size="sm" onClick={onBulkExport} disabled={isExporting || selectedCount === 0} className="h-7 rounded-md text-xs font-medium">
            {isExporting ? "Exporting…" : `Bulk Export (${selectedCount})`}
          </Button>
        </div>
      </header>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="grid items-start gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((it) => (
            <Card key={it.id} className="overflow-hidden">
              <CardContent className="space-y-2 p-3">
                <div className="flex items-start gap-2">
                  <Checkbox
                    checked={it.selected}
                    onCheckedChange={(v) =>
                      patchItem(it.id, { selected: v === true })
                    }
                    disabled={isExporting}
                    aria-label={`Include ${it.name} in bulk export`}
                    className="mt-0.5"
                  />
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate font-mono text-[11px] font-medium tabular-nums" title={it.name}>
                      {it.baseName}
                    </span>
                    <span className="font-mono text-[11px] tabular-nums text-kumo-subtle">
                      {it.duration > 0 ? formatTime(it.duration) : "…"}
                      {it.width > 0 ? ` · ${it.width}×${it.height}` : ""}
                    </span>
                  </div>
                </div>
                {stackedLayout ? (
                  <CellPreview
                    url={it.url}
                    layout={stackedLayout}
                    useWatermark={useWatermark}
                    onMeta={(m) => handleMeta(it.id, m)}
                  />
                ) : null}
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5 text-[11px] leading-none tabular-nums text-kumo-subtle">
                    <span className={cn("size-1.5 rounded-full", statusColor(it.status))} aria-hidden />
                    {STATUS_LABEL[it.status]}
                    {it.status === "uploading" || it.status === "processing" ? (
                      <span className="ml-auto">{it.progress}%</span>
                    ) : null}
                  </div>
                  {it.status === "uploading" || it.status === "processing" || it.status === "saving" ? (
                    <Progress value={it.progress} />
                  ) : null}
                  {it.error ? (
                    <p className="text-[11px] leading-4 text-kumo-warn break-words">
                      {it.error}
                    </p>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm font-semibold tracking-normal">
                Bulk settings
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 flex-col gap-0.5">
                  <Label className="text-xs">Input folder</Label>
                  <span className="truncate font-mono text-[11px] tabular-nums text-kumo-subtle">
                    {inputFolderName ?? "—"} · {items.length} files
                  </span>
                </div>
                <Button size="sm" variant="secondary" onClick={pickInputFolder} disabled={isExporting} className="h-7 shrink-0 rounded-md text-xs">
                  <FolderInput className="size-3.5" aria-hidden />
                  Change
                </Button>
              </div>
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 flex-col gap-0.5">
                  <Label className="text-xs">Output folder</Label>
                  <span className="truncate font-mono text-[11px] tabular-nums text-kumo-subtle">
                    {outputDirName ?? "Downloads (fallback)"}
                  </span>
                </div>
                <Button size="sm" variant="secondary" onClick={pickOutputFolder} disabled={isExporting} className="h-7 shrink-0 rounded-md text-xs">
                  <FolderOutput className="size-3.5" aria-hidden />
                  Change
                </Button>
              </div>
              <div className="flex items-center justify-between">
                <Label className="text-xs">Use watermark</Label>
                <Switch checked={useWatermark} onCheckedChange={setUseWatermark} disabled={isExporting} />
              </div>
              <div className="flex items-center justify-between gap-2">
                <div className="flex flex-col gap-0.5">
                  <Label className="text-xs">Zones · Stacked {splitLabel}%</Label>
                  <span className="font-mono text-[11px] tabular-nums text-kumo-subtle">
                    from Mobile editor
                  </span>
                </div>
                <Button size="sm" variant="secondary" onClick={syncLayout} disabled={isExporting} className="h-7 shrink-0 rounded-md text-xs">
                  <RefreshCw className="size-3.5" aria-hidden />
                  Sync zones
                </Button>
              </div>
              {layoutError ? (
                <p className="text-xs text-kumo-warn">{layoutError}</p>
              ) : null}
              <Button className="w-full" onClick={onBulkExport} disabled={isExporting || selectedCount === 0 || !!layoutError}>
                <Film className="size-3.5" aria-hidden />
                {isExporting ? "Exporting…" : `Bulk Export (${selectedCount})`}
              </Button>
              <p className="text-[10px] leading-3 text-kumo-subtle">
                Files render one by one, full length (trim ignored), 1080×1920.
                Each finished file saves to the output folder automatically.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
