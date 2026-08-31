import { Sidebar, SidebarToggle } from "@/components/editor/Sidebar";
import { VideoPlayer } from "@/components/editor/VideoPlayer";
import { VideoUploader } from "@/components/editor/VideoUploader";
import { UploadProgress } from "@/components/editor/UploadProgress";
import { useVideoState, useVideoStore } from "@/store/useVideoStore";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useVideoMetadataMutation } from "@/hooks/useVideoMetadata";
import { toast } from "sonner";
import React, { useRef } from "react";
import {
  ACCEPTED_VIDEO_INPUT_ATTR,
  isAcceptedVideoFile,
  isFileTooLarge,
  formatFileSize,
  MAX_UPLOAD_BYTES,
} from "@/lib/video-file";

function UploadOtherButtonCrop() {
  const inputRef = useRef<HTMLInputElement>(null);
  const videoStore = useVideoStore();
  const metadataMutation = useVideoMetadataMutation();
  const onPick = (file: File | undefined) => {
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
  };
  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_VIDEO_INPUT_ATTR}
        className="hidden"
        onChange={(e) => onPick(e.target.files?.[0])}
      />
      <Button
        size="sm"
        variant="outline"
        onClick={() => inputRef.current?.click()}
      >
        Upload other video
      </Button>
    </>
  );
}

const PageEditorCrop: React.FC = () => {
  const { isSidebarOpen, file, mediaUrl, uploadStatus } = useVideoState();
  const hasVideo = !!file && !!mediaUrl;

  if (!hasVideo) {
    return (
      <div className="space-y-4">
        <Card className="p-6">
          <h2 className="text-base font-semibold">Crop Editor</h2>
          <p className="text-sm text-kumo-subtle mt-1">
            Trim, crop and export your video. Select aspect ratio and fine-tune
            the crop area.
          </p>
          <div className="mt-6">
            <VideoUploader />
          </div>
        </Card>
        <Card className="p-4 opacity-60">
          <div className="aspect-video rounded-lg bg-kumo-recessed flex items-center justify-center text-xs text-kumo-subtle">
            Crop preview will appear once a video is loaded
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">Crop Editor</h2>
          <p className="text-xs text-kumo-subtle">
            Static 16:9 → custom · Trim, crop and canvas zoom · Non-destructive
          </p>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap justify-end">
          <UploadOtherButtonCrop />
          {isSidebarOpen ? null : <SidebarToggle />}
        </div>
      </div>
      {(uploadStatus === "uploading" || uploadStatus === "error") && (
        <UploadProgress />
      )}

      <div
        className={
          isSidebarOpen
            ? "grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem] items-start"
            : "space-y-2"
        }
      >
        {!isSidebarOpen && (
          <div className="flex justify-end">
            <SidebarToggle />
          </div>
        )}
        <VideoPlayer />
        {isSidebarOpen && <Sidebar />}
      </div>
    </div>
  );
};

export default PageEditorCrop;
