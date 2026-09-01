"use client";

import { memo, useCallback, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import { Activity } from "react";
import {
  ArrowUpRight,
  Crop,
  Film,
  Monitor,
  Save,
  Scissors,
  SlidersHorizontal,
  Upload,
} from "lucide-react";
import { Sidebar, SidebarToggle } from "@/components/editor/Sidebar";
import { VideoUploader } from "@/components/editor/VideoUploader";
import { UploadProgress } from "@/components/editor/UploadProgress";
import { useVideoState, useVideoStore } from "@/store/useVideoStore";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useVideoMetadataMutation } from "@/hooks/useVideoMetadata";
import { toast } from "sonner";
import {
  ACCEPTED_VIDEO_INPUT_ATTR,
  formatFileSize,
  isAcceptedVideoFile,
  isFileTooLarge,
  MAX_UPLOAD_BYTES,
} from "@/lib/video-file";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Lazy player — keep as dynamic to avoid SSR video issues
// ---------------------------------------------------------------------------
const DynamicVideoPlayer = dynamic(
  () =>
    import("@/components/editor/VideoPlayer").then((m) => ({
      default: m.VideoPlayer,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="aspect-video rounded-lg bg-kumo-recessed animate-pulse border border-kumo-hairline" />
    ),
  },
);

function preloadPlayer() {
  void import("@/components/editor/VideoPlayer");
}

// ---------------------------------------------------------------------------
// Small helper: upload-other button (kept local to this page)
// ---------------------------------------------------------------------------
const UploadOtherButtonCrop = memo(function UploadOtherButtonCrop() {
  const inputRef = useRef<HTMLInputElement>(null);
  const store = useVideoStore();
  const metadata = useVideoMetadataMutation();

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
      const defaultFilename = file.name.replace(/\.[^.]+$/, "");
      try {
        localStorage.removeItem("ffmpeg_editor_trimRange_v1");
      } catch {}
      store.setState((prev) => {
        if (prev.mediaUrl) URL.revokeObjectURL(prev.mediaUrl);
        return {
          ...prev,
          file,
          mediaUrl,
          currentTime: 0,
          duration: 0,
          isPlaying: false,
          trimRange: [0, 0] as [number, number],
          crop: { x: 0, y: 0, width: 100, height: 100 },
          aspectRatio: "custom" as const,
          isCropMode: false,
          canvasZoom: 1,
          canvasOffset: { x: 0, y: 0 },
          sourceAspectRatio: 1,
          sourceWidth: 0,
          sourceHeight: 0,
          sourceFrameRate: 0,
          containerFormat: null,
          videoCodec: null,
          audioCodec: null,
          bitrateKbps: 0,
          ffprobeReport: null,
          exportFilename: defaultFilename,
          transcodeStatus: "idle" as const,
          transcodeProgress: 0,
          transcodeOutputPath: null,
          transcodeError: null,
        };
      });
      metadata.mutate(file);
    },
    [store, metadata],
  );

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_VIDEO_INPUT_ATTR}
        className="hidden"
        tabIndex={-1}
        onChange={(e) => onPick(e.target.files?.[0])}
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
// Empty-state helper
// ---------------------------------------------------------------------------
function CapabilityCard({
  icon: Icon,
  title,
  desc,
  meta,
}: {
  icon: React.ElementType;
  title: string;
  desc: string;
  meta: string;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-kumo-hairline bg-kumo-recessed p-4">
      <div className="flex items-center gap-2">
        <span className="inline-flex size-7 items-center justify-center rounded-md border border-kumo-line bg-kumo-base text-kumo-subtle">
          <Icon className="size-3.5" aria-hidden />
        </span>
        <h3 className="text-sm font-medium leading-none">{title}</h3>
      </div>
      <p className="text-xs leading-5 text-kumo-subtle">{desc}</p>
      <span className="font-mono text-[11px] leading-none text-kumo-subtle/80 tabular-nums">
        {meta}
      </span>
    </div>
  );
}

