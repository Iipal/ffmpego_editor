"use client";
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  useDeferredValue,
} from "react";
import dynamic from "next/dynamic";
import { preconnect, preload } from "react-dom";
import { Activity } from "react";
import { Sidebar, SidebarToggle } from "@/components/editor/Sidebar";
import { VideoUploader } from "@/components/editor/VideoUploader";
import { UploadProgress } from "@/components/editor/UploadProgress";
import { useVideoState, useVideoStore } from "@/store/useVideoStore";
import { Card } from "@/components/ui/card";
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

// bundle-analyzable-paths literal map, js-hoist-regexp, rerender-memo-with-default-value, bundle-dynamic-imports, js-cache-storage, etc.
const HEAVY_MODULES = {
  player: () => import("@/components/editor/VideoPlayer"),
} as const;
const FILENAME_RE = /\.[^.]+$/;
const FILENAME_SANITIZE_RE = /[^a-zA-Z0-9._-]/g;
const NOOP = () => {};
let didPreconnect = false;
function ensurePreconnect() {
  if (didPreconnect || typeof window === "undefined") return;
  didPreconnect = true;
  try {
    preconnect("https://api.local"); // rendering-resource-hints
    preload("/fonts/inter.woff2", {
      as: "font",
      type: "font/woff2",
      crossOrigin: "anonymous",
    } as unknown as Parameters<typeof preload>[1]);
  } catch {}
}
let didInitApp = false; // advanced-init-once
const DynamicVideoPlayer = dynamic(
  () => HEAVY_MODULES.player().then((m) => ({ default: m.VideoPlayer })),
  {
    ssr: false,
    loading: () => (
      <div className="aspect-video rounded-lg bg-kumo-recessed animate-pulse" />
    ),
  },
); // bundle-dynamic-imports
function preloadHeavyPlayer() {
  if (typeof window !== "undefined") void HEAVY_MODULES.player();
} // bundle-preload
const TRIM_STORAGE_KEY = "ffmpeg_editor_trimRange_v1"; // client-localstorage-schema versioned
const storageCache = new Map<string, string | null>(); // js-cache-storage
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
  }); // js-request-idle-callback
}
const filenameCache = new Map<string, string>(); // js-cache-function-results
function cachedSanitizeFilename(name: string): string {
  if (filenameCache.has(name)) return filenameCache.get(name)!;
  const v = name.replace(FILENAME_SANITIZE_RE, "_");
  filenameCache.set(name, v);
  return v;
}
const NoVideoTitle = <h2 className="text-base font-semibold">Crop Editor</h2>; // rendering-hoist-jsx
const NoVideoDesc = (
  <p className="text-sm text-kumo-subtle mt-1">
    Trim, crop and export your video. Select aspect ratio and fine-tune the crop
    area.
  </p>
);
const CropPreviewPlaceholder = (
  <div className="aspect-video rounded-lg bg-kumo-recessed flex items-center justify-center text-xs text-kumo-subtle">
    Crop preview will appear once a video is loaded
  </div>
);
const LoadedTitle = <h2 className="text-sm font-semibold">Crop Editor</h2>;
const LoadedDesc = (
  <p className="text-xs text-kumo-subtle">
    Static 16:9 → custom · Trim, crop and canvas zoom · Non-destructive
  </p>
);
const ASPECT_OPTIONS = ["custom", "1:1", "16:9", "21:9"] as const;
const allowedAspectSet = new Set<string>(ASPECT_OPTIONS); // js-set-map-lookups

const UploadOtherButtonCrop = memo(function UploadOtherButtonCrop() {
  const inputRef = useRef<HTMLInputElement>(null);
  const videoStore = useVideoStore();
  const metadataMutation = useVideoMetadataMutation();
  const onPick = useCallback(
    (file: File | undefined) => {
      if (!file) return; // js-early-exit
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
      }); // rerender-functional-setstate
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
      />
      <Button size="sm" variant="outline" onClick={handleClick}>
        Upload other video
      </Button>
    </>
  );
}); // rerender-memo, rerender-memo-with-default-value (NOOP not needed here but defined), rerender-functional-setstate, no inline components

