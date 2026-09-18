"use client";

import { Activity } from "react";
import { Sidebar } from "@/components/editor/Sidebar";
import { UploadProgress } from "@/components/editor/UploadProgress";
import { useSelector } from "@tanstack/react-store";
import { sourceStore } from "@/store/sourceSlice";
import { cutStore } from "@/store/cutSlice";
import { cn } from "@/lib/utils";
import { CropArea } from "./CropArea";
import { DynamicVideoPlayer } from "./VideoPlayerLazy";

export function CropWorkspace() {
  const { file, mediaUrl, uploadStatus } = useSelector(sourceStore);
  const { isSidebarOpen } = useSelector(cutStore);

  const hasVideo = !!file && !!mediaUrl;

  return (
    <div className="flex flex-col gap-3">
      {uploadStatus === "uploading" || uploadStatus === "error" ? (
        <Activity mode="visible">
          <div className="rounded-md border border-kumo-hairline bg-kumo-recessed p-3">
            <UploadProgress />
          </div>
        </Activity>
      ) : null}

      {/* Workspace: stage column (toolbar + player + timeline) and controls rail */}
      <div
        className={cn(
          "grid items-start gap-4",
          isSidebarOpen ? "lg:grid-cols-[minmax(0,1fr)_360px]" : "grid-cols-1",
        )}
        style={
          {
            contentVisibility: "auto",
            containIntrinsicSize: "0 520px",
          } as React.CSSProperties
        }
      >
        {/* Main column — crop toolbar docked to the stage it controls */}
        <div className="min-w-0 flex flex-col gap-3">
          <CropArea />
          <Activity mode={hasVideo ? "visible" : "hidden"}>
            <DynamicVideoPlayer />
          </Activity>
        </div>

        {isSidebarOpen ? <Sidebar /> : null}
      </div>
    </div>
  );
}
