"use client";

import { Activity, useCallback, useRef } from "react";
import type { Dispatch, RefObject, SetStateAction } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { VideoPlayerControls } from "@/components/editor/shared/VideoPlayerControls";
import { mobileLayoutService } from "@/lib/mobile-layout";
import type { MobileLayout } from "@/lib/mobile-layout";
import { formatTime } from "@/lib/format-time";
import type { Subtitle } from "@/lib/subtitles/subtitleStorage";
import {
  DynamicMobilePreviewShared,
  preloadMobilePreview,
} from "./heavy-modules";
import {
  ensureGlobalPointerListeners,
  globalPointerMoveHandlers,
  globalPointerUpHandlers,
} from "@/lib/global-listener-bus";
import type { PointerHandler } from "@/lib/global-listener-bus";
import { OverlaySubtitle } from "./OverlaySubtitle";
import { TimelineSection } from "./TimelineSection";

// rendering-hoist-jsx: static layout constants outside the component
const PREVIEW_HANDLE_H = 20;
const PREVIEW_MIN_H = 320;
const PREVIEW_MAX_H = 900;
const PREVIEW_MIN_CONTENT_H = 300;

export type PreviewPaneProps = {
  layout: MobileLayout;
  videoRef: RefObject<HTMLVideoElement | null>;
  previewWrapRef: RefObject<HTMLDivElement | null>;
  previewHeight: number;
  setPreviewHeight: Dispatch<SetStateAction<number>>;
  activeSubtitles: Subtitle[];
  selectedSubtitle: Subtitle | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
  currentTime: number;
  effectiveDuration: number;
  trimStart: number;
  trimEnd: number;
  isPlaying: boolean;
  isLooping: boolean;
  volume: number;
  muted: boolean;
  onVolumeChange: (v: number) => void;
  onToggleMute: () => void;
  onToggleLoop: () => void;
  onPlayFromTrimStart: () => void;
  onTogglePlayback: () => void;
  onProgressSeek: (t: number) => void;
  onTimelineSeek: (t: number) => void;
  // Timeline data comes from the page composer's single useSubtitleEditor
  // subscription (no duplicate store subscription here).
  timelineSubtitles: Subtitle[];
  trackCount: number;
  onUpdateSubtitle: (id: string, start: number, end: number) => void;
  onUpdateTrack: (id: string, newTrack: number) => void;
  onAddTrack: () => void;
};

