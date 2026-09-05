"use client";

import { Activity } from "react";
import { toast } from "sonner";
import { formatTime } from "@/lib/format-time";
import { UploadProgress } from "@/components/editor/UploadProgress";
import { MobileArea } from "@/components/editor/mobile/MobileArea";
import { MobileEmptyState } from "@/components/editor/mobile/MobileEmptyState";
import { EditorHeader } from "@/components/editor/mobile/EditorHeader";
import { SourcePanel } from "@/components/editor/mobile/SourcePanel";
import { PreviewPanel } from "@/components/editor/mobile/PreviewPanel";
import { useMobilePageState } from "@/components/editor/mobile/useMobilePageState";
import { useMobileExport } from "@/components/editor/mobile/useMobileExport";
import { setCachedLayout } from "@/components/editor/mobile/mobile-helpers";

export default function MobileEditorPage() {
  const s = useMobilePageState();
  const { onExport, isExporting } = useMobileExport({
    file: s.file,
    validationError: s.validationError,
    trimRange: s.trimRange,
    sourceWidth: s.sourceWidth,
    sourceHeight: s.sourceHeight,
    filterString: s.filterString,
    layout: s.ed.layout,
    useWatermark: s.ed.useWatermark,
    ignoreTrim: s.ed.ignoreTrim,
  });

  if (!s.hasVideo) {
    return <MobileEmptyState />;
  }

  return (
    <div className="flex flex-col gap-3">
      <EditorHeader
        modeBadge={s.modeBadge}
        fileName={s.fileName}
        sourceLabel={s.sourceLabel}
        outputLabel={s.outputLabel}
        validationError={s.validationError}
        isExporting={isExporting}
        onExport={onExport}
        onReset={s.handleResetAll}
      />

      {s.uploadStatus === "uploading" || s.uploadStatus === "error" ? (
        <Activity mode="visible">
          <div className="rounded-md border border-kumo-hairline bg-kumo-recessed p-3">
            <UploadProgress />
          </div>
        </Activity>
      ) : null}

      <div
        className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.7fr)_340px]"
        style={
          {
            contentVisibility: "auto",
            containIntrinsicSize: "0 640px",
          } as React.CSSProperties
        }
      >
        <MobileArea
          layout={s.ed.layout}
          selected={s.ed.selected}
          modeBadge={s.modeBadge}
          splitLabel={s.splitLabel}
          sourceLabel={s.sourceLabel}
          outputLabel={s.outputLabel}
          trimLabel={s.trimLabel}
          timeLabel={`${formatTime(s.currentTime)} / ${formatTime(s.duration)}`}
          filterPreview={s.defferedFilter}
          validationError={s.validationError}
          isStale={s.isFilterStale || s.isPending}
          canUndo={s.ed.undo.length > 0}
          canRedo={s.ed.redo.length > 0}
          onUndo={s.ed.undoOp}
          onRedo={s.ed.redoOp}
          onSave={() => {
            setCachedLayout(s.ed.layout);
            toast.success("Layout preference saved", {
              description: `${s.ed.layout.mode} · split ${Math.round(s.ed.layout.splitRatio * 100)}% · ${s.ed.layout.zones.length} zones`,
            });
          }}
        />

        <SourcePanel
          layout={s.ed.layout}
          selected={s.ed.selected}
          onSelect={s.ed.setSelected}
          onModeChange={s.handleModeChange}
          videoRef={s.videoRef}
          mediaUrl={s.mediaUrl}
          volume={s.volume}
          setVolume={s.setVolume}
          isMuted={s.isMuted}
          setIsMuted={s.setIsMuted}
          sourceLabel={s.sourceLabel}
          currentTime={s.currentTime}
          duration={s.duration}
          trimStart={s.trimStart}
          trimEnd={s.trimEnd}
          trimmedDuration={s.trimmedDuration}
          onMove={s.handleMove}
          onResize={s.handleResize}
          onZoom={s.handleZoom}
          onResetZone={s.resetZone}
          onToggleLock={s.handleToggleLock}
          onRole={s.handleRoleChange}
          onSeekTo={s.seekTo}
          onTogglePlay={s.togglePlay}
          isPlaying={s.isPlaying}
          onSeekStart={s.handleSeekStart}
          isLoopTrim={s.isLoopTrim}
          setIsLoopTrim={s.setIsLoopTrim}
          onSetTrimRange={(range) => s.setTrimRange(range)}
          onSetStartToCurrent={s.setStartToCurrent}
          onSetEndToCurrent={s.setEndToCurrent}
          ignoreTrim={s.ed.ignoreTrim}
          validationError={s.validationError}
        />

        <div className="space-y-4">
          <PreviewPanel
            layout={s.ed.layout}
            videoRef={s.videoRef}
            onSplit={s.handleSplit}
            safe={s.ed.safe}
            setSafe={s.ed.setSafe}
            useWatermark={s.ed.useWatermark}
            setUseWatermark={s.ed.setUseWatermark}
            ignoreTrim={s.ed.ignoreTrim}
            setIgnoreTrim={s.ed.setIgnoreTrim}
            onSavePreference={() => {
              setCachedLayout(s.ed.layout);
              toast.success("Layout saved as default");
            }}
            deferredFilter={s.defferedFilter}
            isFilterStale={s.isFilterStale}
            isPending={s.isPending}
            trimStart={s.trimStart}
            trimEnd={s.trimEnd}
            trimmedDuration={s.trimmedDuration}
          />
        </div>
      </div>

      <div className="hidden tabular-nums" suppressHydrationWarning aria-hidden>
        {s.isFilterStale ? "pending" : "ready"} · {s.splitLabel} ·{" "}
        {s.fileName ? "has-file" : "no-file"}
      </div>
    </div>
  );
}
