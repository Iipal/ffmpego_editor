"use client";

import { memo } from "react";
import {
  UploadOtherButton as SharedUploadOtherButton,
  type VideoReset,
} from "../shared/UploadOtherButton";

const mobileReset: VideoReset = () => ({
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
  transcodeStatus: "idle",
  transcodeProgress: 0,
  transcodeOutputPath: null,
  transcodeError: null,
});

export const UploadOtherButton = memo(function UploadOtherButton() {
  return <SharedUploadOtherButton reset={mobileReset} />;
});
