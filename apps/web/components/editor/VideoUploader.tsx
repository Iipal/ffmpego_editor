"use client";

import { useCallback, useRef, useState } from "react";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useVideoMetadataMutation } from "@/hooks/useVideoMetadata";
import { cn } from "@/lib/utils";
import { useVideoStore } from "@/store/useVideoStore";
import { useTheme } from "@/providers/ThemeProvider";

const acceptedTypes = new Set(["video/mp4", "video/webm", "video/quicktime"]);

export function VideoUploader() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const { theme } = useTheme();
  const videoStore = useVideoStore();
  const metadataMutation = useVideoMetadataMutation();

  const selectFile = useCallback(
    (file: File | undefined) => {
      if (!file || !acceptedTypes.has(file.type)) {
        return;
      }

      const mediaUrl = URL.createObjectURL(file);
      videoStore.setState((previous) => {
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
          exportQuality: 23,
          playbackSpeed: 1,
          exportSpeed: 1,
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
          transcodeStatus: "idle",
          transcodeProgress: 0,
          transcodeOutputPath: null,
          transcodeError: null,
        };
      });
      metadataMutation.mutate(file);
    },
    [metadataMutation, videoStore],
  );

  return (
    <Card
      className={cn(
        "glass-card glass-panel-hover flex min-h-80 flex-col items-center justify-center border-2 border-dashed p-8",
        theme === "dark" && "glass-glow",
        isDragging && "border-primary bg-muted/50",
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
      <Upload className="mb-4 size-10 text-muted-foreground" />
      <p className="text-base font-medium">Drop an MP4 or WebM video here</p>
      <p className="mt-1 text-sm text-muted-foreground">or choose a file</p>
      <Input
        ref={inputRef}
        className="sr-only"
        type="file"
        accept="video/mp4,video/webm,video/quicktime"
        onChange={(event) => selectFile(event.target.files?.[0])}
      />
      <Button className="mt-5" onClick={() => inputRef.current?.click()}>
        Choose video
      </Button>
    </Card>
  );
}
