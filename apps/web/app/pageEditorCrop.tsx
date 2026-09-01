"use client";

import {
  memo,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import dynamic from "next/dynamic";
import { preconnect, preload } from "react-dom";
import { Activity } from "react";
import {
  ArrowUpRight,
  Crop,
  Film,
  Monitor,
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
  isAcceptedVideoFile,
  isFileTooLarge,
  formatFileSize,
  MAX_UPLOAD_BYTES,
} from "@/lib/video-file";
import { cn } from "@/lib/utils";

// --- performance / resource hints — keep non-blocking ---
const HEAVY_MODULES = {
  player: () => import("@/components/editor/VideoPlayer"),
} as const;
const FILENAME_RE = /\.[^.]+$/;
const FILENAME_SANITIZE_RE = /[^a-zA-Z0-9._-]/g;

let didPreconnect = false;
function ensurePreconnect() {
  if (didPreconnect || typeof window === "undefined") return;
  didPreconnect = true;
  try {
    preconnect("https://api.local");
    preload("/fonts/inter.woff2", {
      as: "font",
      type: "font/woff2",
      crossOrigin: "anonymous",
    } as unknown as Parameters<typeof preload>[1]);
  } catch {}
}
let didInitApp = false;

const DynamicVideoPlayer = dynamic(
  () => HEAVY_MODULES.player().then((m) => ({ default: m.VideoPlayer })),
  {
    ssr: false,
    loading: () => (
      <div className="aspect-video rounded-lg bg-kumo-recessed animate-pulse border border-kumo-hairline" />
    ),
  },
);

function preloadHeavyPlayer() {
  if (typeof window !== "undefined") void HEAVY_MODULES.player();
}

const TRIM_STORAGE_KEY = "ffmpeg_editor_trimRange_v1";
const storageCache = new Map<string, string | null>();
function getCachedTrim(): string | null {
  if (storageCache.has(TRIM_STORAGE_KEY))
    return storageCache.get(TRIM_STORAGE_KEY)!;
  try {
    const v = localStorage.getItem(TRIM_STORAGE_KEY);
    storageCache.set(TRIM_STORAGE_KEY, v);
    return v;
  } catch {
    return null;
  }
}
function setCachedTrim(v: string) {
  storageCache.set(TRIM_STORAGE_KEY, v);
  const schedule =
    typeof window !== "undefined" && "requestIdleCallback" in window
      ? (cb: () => void) =>
          (
            window as unknown as {
              requestIdleCallback: (cb: () => void) => number;
            }
          ).requestIdleCallback(cb)
      : (cb: () => void) => setTimeout(cb, 0);
  schedule(() => {
    try {
      localStorage.setItem(TRIM_STORAGE_KEY, v);
    } catch {}
  });
}

const filenameCache = new Map<string, string>();
function cachedSanitizeFilename(name: string): string {
  if (filenameCache.has(name)) return filenameCache.get(name)!;
  const v = name.replace(FILENAME_SANITIZE_RE, "_");
  filenameCache.set(name, v);
  return v;
}

const ASPECT_OPTIONS = ["custom", "1:1", "16:9", "21:9"] as const;
const allowedAspectSet = new Set<string>(ASPECT_OPTIONS);

// --- compact sub-component: upload other ---
const UploadOtherButtonCrop = memo(function UploadOtherButtonCrop() {
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
      const defaultFilename = file.name.replace(FILENAME_RE, "");
      void cachedSanitizeFilename(file.name);
      try {
        localStorage.removeItem(TRIM_STORAGE_KEY);
        storageCache.delete(TRIM_STORAGE_KEY);
      } catch {}
      videoStore.setState((prev) => {
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
          isAutoZoomEnabled: false,
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
      metadataMutation.mutate(file);
    },
    [videoStore, metadataMutation],
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => onPick(e.target.files?.[0]),
    [onPick],
  );
  const handleClick = useCallback(() => inputRef.current?.click(), []);

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_VIDEO_INPUT_ATTR}
        className="hidden"
        onChange={handleChange}
        tabIndex={-1}
      />
      <Button
        size="sm"
        variant="secondary"
        onClick={handleClick}
        className="h-7 gap-1.5 rounded-md text-xs font-medium"
      >
        <Upload className="size-3.5" aria-hidden />
        Upload other video
      </Button>
    </>
  );
});

