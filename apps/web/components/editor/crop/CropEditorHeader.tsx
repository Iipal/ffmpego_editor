"use client";

import { useSelector } from "@tanstack/react-store";
import { sourceStore } from "@/store/sourceSlice";
import {
  UploadOtherButton as SharedUploadOtherButton,
  type VideoReset,
} from "../shared/UploadOtherButton";
import { preloadPlayer } from "./VideoPlayerLazy";
import { videoFileService } from "@/lib/video-file";

const cropReset: VideoReset = (_prev, file): ReturnType<VideoReset> => ({
  crop: {
    crop: { x: 0, y: 0, width: 100, height: 100 },
    aspectRatio: "custom",
    canvasOffset: { x: 0, y: 0 },
    canvasZoom: 1,
    isCropMode: false,
  },
  source: {
    audioCodec: null,
    currentTime: 0,
    duration: 0,
    isPlaying: false,
    trimRange: [0, 0],
    bitrateKbps: 0,
    containerFormat: null,
    ffprobeReport: null,
    sourceAspectRatio: 1,
    sourceWidth: 0,
    sourceHeight: 0,
    sourceFrameRate: 0,
    videoCodec: null,
  },
  cut: {
    exportFilename: videoFileService.stripExtension(file.name),
  },
});

export function CropEditorHeader() {
  const { file, sourceWidth, sourceHeight } = useSelector(sourceStore);

  const fileName = file?.name ?? "";
  // Keep sanitization trivial — no cache, single call, cheap.
  const sanitized = videoFileService.sanitizeFilename(fileName);
  void sanitized;

  const sourceLabel =
    sourceWidth && sourceHeight ? `${sourceWidth} × ${sourceHeight} px` : "—";

  return (
    <header className="flex flex-wrap items-start justify-between gap-3 border-b border-kumo-hairline pb-4">
      <div className="flex min-w-0 flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-semibold leading-none tracking-normal">
            Crop editor
          </h2>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-kumo-hairline bg-kumo-recessed px-2 py-0.5 text-[11px] font-medium leading-none text-kumo-subtle">
            <span className="size-1.5 rounded-full bg-kumo-brand" aria-hidden />
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
        <SharedUploadOtherButton reset={cropReset} clearTrimCache />
      </div>
    </header>
  );
}
