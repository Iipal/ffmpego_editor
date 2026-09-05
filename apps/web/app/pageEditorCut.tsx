"use client";

import { useRef } from "react";
import { useVideoState, useVideoStore } from "@/store/useVideoStore";
import { UploadProgress } from "@/components/editor/UploadProgress";
import { CutEmptyState } from "@/components/editor/cut/CutEmptyState";
import { CutHeader } from "@/components/editor/cut/CutHeader";
import { CutPreview } from "@/components/editor/cut/CutPreview";
import { CutTimeline } from "@/components/editor/cut/CutTimeline";
import { CutList } from "@/components/editor/cut/CutList";
import { CutSettingsSidebar } from "@/components/editor/cut/CutSettingsSidebar";
import { useCutList } from "@/components/editor/cut/useCutList";
import { useCutLayouts } from "@/components/editor/cut/useCutLayouts";
import { useCutPlayback, useSeekTo } from "@/components/editor/cut/useCutPlayback";
import { useCutExport, useExportName } from "@/components/editor/cut/useCutExport";
import type { Cut } from "@/components/editor/cut/types";
import { stripExtension } from "@/lib/video-file";

export type { CutMode } from "@/components/editor/cut/types";

export default function CutEditorPage() {
  const { file, mediaUrl, uploadStatus } = useVideoState() as unknown as {
    file: File | null;
    mediaUrl: string | null;
    uploadStatus: string;
  };
  const {
    duration: srcDuration,
    sourceWidth,
    sourceHeight,
  } = useVideoState() as unknown as {
    duration: number;
    sourceWidth: number;
    sourceHeight: number;
  };
  const videoStore = useVideoStore();
  const videoRef = useRef<HTMLVideoElement>(null);

  const duration = srcDuration || 0;
  const hasVideo = !!mediaUrl && !!file;

  const {
    mode,
    setMode,
    stackedLayout,
    setStackedLayout,
    singleLayout,
    watermarkStack,
    setWatermarkStack,
    watermarkSingle,
    setWatermarkSingle,
    activeLayout,
    activeWatermark,
    syncFromMobile,
    updateZone,
  } = useCutLayouts();

  const seekTo = useSeekTo(videoRef, duration);

  const {
    cuts,
    setCuts,
    selectedId,
    setSelectedId,
    sorted,
    overlapIds,
    outDuration,
    patchCut,
    addCut,
    deleteSelected,
    clearCuts,
  } = useCutList({ duration });

  const {
    currentTime,
    isPlaying,
    togglePlay,
    playCut,
    playAllCuts,
  } = useCutPlayback({
    videoRef,
    mediaUrl,
    videoStore,
    duration,
    sorted,
    seekTo,
  });

  const { exportName, setExportName } = useExportName();

  const { isExporting, onExport } = useCutExport({
    file,
    cuts,
    overlapIds,
    sourceWidth,
    sourceHeight,
    exportName,
    setExportName,
    mode,
    activeWatermark,
    stackedLayout,
    singleLayout,
    videoStore,
  });

  if (!hasVideo) {
    return <CutEmptyState />;
  }

  const fileName = file?.name ?? "";
  const modeBadge =
    mode === "full-size"
      ? `Full-size ${sourceWidth || "—"}×${sourceHeight || "—"}`
      : mode === "2-stack"
        ? "9:16 2-Stack 1080×1920"
        : "9:16 1-Zone 1080×1920";

  const handlePickCut = (c: Cut) => {
    setSelectedId(c.id);
    playCut(c);
  };

  const handleDeleteCut = (id: string) => {
    setCuts((prev) => prev.filter((x) => x.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  return (
    <div className="flex flex-col gap-3">
      <CutHeader
        fileName={fileName}
        modeBadge={modeBadge}
        cutsCount={cuts.length}
        outDuration={outDuration}
        currentTime={currentTime}
        duration={duration}
        overlapCount={overlapIds.size}
        isExporting={isExporting}
        onClear={clearCuts}
        onExport={onExport}
      />

      {uploadStatus === "uploading" || uploadStatus === "error" ? (
        <div className="rounded-md border border-kumo-hairline bg-kumo-recessed p-3">
          <UploadProgress />
        </div>
      ) : null}

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.6fr)_340px]">
        <div className="flex flex-col gap-4">
          <CutPreview
            mode={mode}
            onModeChange={setMode}
            modeBadge={modeBadge}
            videoRef={videoRef}
            mediaUrl={mediaUrl}
            activeLayout={activeLayout}
            isPlaying={isPlaying}
            onTogglePlay={togglePlay}
            onPlayAllCuts={playAllCuts}
            playAllDisabled={sorted.length === 0}
            currentTime={currentTime}
            duration={duration}
            onSeek={seekTo}
          >
            <CutTimeline
              cutsCount={cuts.length}
              outDuration={outDuration}
              currentTime={currentTime}
              duration={duration}
              sorted={sorted}
              selectedId={selectedId}
              overlapIds={overlapIds}
              onAddCut={() => addCut(currentTime, seekTo)}
              onDeleteSelected={deleteSelected}
              onSelect={setSelectedId}
              onPatchCut={patchCut}
            >
              <CutList
                sorted={sorted}
                selectedId={selectedId}
                duration={duration}
                onPickCut={handlePickCut}
                onPatchCut={patchCut}
                onDeleteCut={handleDeleteCut}
              />
            </CutTimeline>
          </CutPreview>
        </div>

        {/* Sidebar settings */}
        <div className="space-y-4">
          <CutSettingsSidebar
            mode={mode}
            onModeChange={setMode}
            sourceWidth={sourceWidth}
            sourceHeight={sourceHeight}
            watermarkStack={watermarkStack}
            onWatermarkStackChange={setWatermarkStack}
            watermarkSingle={watermarkSingle}
            onWatermarkSingleChange={setWatermarkSingle}
            stackedLayout={stackedLayout}
            setStackedLayout={setStackedLayout}
            singleLayout={singleLayout}
            onUpdateZone={updateZone}
            onSyncFromMobile={syncFromMobile}
            exportName={exportName}
            onExportNameChange={setExportName}
            exportPlaceholder={
              file ? stripExtension(file.name) : "cut"
            }
            cutsCount={cuts.length}
            overlapCount={overlapIds.size}
            isExporting={isExporting}
            onExport={onExport}
          />
        </div>
      </div>
    </div>
  );
}