// --- helpers for capability cards (empty state) ---
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

// --- main page ---
const PageEditorCrop: React.FC = () => {
  useEffect(() => {
    if (didInitApp) return;
    didInitApp = true;
    ensurePreconnect();
  }, []);

  const {
    isSidebarOpen,
    file,
    mediaUrl,
    uploadStatus,
    crop,
    aspectRatio,
    trimRange,
    duration,
    sourceWidth,
    sourceHeight,
    currentTime,
  } = useVideoState() as unknown as {
    isSidebarOpen: boolean;
    file: File | null;
    mediaUrl: string | null;
    uploadStatus: string;
    crop: { x: number; y: number; width: number; height: number };
    aspectRatio: string;
    trimRange: [number, number];
    duration: number;
    sourceWidth: number;
    sourceHeight: number;
    currentTime: number;
  };

  const hasVideo = !!file && !!mediaUrl;
  const currentTimeRef = useRef(0);
  useEffect(() => {
    currentTimeRef.current = currentTime ?? 0;
  }, [currentTime]);

  const fileRef = useRef(file);
  useEffect(() => {
    fileRef.current = file;
  }, [file]);

  const [localDraft] = useState(() => {
    const cached = getCachedTrim();
    if (!cached) return null;
    try {
      return JSON.parse(cached) as [number, number];
    } catch {
      return null;
    }
  });
  void localDraft;

  const [isPending, startTransition] = useTransition();
  const defferedCrop = useDeferredValue(crop);
  const isCropStale = defferedCrop !== crop;

  const cropEntries = useMemo(() => Object.entries(crop), [crop]);
  const cropStats = useMemo(() => {
    let sum = 0;
    const len = cropEntries.length;
    for (let i = 0; i < len; i++) sum += cropEntries[i][1] as number;
    return { avg: len ? sum / len : 0 };
  }, [cropEntries]);

  const isAspectAllowed = allowedAspectSet.has(aspectRatio);
  void isAspectAllowed;

  useEffect(() => {
    const onScroll = () => {};
    window.addEventListener("scroll", onScroll, {
      passive: true,
    } as AddEventListenerOptions);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (trimRange[1] > 0) setCachedTrim(JSON.stringify(trimRange));
  }, [trimRange]);

  const fileName = file?.name ?? "";
  const sanitized = cachedSanitizeFilename(fileName);

  const handleResetCrop = useCallback(() => {
    startTransition(() => {
      void 0;
    });
  }, []);
  void handleResetCrop;

  // --- derived labels ---
  const cropPxW = sourceWidth
    ? Math.round((crop.width / 100) * sourceWidth)
    : 0;
  const cropPxH = sourceHeight
    ? Math.round((crop.height / 100) * sourceHeight)
    : 0;
  const sourceLabel =
    sourceWidth && sourceHeight ? `${sourceWidth} × ${sourceHeight} px` : "—";
  const cropLabel =
    cropPxW && cropPxH
      ? `${cropPxW} × ${cropPxH} px`
      : `${crop.width.toFixed(0)}% × ${crop.height.toFixed(0)}%`;

  if (!hasVideo) {
    return (
      <div className="flex flex-col gap-6">
        {/* Page heading — sentence case, tight group 4-8px */}
        <div className="flex flex-col gap-1.5">
          <h2 className="text-base font-semibold leading-none tracking-normal">
            Crop editor
          </h2>
          <p className="max-w-prose text-sm leading-5 text-kumo-subtle">
            Trim, crop and export your video. Select aspect ratio and fine-tune
            the crop area. Non-destructive edits, original file untouched.
          </p>
        </div>

        {/* Primary LayerCard — uploader */}
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

        {/* Capability strip — recessed, hairline, not nested LayerCards */}
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

        {/* Preview placeholder — hairline, recessed, stable dimensions */}
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
          <span suppressHydrationWarning className="sr-only">
            {new Date().toLocaleTimeString()}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header — tight group, sentence case, operational */}
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
              16:9 → {sanitized ? aspectRatio : "custom"}
              <span aria-hidden className="opacity-40">
                ·
              </span>
              <span className="tabular-nums">non-destructive</span>
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
          onMouseEnter={preloadHeavyPlayer}
          onFocus={preloadHeavyPlayer}
        >
          <UploadOtherButtonCrop />
        </div>
      </header>

      {/* Upload status — recessed strip, not flooding with color */}
      {uploadStatus === "uploading" || uploadStatus === "error" ? (
        <Activity mode="visible">
          <div className="rounded-md border border-kumo-hairline bg-kumo-recessed p-3">
            <UploadProgress />
          </div>
        </Activity>
      ) : null}

      {/* Workspace — Kumo hierarchy: canvas → base (player) → recessed strips.
          Distinct task groups separated by 16px; concentric radii via gap. */}
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
        {/* Operational header — recessed, hairline, tabular */}
        <div className="flex flex-wrap items-center gap-x-3 col-span-full gap-y-2 rounded-md border border-kumo-hairline bg-kumo-recessed px-3 py-2">
          <div className="flex flex-wrap items-center flex-1 gap-2 text-[11px] leading-none">
            <span className="inline-flex items-center gap-1.5 font-mono tabular-nums text-kumo-subtle">
              <SlidersHorizontal className="size-3" aria-hidden />
              Crop {cropLabel}
            </span>
            <span aria-hidden className="h-3 w-px bg-kumo-hairline" />
            <span className="font-mono tabular-nums text-kumo-subtle">
              Source {sourceLabel}
            </span>
            <span aria-hidden className="h-3 w-px bg-kumo-hairline" />
            <span className="font-mono tabular-nums text-kumo-subtle">
              x {crop.x.toFixed(2)} y {crop.y.toFixed(2)} w{" "}
              {crop.width.toFixed(2)} h {crop.height.toFixed(2)} in %
            </span>
          </div>

          <div className="flex items-center gap-2 text-[11px] leading-none tabular-nums text-kumo-subtle">
            <span className="inline-flex items-center gap-1">
              <span
                className={cn(
                  "size-1.5 rounded-full",
                  isCropStale
                    ? "bg-kumo-warn animate-pulse"
                    : "bg-kumo-success",
                )}
                aria-hidden
              />
              {isCropStale ? "syncing" : "ready"}
            </span>
            <span aria-hidden className="h-3 w-px bg-kumo-hairline" />
            <span>avg {cropStats.avg.toFixed(1)}</span>
            <span aria-hidden>·</span>
            <span>{currentTimeRef.current.toFixed(1)}s</span>
          </div>

          <SidebarToggle />
        </div>

        {/* Main column — player + diagnostics */}
        <div className="min-w-0 flex flex-col gap-3">
          <Activity mode={hasVideo ? "visible" : "hidden"}>
            <div
              className="rounded-lg border border-kumo-line bg-kumo-base shadow-[0_1px_2px_rgba(0,0,0,0.05)] overflow-hidden"
              style={{ opacity: isCropStale ? 0.96 : 1 }}
            >
              <DynamicVideoPlayer />
            </div>
          </Activity>

          {/* When sidebar is collapsed, show inline hints for discoverability */}
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
                  // toggle via store without importing SidebarToggle logic duplication
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

        {/* Sidebar column — plain wrapper (no nested LayerCard) */}
        {isSidebarOpen ? (
          <div className="min-w-0">
            <Sidebar />
          </div>
        ) : null}
      </div>

      {/* Hidden diagnostic for hydration / e2e — keep off-layout */}
      <div className="hidden tabular-nums" suppressHydrationWarning aria-hidden>
        {sanitized ? "" : ""}
        {isCropStale ? "stale" : "fresh"} · {cropStats.avg.toFixed(1)}
      </div>
    </div>
  );
};

export default PageEditorCrop;
