"use client";

import { memo, useCallback, useRef } from "react";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useVideoStore, type VideoState } from "@/store/useVideoStore";
import { useVideoMetadataMutation } from "@/hooks/useVideoMetadata";
import { toast } from "sonner";
import {
  ACCEPTED_VIDEO_INPUT_ATTR,
  formatFileSize,
  isAcceptedVideoFile,
  isFileTooLarge,
  MAX_UPLOAD_BYTES,
} from "@/lib/video-file";

// Shared "upload other video" button. Deduped from crop / cut / mobile copies
// (identical UI + validation, only the store reset differed).
// Each feature passes its own reset; behavior is preserved verbatim.

export type VideoReset = (
  prev: VideoState,
  file: File,
  mediaUrl: string,
) => Partial<VideoState>;

export function validateVideoFile(file: File | undefined): file is File {
  if (!file) return false;
  if (!isAcceptedVideoFile(file)) {
    toast.error("Unsupported format. Use MP4/WebM/MOV/MKV (Matroska)");
    return false;
  }
  if (isFileTooLarge(file)) {
    toast.error(
      `File too large (${formatFileSize(file.size)}). Max ${formatFileSize(MAX_UPLOAD_BYTES)}.`,
    );
    return false;
  }
  return true;
}

export const UploadOtherButton = memo(function UploadOtherButton({
  reset,
  clearTrimCache = false,
  clearInputAfterPick = false,
  label = "Upload other video",
}: {
  reset: VideoReset;
  clearTrimCache?: boolean;
  clearInputAfterPick?: boolean;
  label?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const videoStore = useVideoStore();
  const metadataMutation = useVideoMetadataMutation();

  const onPick = useCallback(
    (file: File | undefined) => {
      if (!validateVideoFile(file)) return;
      const mediaUrl = URL.createObjectURL(file);
      if (clearTrimCache) {
        try {
          localStorage.removeItem("ffmpeg_editor_trimRange_v1");
        } catch {}
      }
      videoStore.setState((prev) => {
        if (prev.mediaUrl) URL.revokeObjectURL(prev.mediaUrl);
        return { ...prev, file, mediaUrl, ...reset(prev, file, mediaUrl) };
      });
      metadataMutation.mutate(file);
    },
    [videoStore, metadataMutation, reset, clearTrimCache],
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
        {label}
      </Button>
    </>
  );
});
