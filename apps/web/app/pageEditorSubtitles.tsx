"use client";

import { Button } from "@/components/ui/button";
import { formatTime } from "@/lib/format-time";
import { stripExtension } from "@/lib/video-file";
import {
  preloadExportChunks,
  preloadMobilePreview,
} from "@/components/editor/subtitles/heavy-modules";
import {
  NoVideoPlaceholderCard,
  NoVideoPreviewSkeleton,
} from "@/components/editor/subtitles/placeholders";
import { PreviewPane } from "@/components/editor/subtitles/PreviewPane";
import { SubtitleArea } from "@/components/editor/subtitles/SubtitleArea";
import { SubtitleListPanel } from "@/components/editor/subtitles/SubtitleListPanel";
import { SubtitleSettingsPanel } from "@/components/editor/subtitles/SubtitleSettingsPanel";
import { TimelineSection } from "@/components/editor/subtitles/TimelineSection";
import { useSubtitleEditor } from "@/components/editor/subtitles/useSubtitleEditor";

// Thin composer for the subtitles editor. All state lives in
// useSubtitleEditor; all UI lives in components/editor/subtitles/*.
// server-* rules: NA for this "use client" local-only editor (no RSC/auth).

export default function PageEditorSubtitles() {
  const e = useSubtitleEditor();

  // rendering-conditional-render: explicit ternary, not &&
  return !e.hasVideo ? (
    <div className="space-y-3">
      {NoVideoPlaceholderCard}
      {NoVideoPreviewSkeleton}
    </div>
  ) : (
    <div className="space-y-3">
      <video
        ref={e.videoRef}
        src={e.mediaUrl ?? undefined}
        className="hidden"
        playsInline
        preload="metadata"
        crossOrigin="anonymous"
      />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">Subtitles · Mobile 9:16</h2>
          <p className="text-xs text-kumo-subtle" suppressHydrationWarning>
            {e.effectiveDuration
              ? `${formatTime(e.effectiveDuration)} · ${e.deferredSubtitles.length} subtitles`
              : "Loading…"}{" "}
            · Shared mobile layout
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => window.dispatchEvent(new Event("focus"))}
            onMouseEnter={preloadMobilePreview}
            onFocus={preloadMobilePreview}
          >
            Refresh layout
          </Button>
          <Button
            size="sm"
            onClick={e.handleExport}
            disabled={e.isExporting}
            onMouseEnter={preloadExportChunks}
            onFocus={preloadExportChunks}
          >
            {e.isExporting
              ? "Exporting…"
              : `Export 9:16 + ${e.deferredSubtitles.length} subtitles`}
          </Button>
        </div>
      </div>

      {/* Subtitle area — control & readout surface, mirrors pageEditorCrop CropArea */}
      <SubtitleArea
        count={e.deferredSubtitles.length}
        trackCount={e.trackCount}
        layoutMode={e.layout.mode}
        selected={e.selectedSubtitle}
        trimLabel={`${formatTime(e.trimStart)} → ${formatTime(e.trimEnd)}`}
        durationLabel={
          e.effectiveDuration ? formatTime(e.effectiveDuration) : "Loading…"
        }
        fileName={e.file?.name ?? ""}
        sourceLabel={
          e.sourceWidth && e.sourceHeight
            ? `${e.sourceWidth} × ${e.sourceHeight} px`
            : "—"
        }
        exportName={`${(e.file ? stripExtension(e.file.name) : "") || "video"}_mobile_subtitles_1080x1920.mp4`}
        canDelete={!!e.selectedId}
        onAdd={e.handleAddSubtitle}
        onDelete={e.handleDeleteSubtitle}
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_360px] items-start">
        <div className="space-y-4">
          <PreviewPane
            layout={e.layout}
            videoRef={e.videoRef}
            previewWrapRef={e.previewWrapRef}
            previewHeight={e.previewHeight}
            setPreviewHeight={e.setPreviewHeight}
            activeSubtitles={e.activeSubtitles}
            selectedSubtitle={e.selectedSubtitle}
            selectedId={e.selectedId}
            onSelect={e.setSelectedId}
            currentTime={e.currentTime}
            effectiveDuration={e.effectiveDuration}
            trimStart={e.trimStart}
            trimEnd={e.trimEnd}
            isPlaying={e.isPlaying}
            isLooping={e.isLooping}
            onToggleLoop={e.toggleLoop}
            onPlayFromTrimStart={e.playFromTrimStart}
            onTogglePlayback={e.togglePlayback}
            onProgressSeek={e.handleProgressSeek}
            onTimelineSeek={e.handleTimelineSeek}
          />

          <TimelineSection
            effectiveDuration={e.effectiveDuration}
            trimStart={e.trimStart}
            trimEnd={e.trimEnd}
            onTrimChange={e.handleTrimChange}
            currentTime={e.currentTime}
            subtitles={e.deferredSubtitles}
            selectedId={e.selectedId}
            trackCount={e.trackCount}
            onSeek={e.handleTimelineSeek}
            onSelect={e.setSelectedId}
            onUpdateSubtitle={e.handleTimelineUpdateSubtitle}
            onUpdateTrack={e.handleMoveSubtitleToTrack}
            onAddTrack={e.handleAddTrack}
          />
        </div>

        <div className="space-y-4">
          <SubtitleListPanel
            hasVideo={e.hasVideo}
            effectiveDuration={e.effectiveDuration}
            currentTime={e.currentTime}
            sortedSubtitles={e.sortedSubtitles}
            selectedId={e.selectedId}
            isStale={e.isSubtitlesStale}
            onAdd={e.handleAddSubtitle}
            onSelect={e.setSelectedId}
          />

          <SubtitleSettingsPanel
            selected={e.selectedSubtitle}
            templates={e.templates}
            newTemplateName={e.newTemplateName}
            onNewTemplateNameChange={e.setNewTemplateName}
            onApplyTemplate={e.handleApplyTemplate}
            onSaveTemplate={e.handleSaveTemplate}
            onUpdateSubtitle={e.updateSubtitle}
            onDelete={e.handleDeleteSubtitle}
            trackCount={e.trackCount}
            onMoveToTrack={e.handleMoveSubtitleToTrack}
            onAddTrack={e.handleAddTrack}
            trimStart={e.trimStart}
            trimEnd={e.trimEnd}
            onUpdateStyle={e.updateSelectedStyle}
          />
        </div>
      </div>
    </div>
  );
}
