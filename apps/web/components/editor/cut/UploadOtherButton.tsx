"use client";

import { memo } from "react";
import {
  UploadOtherButton as SharedUploadOtherButton,
  type VideoReset,
} from "../shared/UploadOtherButton";

const cutReset: VideoReset = () => ({
  currentTime: 0,
  duration: 0,
  isPlaying: false,
  sourceWidth: 0,
  sourceHeight: 0,
  transcodeStatus: "idle",
  transcodeProgress: 0,
  transcodeOutputPath: null,
  transcodeError: null,
});

export const UploadOtherButton = memo(function UploadOtherButton() {
  return (
    <SharedUploadOtherButton reset={cutReset} clearInputAfterPick />
  );
});
