"use client";

import { Activity } from "react";
import { ArrowUpRight, Crop } from "lucide-react";
import { Sidebar } from "@/components/editor/Sidebar";
import { UploadProgress } from "@/components/editor/UploadProgress";
import { Button } from "@/components/ui/button";
import { useVideoState } from "@/store/useVideoStore";
import { cn } from "@/lib/utils";
import { CropArea } from "./CropArea";
import { DynamicVideoPlayer } from "./VideoPlayerLazy";

export function CropWorkspace() {
  const { isSidebarOpen, file, mediaUrl, uploadStatus } =
    useVideoState() as unknown as {
      isSidebarOpen: boolean;
      file: File | null;
      mediaUrl: string | null;
      uploadStatus: string;
    };

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

      {/* Workspace */}
      <div
        className={cn(
          "grid items-start gap-4",
          isSidebarOpen ? "lg:grid-cols-[minmax(0,1fr)_340px]" : "grid-cols-1",
        )}
        style={
          {
            contentVisibility: "auto",
            containIntrinsicSize: "0 520px",
          } as React.CSSProperties
        }
      >
        {/* Crop area — fresh implementation replaces the old isCropStale/cropStats strip */}
        <div className="col-span-full">
          <CropArea />
        </div>

        {/* Main column — player */}
        <div className="min-w-0 flex flex-col gap-3">
          <Activity mode={hasVideo ? "visible" : "hidden"}>
            <div className="rounded-lg border border-kumo-line bg-kumo-base shadow-[0_1px_2px_rgba(0,0,0,0.05)] overflow-hidden">
              <DynamicVideoPlayer />
            </div>
          </Activity>

          {!isSidebarOpen && (
            <div className="flex flex-wrap items-center gap-2 text-xs text-kumo-subtle">
              <span className="inline-flex items-center gap-1.5 rounded-md border border-kumo-hairline bg-kumo-base px-2 py-1 text-[11px] font-medium">
                <Crop className="size-3" aria-hidden />
                Crop disabled — open sidebar to enable
              </span>
              <Button
                size="sm"
                variant="secondary"
                className="h-7 rounded-md text-xs"
                onClick={() => {
                  const el = document.querySelector<HTMLButtonElement>(
                    '[aria-label="Show sidebar"]',
                  );
                  el?.click();
                }}
              >
                Show controls
                <ArrowUpRight className="size-3" aria-hidden />
              </Button>
            </div>
          )}
        </div>

        {isSidebarOpen ? (
          <div className="min-w-0">
            <Sidebar />
          </div>
        ) : null}
      </div>
    </div>
  );
}
