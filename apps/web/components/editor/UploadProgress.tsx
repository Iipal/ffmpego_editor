"use client";

import { Progress } from "@/components/ui/progress";
import { formatFileSize } from "@/lib/video-file";
import { useVideoState } from "@/store/useVideoStore";

export function UploadProgress({ className }: { className?: string }) {
  const {
    uploadProgress,
    uploadStatus,
    uploadStage,
    uploadBytesSent,
    uploadBytesTotal,
  } = useVideoState();

  if (uploadStatus !== "uploading" && uploadStatus !== "error") {
    // Hide when idle/done; keep visible briefly after done is handled by callers if needed
    if (uploadStatus === "done" && uploadProgress === 100) return null;
    if (uploadStatus === "idle") return null;
  }

  const isError = uploadStatus === "error";
  const isUploading = uploadStatus === "uploading";
  const stageLabel =
    uploadStage === "transcode"
      ? "Uploading for export"
      : uploadStage === "metadata"
        ? "Uploading video"
        : "Uploading";

  return (
    <div
      className={
        className ??
        "space-y-2 rounded-lg border border-kumo-line bg-kumo-recessed p-3"
      }
      aria-live="polite"
      aria-busy={isUploading}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium">
          {isError ? "Upload failed" : stageLabel}
        </span>
        <span className="text-xs tabular-nums text-kumo-subtle">
          {isError ? "error" : `${Math.round(uploadProgress)}%`}
        </span>
      </div>
      <Progress
        value={isError ? 100 : uploadProgress}
        aria-label={stageLabel}
      />
      <div className="flex justify-between text-[11px] tabular-nums text-kumo-subtle">
        <span>
          {formatFileSize(uploadBytesSent)} / {formatFileSize(uploadBytesTotal)}
        </span>
        <span>{isUploading ? "Please keep this tab open" : ""}</span>
      </div>
    </div>
  );
}
