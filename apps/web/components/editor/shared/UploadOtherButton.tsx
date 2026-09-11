"use client";

import { memo, useCallback, useRef } from "react";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  sourceStore,
  setSourceState,
  type SourceSlice,
} from "@/store/sourceSlice";
import { cropStore, setCropState, type CropSlice } from "@/store/cropSlice";
import { cutStore, setCutState, type CutSlice } from "@/store/cutSlice";
import {
  subtitleStore,
  setSubtitleState,
  type SubtitleSlice,
} from "@/store/subtitleSlice";
import { useVideoMetadataMutation } from "@/hooks/useVideoMetadata";
import { resetPlayheadTime } from "@/store/playheadSlice";
import { toast } from "sonner";
import { VideoFileService, videoFileService } from "@/lib/video-file";
import { storageJSON } from "@/lib/storage-json";

// Shared "upload other video" button. Deduped from crop / cut / mobile copies
// (identical UI + validation, only the store reset differed).
// Each feature passes its own reset; behavior is preserved verbatim.

export type VideoReset = (
  prev: {
    source: SourceSlice;
    crop: CropSlice;
    cut: CutSlice;
    subtitle: SubtitleSlice;
  },
  file: File,
  mediaUrl: string,
) => {
  source?: Partial<SourceSlice>;
  crop?: Partial<CropSlice>;
  cut?: Partial<CutSlice>;
  subtitle?: Partial<SubtitleSlice>;
};

export function validateVideoFile(file: File | undefined): file is File {
  if (!file) return false;
  if (!videoFileService.isAcceptedVideoFile(file)) {
    toast.error("Unsupported format. Use MP4/WebM/MOV/MKV (Matroska)");
    return false;
  }
  if (videoFileService.isFileTooLarge(file)) {
    toast.error(
      `File too large (${videoFileService.formatFileSize(file.size)}). Max ${videoFileService.formatFileSize(VideoFileService.MAX_UPLOAD_BYTES)}.`,
    );
    return false;
  }
  return true;
}

export const UploadOtherButton = memo(function UploadOtherButton({
  reset,
  clearTrimCache = false,
  clearInputAfterPick = false,
}: {
  reset: VideoReset;
  clearTrimCache?: boolean;
  clearInputAfterPick?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const metadataMutation = useVideoMetadataMutation();

  const { mutate: requestMetadata } = metadataMutation;

  const onPick = useCallback(
    async (file: File | undefined) => {
      if (!validateVideoFile(file)) return;
      const mediaUrl = URL.createObjectURL(file);

      if (clearTrimCache) {
        storageJSON.remove("ffmpego:trim_range");
      }

      const previous = {
        source: sourceStore.state,
        crop: cropStore.state,
        cut: cutStore.state,
        subtitle: subtitleStore.state,
      };
      const resetState = reset(previous, file, mediaUrl);

      setSourceState((prev) => {
        if (prev.mediaUrl) URL.revokeObjectURL(prev.mediaUrl);
        return { ...prev, file, mediaUrl, ...(resetState.source || {}) };
      });
      setCropState((prev) => ({ ...prev, ...(resetState.crop || {}) }));
      setCutState((prev) => ({ ...prev, ...(resetState.cut || {}) }));
      setSubtitleState((prev) => ({ ...prev, ...(resetState.subtitle || {}) }));
      resetPlayheadTime(resetState.source?.currentTime ?? 0);
      requestMetadata(file);
    },
    [requestMetadata, reset, clearTrimCache],
  );

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={VideoFileService.ACCEPTED_VIDEO_INPUT_ATTR}
        className="hidden"
        tabIndex={-1}
        onChange={(e) => {
          onPick(e.target.files?.[0]);
          if (clearInputAfterPick) e.target.value = "";
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