// ===========================================================================
// Crop area — rewritten from scratch
// ===========================================================================
//
// Design goals (replaces all previous crop boilerplate):
//  - Single source of truth: `store.crop` is the only mutable state.
//  - Percentages are always 0..100 relative to source pixels (store invariant).
//  - Pixel readout is derived, never stored.
//  - No useDeferredValue / useTransition / stale flags — crop is synchronous.
//  - No manual Map caches, no duplicated localStorage logic, no avg stats.
//  - Visual: one authoritative bar that tells the user what will be exported.
//  - Actions: enable/disable crop mode, reset to full frame, aspect badge.
//  - The interactive rectangle itself lives in CropOverlay (pointer handling);
//    this component is the *control & readout* surface for the crop area.
//

function formatPct(n: number) {
  return `${n.toFixed(1)}%`;
}

const CROP_STORAGE_KEY = "ffmpeg_editor_crop_v1";

type PersistedCrop = {
  crop: { x: number; y: number; width: number; height: number };
  aspectRatio: "custom" | "1:1" | "16:9" | "21:9";
  isCropMode: boolean;
};

function isValidPersistedCrop(v: unknown): v is PersistedCrop {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  const c = o.crop as Record<string, unknown> | undefined;
  if (!c || typeof c.x !== "number" || typeof c.y !== "number" || typeof c.width !== "number" || typeof c.height !== "number")
    return false;
  if (![c.x, c.y, c.width, c.height].every((n) => Number.isFinite(n as number))) return false;
  if (c.x < 0 || c.y < 0 || c.width < 5 || c.height < 5 || c.x + c.width > 100.01 || c.y + c.height > 100.01) return false;
  if (o.aspectRatio !== "custom" && o.aspectRatio !== "1:1" && o.aspectRatio !== "16:9" && o.aspectRatio !== "21:9") return false;
  // isCropMode is new — allow missing for backward compat with old saves, but if present must be boolean
  if (o.isCropMode !== undefined && typeof o.isCropMode !== "boolean") return false;
  return true;
}

