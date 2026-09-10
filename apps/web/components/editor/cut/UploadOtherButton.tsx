"use client";

import { memo } from "react";
import {
  UploadOtherButton as SharedUploadOtherButton,
  type VideoReset,
} from "../shared/UploadOtherButton";

const cutReset: VideoReset = (): ReturnType<VideoReset> => ({
  source: {
    currentTime: 0,
    duration: 0,
    isPlaying: false,
    sourceWidth: 0,
    sourceHeight: 0,
  },
});

export const UploadOtherButton = memo(function UploadOtherButton() {
  return <SharedUploadOtherButton reset={cutReset} clearInputAfterPick />;
});