export function PreviewPane({
  layout,
  videoRef,
  previewWrapRef,
  previewHeight,
  setPreviewHeight,
  activeSubtitles,
  selectedSubtitle,
  selectedId,
  onSelect,
  currentTime,
  effectiveDuration,
  trimStart,
  trimEnd,
  isPlaying,
  isLooping,
  volume,
  muted,
  onVolumeChange,
  onToggleMute,
  onToggleLoop,
  onPlayFromTrimStart,
  onTogglePlayback,
  onProgressSeek,
  onTimelineSeek,
  timelineSubtitles,
  trackCount,
  onUpdateSubtitle,
  onUpdateTrack,
  onAddTrack,
}: PreviewPaneProps) {
  // rerender-simple-expression-in-memo: primitive layout math derived during
  // render (no useMemo, no IIFE wrapper).
  const contentH = Math.max(
    PREVIEW_MIN_CONTENT_H,
    previewHeight - PREVIEW_HANDLE_H,
  );
  const contentW = Math.round((contentH * 9) / 16);

  // rerender-use-ref-transient-values: drag position lives in a ref + direct
  // DOM writes during the move (no setState per pointermove); the store state
  // commits once on pointer-up. rAF coalesces moves into one write per frame.
  const resizeDragRef = useRef<{
    startY: number;
    startH: number;
    curH: number;
    raf: number;
  } | null>(null);

  const handleResizePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      const startY = e.clientY;
      const startH =
        previewWrapRef.current?.getBoundingClientRect().height ?? previewHeight;
      resizeDragRef.current = { startY, startH, curH: startH, raf: 0 };
      const applyHeight = () => {
        const drag = resizeDragRef.current;
        if (!drag) return;
        drag.raf = 0;
        if (previewWrapRef.current) {
          previewWrapRef.current.style.height = `${drag.curH}px`;
        }
      };
      const onMove = (ev: PointerEvent) => {
        const drag = resizeDragRef.current;
        if (!drag) return;
        const dy = ev.clientY - drag.startY;
        drag.curH = Math.round(
          Math.max(PREVIEW_MIN_H, Math.min(PREVIEW_MAX_H, drag.startH + dy)),
        );
        if (!drag.raf) drag.raf = requestAnimationFrame(applyHeight);
      };
      const onUp = () => {
        const drag = resizeDragRef.current;
        resizeDragRef.current = null;
        if (drag) {
          if (drag.raf) cancelAnimationFrame(drag.raf);
          setPreviewHeight(drag.curH);
          if (previewWrapRef.current) {
            // js-batch-dom-css: single cssText write instead of style thrash
            previewWrapRef.current.style.cssText += `;height:${drag.curH}px`;
          }
        }
        globalPointerMoveHandlers.delete(onMove as unknown as PointerHandler);
        globalPointerUpHandlers.delete(onUp as unknown as PointerHandler);
      };
      ensureGlobalPointerListeners();
      globalPointerMoveHandlers.add(onMove as unknown as PointerHandler);
      globalPointerUpHandlers.add(onUp as unknown as PointerHandler);
    },
    [previewWrapRef, previewHeight, setPreviewHeight],
  );

  return (
    <Card className="overflow-hidden">
      <CardHeader className="py-3">
        <CardTitle className="text-sm">
          9:16 Preview · {layout.mode === "stacked" ? "Stacked" : "Full"}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div
          ref={previewWrapRef}
          className="resize-y overflow-auto min-h-80 max-h-[85vh] rounded-lg border border-kumo-line bg-black flex flex-col mx-auto"
          style={{
            height: previewHeight,
            width: contentW,
            maxWidth: "100%",
            resize: "vertical" as const,
          }}
          onMouseEnter={preloadMobilePreview}
          onFocus={preloadMobilePreview}
        >
          <div className="flex-1 flex items-center justify-center w-full min-h-0 overflow-hidden bg-black rounded-t-lg h-full">
            {/* rendering-activity: preserve canvas DOM/state when toggling visibility */}
            <Activity mode="visible">
              <DynamicMobilePreviewShared
                layout={layout}
                videoRef={videoRef}
                safe
                showBg
                height={contentH}
                overlay={
                  <div className="absolute inset-0">
                    {activeSubtitles.map((sub) => (
                      <OverlaySubtitle
                        key={sub.id}
                        sub={sub}
                        isSelected={sub.id === selectedId}
                        onSelect={onSelect}
                      />
                    ))}
                    {selectedSubtitle ? (
                      <div
                        className="absolute size-2 rounded-full bg-kumo-brand border border-white shadow pointer-events-none"
                        style={{
                          left: `${mobileLayoutService.clamp(selectedSubtitle.position.x, 0, 100)}%`,
                          top: `${mobileLayoutService.clamp(selectedSubtitle.position.y, 0, 100)}%`,
                          transform: "translate(-50%, -50%)",
                        }}
                        aria-hidden
                      />
                    ) : null}
                  </div>
                }
              />
            </Activity>
          </div>
          <div
            className="mt-2 h-2.5 w-full shrink-0 cursor-row-resize flex items-center justify-center rounded bg-kumo-recessed border border-kumo-line hover:bg-kumo-brand/10 select-none touch-none"
            title="Drag to resize preview height"
            aria-label="Resize preview height"
            onPointerDown={handleResizePointerDown}
          >
            <div className="h-0.5 w-8 rounded bg-black/30 dark:bg-white/30" />
          </div>
        </div>

        <VideoPlayerControls
          isPlaying={isPlaying}
          currentTime={currentTime}
          duration={effectiveDuration}
          onTogglePlay={onTogglePlayback}
          onSeek={onProgressSeek}
          volume={volume}
          onVolumeChange={onVolumeChange}
          muted={muted}
          onToggleMute={onToggleMute}
          loop={isLooping}
          onToggleLoop={onToggleLoop}
          onPlayFromStart={onPlayFromTrimStart}
          playFromStartLabel="Play from trim start"
          timeLabel={`${formatTime(currentTime)} / ${formatTime(effectiveDuration)} · Trim ${formatTime(trimStart)} → ${formatTime(trimEnd)}`}
        />

        <TimelineSection
          effectiveDuration={effectiveDuration}
          trimStart={trimStart}
          trimEnd={trimEnd}
          currentTime={currentTime}
          subtitles={timelineSubtitles}
          selectedId={selectedId}
          trackCount={trackCount}
          onSeek={onTimelineSeek}
          onSelect={onSelect}
          onUpdateSubtitle={onUpdateSubtitle}
          onUpdateTrack={onUpdateTrack}
          onAddTrack={onAddTrack}
        />
      </CardContent>
    </Card>
  );
}