function CropArea() {
  const store = useVideoStore();
  const { crop, aspectRatio, sourceWidth, sourceHeight, isCropMode } =
    useVideoState() as {
      crop: { x: number; y: number; width: number; height: number };
      aspectRatio: "custom" | "1:1" | "16:9" | "21:9";
      sourceWidth: number;
      sourceHeight: number;
      isCropMode: boolean;
    };

  const hasSource = sourceWidth > 0 && sourceHeight > 0;

  // Pixel-space readout — derived each render, no memo/caching needed (cheap).
  const px = hasSource
    ? {
        x: Math.round((crop.x / 100) * sourceWidth),
        y: Math.round((crop.y / 100) * sourceHeight),
        w: Math.round((crop.width / 100) * sourceWidth),
        h: Math.round((crop.height / 100) * sourceHeight),
        x2: Math.round(((crop.x + crop.width) / 100) * sourceWidth),
        y2: Math.round(((crop.y + crop.height) / 100) * sourceHeight),
      }
    : null;

  const cropLabel =
    hasSource && px
      ? `${px.w} × ${px.h} px`
      : `${formatPct(crop.width)} × ${formatPct(crop.height)}`;
  const sourceLabel = hasSource ? `${sourceWidth} × ${sourceHeight} px` : "—";
  const isFullFrame =
    crop.x === 0 && crop.y === 0 && crop.width === 100 && crop.height === 100;

  const resetCrop = useCallback(() => {
    store.setState((prev) => ({
      ...prev,
      crop: { x: 0, y: 0, width: 100, height: 100 },
      aspectRatio: "custom" as const,
    }));
  }, [store]);

  const toggleCropMode = useCallback(() => {
    store.setState((prev) => ({ ...prev, isCropMode: !prev.isCropMode }));
  }, [store]);

  // Hydrate saved crop once on mount — keeps Save meaningful across reloads.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(CROP_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as unknown;
      if (!isValidPersistedCrop(parsed)) return;
      const p = parsed as PersistedCrop & { isCropMode?: boolean };
      store.setState((prev) => {
        // Don't clobber an active edit session; only restore if still at defaults.
        const isDefault =
          prev.crop.x === 0 && prev.crop.y === 0 && prev.crop.width === 100 && prev.crop.height === 100 && prev.aspectRatio === "custom" && prev.isCropMode === false;
        if (!isDefault) return prev;
        return {
          ...prev,
          crop: p.crop,
          aspectRatio: p.aspectRatio,
          isCropMode: typeof p.isCropMode === "boolean" ? p.isCropMode : prev.isCropMode,
        };
      });
    } catch {}
  }, [store]);

  const saveCrop = useCallback(() => {
    try {
      const payload: PersistedCrop = { crop, aspectRatio, isCropMode };
      localStorage.setItem(CROP_STORAGE_KEY, JSON.stringify(payload));
      toast.success("Crop settings saved", {
        description: `${aspectRatio} · ${formatPct(crop.width)} × ${formatPct(crop.height)} ${isCropMode ? "· enabled" : "· disabled"}`,
      });
    } catch {
      toast.error("Failed to save crop settings");
    }
  }, [crop, aspectRatio, isCropMode]);

  return (
    <div className="rounded-md border border-kumo-hairline bg-kumo-recessed">
      {/* Top bar: identity + actions */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5">
        <div className="flex items-center gap-2">
          <span className="inline-flex size-7 items-center justify-center rounded-md border border-kumo-line bg-kumo-base text-kumo-subtle">
            <Crop className="size-3.5" aria-hidden />
          </span>
          <div className="flex flex-col gap-0.5">
            <span className="flex items-center gap-2 text-xs font-semibold leading-none">
              Crop area
              <span
                className={cn(
                  "inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium leading-none tabular-nums",
                  isFullFrame
                    ? "border-kumo-hairline bg-kumo-base text-kumo-subtle"
                    : "border-kumo-brand/20 bg-kumo-brand/10 text-kumo-brand",
                )}
              >
                {aspectRatio}
              </span>
              {isCropMode ? (
                <span className="inline-flex items-center gap-1 text-[11px] font-normal text-kumo-success">
                  <span
                    className="size-1.5 rounded-full bg-kumo-success"
                    aria-hidden
                  />
                  editing
                </span>
              ) : null}
            </span>
            <span className="text-[11px] leading-none text-kumo-subtle tabular-nums">
              {cropLabel}
              <span aria-hidden className="mx-1 text-kumo-hairline">
                ·
              </span>
              source {sourceLabel}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            variant={isCropMode ? "default" : "outline"}
            onClick={toggleCropMode}
            className="h-7 rounded-md text-xs"
          >
            {isCropMode ? "Done" : "Edit crop"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={resetCrop}
            disabled={isFullFrame}
            className="h-7 rounded-md text-xs"
            title="Reset crop to full frame"
          >
            Reset
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={saveCrop}
            className="h-7 gap-1.5 rounded-md text-xs"
            title="Save crop to localStorage"
            aria-label="Save crop settings"
          >
            <Save className="size-3.5" aria-hidden />
            Save
          </Button>
        </div>
      </div>

      {/* Readout grid: pct + px, single source of truth */}
      <div className="grid grid-cols-2 gap-px border-t border-kumo-hairline bg-kumo-hairline sm:grid-cols-4">
        <div className="bg-kumo-recessed px-3 py-2">
          <div className="text-[10px] font-medium uppercase tracking-wide text-kumo-subtle">
            X / Y (pct)
          </div>
          <div className="mt-0.5 font-mono text-xs tabular-nums">
            {formatPct(crop.x)} · {formatPct(crop.y)}
          </div>
          {px && (
            <div className="font-mono text-[11px] tabular-nums text-kumo-subtle">
              {px.x} · {px.y} px
            </div>
          )}
        </div>
        <div className="bg-kumo-recessed px-3 py-2">
          <div className="text-[10px] font-medium uppercase tracking-wide text-kumo-subtle">
            Size (pct)
          </div>
          <div className="mt-0.5 font-mono text-xs tabular-nums">
            {formatPct(crop.width)} × {formatPct(crop.height)}
          </div>
          {px && (
            <div className="font-mono text-[11px] tabular-nums text-kumo-subtle">
              {px.w} × {px.h} px
            </div>
          )}
        </div>
        <div className="bg-kumo-recessed px-3 py-2">
          <div className="text-[10px] font-medium uppercase tracking-wide text-kumo-subtle">
            End (pct)
          </div>
          <div className="mt-0.5 font-mono text-xs tabular-nums">
            {formatPct(crop.x + crop.width)} · {formatPct(crop.y + crop.height)}
          </div>
          {px && (
            <div className="font-mono text-[11px] tabular-nums text-kumo-subtle">
              {px.x2} · {px.y2} px
            </div>
          )}
        </div>
        <div className="bg-kumo-recessed px-3 py-2">
          <div className="text-[10px] font-medium uppercase tracking-wide text-kumo-subtle">
            FFmpeg
          </div>
          <div className="mt-0.5 font-mono text-[11px] leading-4 tabular-nums text-kumo-subtle">
            {hasSource && px
              ? `crop=${px.w}:${px.h}:${px.x}:${px.y}`
              : `crop=${crop.width.toFixed(1)}%:${crop.height.toFixed(1)}%:${crop.x.toFixed(1)}%:${crop.y.toFixed(1)}%`}
          </div>
        </div>
      </div>

      {/* Hint — operational, not decorative */}
      <div className="flex items-center gap-1.5 border-t border-kumo-hairline px-3 py-2 text-[11px] leading-none text-kumo-subtle">
        <SlidersHorizontal className="size-3 shrink-0" aria-hidden />
        {isCropMode ? (
          <span>
            Drag the rectangle to move · drag handles to resize · aspect lock in
            sidebar
          </span>
        ) : (
          <span>Click “Edit crop” to adjust the rectangle on the video</span>
        )}
      </div>
    </div>
  );
}

// ===========================================================================
// Page
// ===========================================================================
const PageEditorCrop: React.FC = () => {
  const {
    isSidebarOpen,
    file,
    mediaUrl,
    uploadStatus,
    sourceWidth,
    sourceHeight,
  } = useVideoState() as unknown as {
    isSidebarOpen: boolean;
    file: File | null;
    mediaUrl: string | null;
    uploadStatus: string;
    sourceWidth: number;
    sourceHeight: number;
  };

  const hasVideo = !!file && !!mediaUrl;
  const fileName = file?.name ?? "";
  // Keep sanitization trivial — no cache, single call, cheap.
  const sanitized = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  void sanitized;

  const sourceLabel =
    sourceWidth && sourceHeight ? `${sourceWidth} × ${sourceHeight} px` : "—";

  if (!hasVideo) {
    return (
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-1.5">
          <h2 className="text-base font-semibold leading-none tracking-normal">
            Crop editor
          </h2>
          <p className="max-w-prose text-sm leading-5 text-kumo-subtle">
            Trim, crop and export your video. Select aspect ratio and fine-tune
            the crop area. Non-destructive edits, original file untouched.
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
              <span aria-hidden className="text-kumo-hairline">
                ·
              </span>
              <span className="tabular-nums">Exports to ~/ffmpego_edits</span>
            </div>
          </CardContent>
        </Card>

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

        <div className="rounded-lg border border-dashed border-kumo-line bg-kumo-recessed p-4">
          <div className="flex items-center gap-2 text-xs font-medium text-kumo-subtle">
            <Monitor className="size-3.5" aria-hidden />
            Crop preview
            <span className="font-mono text-[11px] tabular-nums text-kumo-subtle/70">
              · appears after upload
            </span>
          </div>
          <div className="mt-3 aspect-video rounded-md border border-kumo-hairline bg-kumo-base flex items-center justify-center">
            <span className="text-xs text-kumo-subtle">
              Drop a video to start editing
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header — tight group, sentence case */}
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-kumo-hairline pb-4">
        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold leading-none tracking-normal">
              Crop editor
            </h2>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-kumo-hairline bg-kumo-recessed px-2 py-0.5 text-[11px] font-medium leading-none text-kumo-subtle">
              <span
                className="size-1.5 rounded-full bg-kumo-brand"
                aria-hidden
              />
              non-destructive
            </span>
          </div>
          <p className="flex flex-wrap items-center gap-1.5 text-xs leading-4 text-kumo-subtle">
            <span>Trim, crop and canvas zoom</span>
            <span aria-hidden className="text-kumo-hairline">
              ·
            </span>
            <span
              className="min-w-0 truncate font-mono text-[11px] tabular-nums text-kumo-subtle"
              title={fileName}
            >
              {fileName || "untitled"}
            </span>
            <span aria-hidden className="text-kumo-hairline">
              ·
            </span>
            <span className="tabular-nums">{sourceLabel}</span>
          </p>
        </div>

        <div
          className="flex shrink-0 items-center gap-1.5 flex-wrap justify-end"
          onMouseEnter={preloadPlayer}
          onFocus={preloadPlayer}
        >
          <UploadOtherButtonCrop />
        </div>
      </header>

      {uploadStatus === "uploading" || uploadStatus === "error" ? (
        <Activity mode="visible">
          <div className="rounded-md border border-kumo-hairline bg-kumo-recessed p-3">
            <UploadProgress />
          </div>
        </Activity>
      ) : null}

      {/* Workspace */}
      <div
        className={cn(
          "grid items-start gap-4",
          isSidebarOpen ? "lg:grid-cols-[minmax(0,1fr)_340px]" : "grid-cols-1",
        )}
        style={
          {
            contentVisibility: "auto",
            containIntrinsicSize: "0 520px",
          } as React.CSSProperties
        }
      >
        {/* Crop area — fresh implementation replaces the old isCropStale/cropStats strip */}
        <div className="col-span-full">
          <CropArea />
        </div>

        <div className="flex items-center justify-end col-span-full -mt-1">
          <SidebarToggle />
        </div>

        {/* Main column — player */}
        <div className="min-w-0 flex flex-col gap-3">
          <Activity mode={hasVideo ? "visible" : "hidden"}>
            <div className="rounded-lg border border-kumo-line bg-kumo-base shadow-[0_1px_2px_rgba(0,0,0,0.05)] overflow-hidden">
              <DynamicVideoPlayer />
            </div>
          </Activity>

          {!isSidebarOpen && (
            <div className="flex flex-wrap items-center gap-2 text-xs text-kumo-subtle">
              <span className="inline-flex items-center gap-1.5 rounded-md border border-kumo-hairline bg-kumo-base px-2 py-1 text-[11px] font-medium">
                <Crop className="size-3" aria-hidden />
                Crop disabled — open sidebar to enable
              </span>
              <Button
                size="sm"
                variant="secondary"
                className="h-7 rounded-md text-xs"
                onClick={() => {
                  const el = document.querySelector<HTMLButtonElement>(
                    '[aria-label="Show sidebar"]',
                  );
                  el?.click();
                }}
              >
                Show controls
                <ArrowUpRight className="size-3" aria-hidden />
              </Button>
            </div>
          )}
        </div>

        {isSidebarOpen ? (
          <div className="min-w-0">
            <Sidebar />
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default PageEditorCrop;