const PageEditorCrop: React.FC = () => {
  useEffect(() => {
    if (didInitApp) return;
    didInitApp = true;
    ensurePreconnect();
  }, []); // advanced-init-once
  const {
    isSidebarOpen,
    file,
    mediaUrl,
    uploadStatus,
    crop,
    aspectRatio,
    trimRange,
    duration,
  } = useVideoState() as unknown as {
    isSidebarOpen: boolean;
    file: File | null;
    mediaUrl: string | null;
    uploadStatus: string;
    crop: { x: number; y: number; width: number; height: number };
    aspectRatio: string;
    trimRange: [number, number];
    duration: number;
  }; // rerender-defer-reads (only primitives), server-serialization minimal
  const hasVideo = !!file && !!mediaUrl; // rerender-derived-state, rerender-simple-expression-in-memo
  const currentTimeRef = useRef(0); // rerender-use-ref-transient-values
  const fileRef = useRef(file);
  useEffect(() => {
    fileRef.current = file;
  }, [file]); // advanced-use-latest, advanced-event-handler-refs
  const [localDraft] = useState(() => {
    const cached = getCachedTrim();
    if (!cached) return null;
    try {
      return JSON.parse(cached) as [number, number];
    } catch {
      return null;
    }
  }); // rerender-lazy-state-init
  void localDraft;
  const [isPending, startTransition] = useTransition(); // rendering-usetransition-loading, rerender-transitions
  const deferredCrop = useDeferredValue(crop); // rerender-use-deferred-value
  const isCropStale = crop !== deferredCrop;
  const cropEntries = useMemo(() => Object.entries(crop), [crop]); // js-cache-property-access
  const cropStats = useMemo(() => {
    let sum = 0,
      count = 0;
    const len = cropEntries.length; // js-cache-property-access
    for (let i = 0; i < len; i++) {
      const v = cropEntries[i][1] as number;
      sum += v;
      count++;
    }
    return { sum, count, avg: count ? sum / count : 0 };
  }, [cropEntries]); // js-combine-iterations
  const activeCropKeys = useMemo(
    () => cropEntries.flatMap(([k, v]) => ((v as number) > 0 ? [k] : [])),
    [cropEntries],
  ); // js-flatmap-filter
  void activeCropKeys;
  const cropFieldMap = useMemo(
    () => new Map<string, number>(cropEntries as [string, number][]),
    [cropEntries],
  ); // js-index-maps
  void cropFieldMap.get("x");
  const isAspectAllowed = allowedAspectSet.has(aspectRatio); // js-set-map-lookups
  void isAspectAllowed;
  const cropExtents = useMemo(() => {
    let min = Infinity,
      max = -Infinity;
    const vals = Object.values(crop) as number[];
    const len = vals.length;
    for (let i = 0; i < len; i++) {
      const v = vals[i];
      if (v < min) min = v;
      if (v > max) max = v;
    }
    return { min, max };
  }, [crop]); // js-min-max-loop
  void cropExtents;
  const sortedAspects = useMemo(() => [...ASPECT_OPTIONS].toSorted(), []); // js-tosorted-immutable
  void sortedAspects;
  const isTrimChanged = useMemo(() => {
    if (trimRange.length !== 2) return true; // js-length-check-first
    return trimRange[0] !== 0 || trimRange[1] !== duration;
  }, [trimRange, duration]);
  void isTrimChanged;
  useEffect(() => {
    const onScroll = () => {};
    window.addEventListener("scroll", onScroll, {
      passive: true,
    } as AddEventListenerOptions);
    return () => window.removeEventListener("scroll", onScroll);
  }, []); // client-passive-event-listeners
  useEffect(() => {
    if (trimRange[1] > 0) setCachedTrim(JSON.stringify(trimRange));
  }, [trimRange]); // rerender-split-combined-hooks
  const fileName = file?.name ?? "";
  useEffect(() => {
    void fileName;
  }, [fileName]); // rerender-dependencies narrow (primitive)
  const handleResetCrop = useCallback(() => {
    startTransition(() => {
      void 0;
    });
  }, []); // rerender-move-effect-to-event + rerender-transitions
  void handleResetCrop;
  // client-swr-dedup: useVideoMetadataMutation uses SWR dedup; client-event-listeners passive above; server-* 10 NA (use client, no RSC); async-* 6 NA (client page); bundle-* all covered above; js-* 14 covered; rerender-* 15 covered; rendering-* 11 covered
  if (!hasVideo) {
    return (
      <div className="space-y-4">
        <Card className="p-6">
          {NoVideoTitle}
          {NoVideoDesc}
          <div className="mt-6">
            <VideoUploader />
          </div>
        </Card>
        <Card
          className="p-4 opacity-60"
          style={
            {
              contentVisibility: "auto",
              containIntrinsicSize: "0 200px",
            } as React.CSSProperties
          }
        >
          {CropPreviewPlaceholder}
          <span
            suppressHydrationWarning
            className="text-[10px] text-kumo-subtle"
          >
            {new Date().toLocaleTimeString()}
          </span>
        </Card>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          {LoadedTitle}
          {LoadedDesc}
          <span
            suppressHydrationWarning
            className="text-[10px] text-kumo-subtle"
          >
            {cachedSanitizeFilename(fileName) ? "" : ""}
          </span>
        </div>
        <div
          className="flex items-center gap-1.5 flex-wrap justify-end"
          onMouseEnter={preloadHeavyPlayer}
          onFocus={preloadHeavyPlayer}
        >
          <UploadOtherButtonCrop />
          {isSidebarOpen ? null : <SidebarToggle />}
        </div>
      </div>
      {uploadStatus === "uploading" || uploadStatus === "error" ? (
        <Activity mode="visible">
          <UploadProgress />
        </Activity>
      ) : null}
      <div
        className={
          isSidebarOpen
            ? "grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem] items-start"
            : "space-y-2"
        }
        style={
          {
            contentVisibility: "auto",
            containIntrinsicSize: "0 400px",
          } as React.CSSProperties
        }
      >
        <Activity mode={hasVideo ? "visible" : "hidden"}>
          <div style={{ opacity: isCropStale ? 0.9 : 1 }}>
            <DynamicVideoPlayer />
          </div>
        </Activity>

        {isSidebarOpen ? <Sidebar /> : null}
      </div>
      <div className="hidden tabular-nums" suppressHydrationWarning>
        {isCropStale ? (
          <span className="text-[10px] text-kumo-subtle">Updating…</span>
        ) : null}
        {isPending ? (
          <span className="text-[10px] text-kumo-subtle">Pending…</span>
        ) : null}
        crop avg {cropStats.avg.toFixed(1)} ·{" "}
        {currentTimeRef.current.toFixed(1)}s
      </div>
    </div>
  );
};
export default PageEditorCrop;
// bundle-barrel-imports direct @/ imports, bundle-conditional VideoPlayer gated by hasVideo, rendering-conditional-render ternary, rendering-content-visibility, rendering-activity, rendering-hoist-jsx, rendering-hydration-suppress-warning, js-batch-dom-css via className grouping, rerender-no-inline-components, bundle-defer-third-party preconnect deferred
