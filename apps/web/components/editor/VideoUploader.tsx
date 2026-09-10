"use client";

import { useCallback, useRef, useState } from "react";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { UploadProgress } from "@/components/editor/UploadProgress";
import { useVideoMetadataMutation } from "@/hooks/useVideoMetadata";
import { cn } from "@/lib/utils";
import { useSelector } from "@tanstack/react-store";
import { sourceStore, setSourceState } from "@/store/sourceSlice";
import { setCutState } from "@/store/cutSlice";
import { setCropState } from "@/store/cropSlice";
import { setSubtitleState } from "@/store/subtitleSlice";
import { resetPlayheadTime } from "@/store/playheadSlice";
import { VideoFileService, videoFileService } from "@/lib/video-file";
import { toast } from "sonner";

export function VideoUploader() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const { uploadStatus } = useSelector(sourceStore);
  const metadataMutation = useVideoMetadataMutation();

  const { mutate: requestMetadata } = metadataMutation;

  const selectFile = useCallback(
    (file: File | undefined) => {
      if (!file || !videoFileService.isAcceptedVideoFile(file)) {
        if (file)
          toast.error(
            `Unsupported format. Use ${VideoFileService.ACCEPTED_VIDEO_LABEL}`,
          );
        return;
      }
      if (videoFileService.isFileTooLarge(file)) {
        toast.error(
          `File too large (${videoFileService.formatFileSize(file.size)}). Max is ${videoFileService.formatFileSize(VideoFileService.MAX_UPLOAD_BYTES)}.`,
        );
        return;
      }

      const mediaUrl = URL.createObjectURL(file);
      const defaultFilename = videoFileService.stripExtension(file.name);
      setSourceState((previous) => {
        if (previous.mediaUrl) {
          URL.revokeObjectURL(previous.mediaUrl);
        }

        return {
          ...previous,
          file,
          mediaUrl,
          currentTime: 0,
          duration: 0,
          isPlaying: false,
          sourceAspectRatio: 1,
          sourceWidth: 0,
          sourceHeight: 0,
          sourceFrameRate: 0,
          containerFormat: null,
          videoCodec: null,
          audioCodec: null,
          bitrateKbps: 0,
          ffprobeReport: null,
        };
      });
      setCutState((previous) => ({
        ...previous,
        exportFilename: defaultFilename,
        exportQuality: 23,
        playbackSpeed: 1,
        exportSpeed: 1,
      }));
      setCropState((previous) => ({
        ...previous,
        canvasZoom: 1,
        canvasOffset: { x: 0, y: 0 },
      }));
      setSubtitleState((previous) => ({
        ...previous,
        subtitles: [],
        selectedSubtitleId: null,
        subtitleTrackCountExplicit: 1,
      }));
      resetPlayheadTime(0);
      requestMetadata(file);
    },
    [requestMetadata],
  );

  return (
    <Card
      className={cn(
        "flex min-h-80 flex-col items-center justify-center border border-dashed bg-kumo-base p-8 shadow-sm rounded-lg",
        isDragging ? "border-kumo-brand bg-kumo-brand/5" : "border-kumo-line",
      )}
      onDragOver={(event) => {
        event.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setIsDragging(false);
        selectFile(event.dataTransfer.files[0]);
      }}
    >
      <Upload className="mb-4 size-10 text-kumo-subtle" />
      <p className="text-base font-medium text-kumo-strong">
        Drop an MP4, WebM, MOV or MKV video here
      </p>
      <p className="mt-1 text-sm text-kumo-subtle">
        or choose a file · up to 10 GB · Matroska supported
      </p>
      <Input
        ref={inputRef}
        className="sr-only w-10"
        type="file"
        accept={VideoFileService.ACCEPTED_VIDEO_INPUT_ATTR}
        onChange={(event) => selectFile(event.target.files?.[0])}
      />
      <Button
        className="mt-5"
        onClick={() => inputRef.current?.click()}
        disabled={metadataMutation.isPending}
      >
        {metadataMutation.isPending ? "Uploading..." : "Choose video"}
      </Button>
      {(metadataMutation.isPending ||
        uploadStatus === "uploading" ||
        uploadStatus === "error") && (
        <div className="mt-6 w-full max-w-md">
          <UploadProgress />
        </div>
      )}
    </Card>
  );
}
