"use client";

import { memo } from "react";
import {
  UploadOtherButton as SharedUploadOtherButton,
  type VideoReset,
} from "../shared/UploadOtherButton";
import { stripExtension } from "@/lib/video-file";

const cropReset: VideoReset = (_prev, file) => ({
  currentTime: 0,
  duration: 0,
  isPlaying: false,
  trimRange: [0, 0] as [number, number],
  crop: { x: 0, y: 0, width: 100, height: 100 },
  aspectRatio: "custom" as const,
  isCropMode: false,
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
  exportFilename: stripExtension(file.name),
  transcodeStatus: "idle" as const,
  transcodeProgress: 0,
  transcodeOutputPath: null,
  transcodeError: null,
});

export const UploadOtherButtonCrop = memo(function UploadOtherButtonCrop() {
  return <SharedUploadOtherButton reset={cropReset} clearTrimCache />;
});
