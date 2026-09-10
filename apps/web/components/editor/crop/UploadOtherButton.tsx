"use client";

import { memo } from "react";
import {
  UploadOtherButton as SharedUploadOtherButton,
  type VideoReset,
} from "../shared/UploadOtherButton";
import { stripExtension } from "@/lib/video-file";

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
    exportFilename: stripExtension(file.name),
  },
});

export const UploadOtherButtonCrop = memo(function UploadOtherButtonCrop() {
  return <SharedUploadOtherButton reset={cropReset} clearTrimCache />;
});
