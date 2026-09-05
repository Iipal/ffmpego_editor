"use client";

import { Activity } from "react";
import type { Dispatch, RefObject, SetStateAction } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { clamp } from "@/lib/mobile-layout";
import type { MobileLayout } from "@/lib/mobile-layout";
import { formatTime } from "@/lib/format-time";
import type { Subtitle } from "@/lib/subtitles/subtitleTypes";
import {
  DynamicMobilePreviewShared,
  preloadMobilePreview,
} from "./heavy-modules";
import {
  ensureGlobalPointerListeners,
  globalPointerMoveHandlers,
  globalPointerUpHandlers,
} from "./pointer-bus";
import type { PointerHandler } from "./pointer-bus";
import { percentToTime } from "./subtitle-helpers";
import { OverlaySubtitle } from "./OverlaySubtitle";

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
  onToggleLoop: () => void;
  onPlayFromTrimStart: () => void;
  onTogglePlayback: () => void;
  onProgressSeek: (t: number) => void;
  onTimelineSeek: (t: number) => void;
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
  onToggleLoop,
  onPlayFromTrimStart,
  onTogglePlayback,
  onProgressSeek,
  onTimelineSeek,
}: PreviewPaneProps) {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="py-3">
        <CardTitle className="text-sm">
          9:16 Preview · {layout.mode === "stacked" ? "Stacked" : "Full"}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {(() => {
          const HANDLE_H = 20;
          const contentH = Math.max(300, previewHeight - HANDLE_H);
          const contentW = Math.round((contentH * 9) / 16);
          return (
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
                              left: `${clamp(selectedSubtitle.position.x, 0, 100)}%`,
                              top: `${clamp(selectedSubtitle.position.y, 0, 100)}%`,
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
                onPointerDown={(e) => {
                  e.preventDefault();
                  const startY = e.clientY;
                  const startH =
                    previewWrapRef.current?.getBoundingClientRect().height ??
                    previewHeight;
                  let curH = startH;
                  const onMove = (ev: PointerEvent) => {
                    const dy = ev.clientY - startY;
                    const next = Math.round(
                      Math.max(320, Math.min(900, startH + dy)),
                    );
                    curH = next;
                    setPreviewHeight(next);
                  };
                  const onUp = () => {
                    globalPointerMoveHandlers.delete(
                      onMove as unknown as PointerHandler,
                    );
                    globalPointerUpHandlers.delete(
                      onUp as unknown as PointerHandler,
                    );
                    if (previewWrapRef.current) {
                      // js-batch-dom-css: single cssText write instead of multiple style.* thrashes
                      previewWrapRef.current.style.cssText += `;height:${curH}px`;
                    }
                  };
                  ensureGlobalPointerListeners();
                  globalPointerMoveHandlers.add(
                    onMove as unknown as PointerHandler,
                  );
                  globalPointerUpHandlers.add(onUp as unknown as PointerHandler);
                }}
              >
                <div className="h-0.5 w-8 rounded bg-black/30 dark:bg-white/30" />
              </div>
            </div>
          );
        })()}

        <div className="rounded-lg border bg-kumo-recessed/10 p-3 space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              size="sm"
              variant="outline"
              onClick={onPlayFromTrimStart}
              aria-label="Play from trim start"
            >
              ⏮ From Trim Start
            </Button>
            <Button
              size="sm"
              variant={isPlaying ? "secondary" : "default"}
              onClick={onTogglePlayback}
              aria-label={isPlaying ? "Pause" : "Play"}
            >
              {isPlaying ? "⏸ Pause" : "▶ Play"}
            </Button>
            <Button
              size="sm"
              variant={isLooping ? "default" : "outline"}
              onClick={onToggleLoop}
              aria-label={isLooping ? "Disable loop" : "Enable loop"}
            >
              Loop {isLooping ? "On" : "Off"}
            </Button>
            <span
              className="ml-auto text-xs tabular-nums text-kumo-subtle"
              suppressHydrationWarning
            >
              {formatTime(currentTime)} / {formatTime(effectiveDuration)} · Trim{" "}
              {formatTime(trimStart)} → {formatTime(trimEnd)}
            </span>
          </div>
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[11px] text-kumo-subtle">
              <span>Progress (trim range)</span>
              <span className="tabular-nums" suppressHydrationWarning>
                {trimEnd > trimStart
                  ? `${Math.round(clamp(((currentTime - trimStart) / (trimEnd - trimStart)) * 100, 0, 100))}%`
                  : "0%"}
              </span>
            </div>
            <Slider
              value={[
                clamp(
                  trimEnd > trimStart
                    ? clamp(
                        ((currentTime - trimStart) / (trimEnd - trimStart)) *
                          100,
                        0,
                        100,
                      )
                    : 0,
                  0,
                  100,
                ),
              ]}
              min={0}
              max={100}
              step={0.1}
              onValueChange={(v) => {
                const pct = Array.isArray(v) ? (v[0] as number) : (v as number);
                if (trimEnd <= trimStart) return;
                const t = percentToTime(pct, trimStart, trimEnd);
                onProgressSeek(t);
              }}
              aria-label="Seek within trim range"
            />
            <Slider
              value={[currentTime]}
              min={0}
              max={Math.max(effectiveDuration, 0.01)}
              step={0.01}
              onValueChange={(v) => {
                const t = Array.isArray(v) ? (v[0] as number) : (v as number);
                onTimelineSeek(t);
              }}
              aria-label="Seek video"
              className="opacity-60"
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
