"use client";

import { useRef } from "react";
import { useVideoState, useVideoStore } from "@/store/useVideoStore";
import { cn } from "@/lib/utils";

type Handle = "move" | "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

const ratioFor = (aspectRatio: "custom" | "1:1" | "16:9" | "21:9") =>
  aspectRatio === "1:1"
    ? 1
    : aspectRatio === "16:9"
      ? 16 / 9
      : aspectRatio === "21:9"
        ? 21 / 9
        : null;

const MIN_PCT = 5;

const handlesArr: readonly Handle[] = [
  "n",
  "s",
  "e",
  "w",
  "ne",
  "nw",
  "se",
  "sw",
] as const;

export function CropOverlay() {
  const overlayRef = useRef<HTMLDivElement>(null);
  const videoStore = useVideoStore();
  const { crop, aspectRatio, sourceAspectRatio } = useVideoState();

  const startDrag = (
    event: React.PointerEvent<HTMLDivElement>,
    handle: Handle,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    const bounds = overlayRef.current?.getBoundingClientRect();
    if (!bounds || bounds.width === 0 || bounds.height === 0) return;

    // Snapshot at drag start — every move recomputes from start to avoid accumulation drift.
    const startCrop = { ...crop };
    const startX = event.clientX;
    const startY = event.clientY;
    const ratio = ratioFor(aspectRatio as "custom" | "1:1" | "16:9" | "21:9");
    // sourceAspect may be 0 before metadata; fallback to 1 to avoid NaN.
    const srcAspect = sourceAspectRatio > 0 ? sourceAspectRatio : 1;
    const widthPerHeight = ratio ? ratio / srcAspect : null;

    // Capture pointer so we continue receiving events even over chrome.
    const target = event.currentTarget as HTMLElement;
    try {
      target.setPointerCapture(event.pointerId);
    } catch {}

    const onMove = (moveEvent: PointerEvent) => {
      // Overlay is intentionally rendered WITHOUT any CSS scale/translate
      // (VideoPlayer disables canvasTransform while isCropMode). Thus
      // bounds is 1:1 with crop percentages: deltaPct = dx/bounds *100.
      // If a future transform is ever re-enabled, this still stays correct
      // because bounds would then be scaled — we intentionally keep the
      // overlay untransformed so no inverse-scale is needed.
      const deltaXPct = ((moveEvent.clientX - startX) / bounds.width) * 100;
      const deltaYPct = ((moveEvent.clientY - startY) / bounds.height) * 100;

      let next = { ...startCrop };

      if (handle === "move") {
        // Clamp translation so rectangle stays fully inside 0..100.
        next.x = Math.min(Math.max(startCrop.x + deltaXPct, 0), 100 - startCrop.width);
        next.y = Math.min(Math.max(startCrop.y + deltaYPct, 0), 100 - startCrop.height);
      } else {
        // Edge / corner resizing from start geometry.
        if (handle.includes("e")) {
          next.width = Math.max(MIN_PCT, Math.min(100 - next.x, startCrop.width + deltaXPct));
        }
        if (handle.includes("s")) {
          next.height = Math.max(MIN_PCT, Math.min(100 - next.y, startCrop.height + deltaYPct));
        }
        if (handle.includes("w")) {
          // w edge moves x; width follows.
          const proposedX = Math.min(
            Math.max(startCrop.x + deltaXPct, 0),
            startCrop.x + startCrop.width - MIN_PCT,
          );
          next.x = proposedX;
          next.width = startCrop.width + startCrop.x - proposedX;
        }
        if (handle.includes("n")) {
          const proposedY = Math.min(
            Math.max(startCrop.y + deltaYPct, 0),
            startCrop.y + startCrop.height - MIN_PCT,
          );
          next.y = proposedY;
          next.height = startCrop.height + startCrop.y - proposedY;
        }

        // Aspect lock: enforce width/height ratio. widthPerHeight = targetRatio / srcAspect.
        // Crop pct maps to source pixels, so widthPct/heightPct must equal widthPerHeight.
        if (widthPerHeight !== null) {
          if (handle === "e" || handle === "w") {
            // horizontal edge drives height
            let h = next.width / widthPerHeight;
            // Clamp h to container and to MIN_PCT via width
            h = Math.max(MIN_PCT, Math.min(h, 100 - next.y));
            // If clamped, adjust width to match
            let w = h * widthPerHeight;
            if (w > 100 - next.x) {
              w = Math.min(next.width, 100 - next.x);
              h = w / widthPerHeight;
            }
            // Keep MIN_PCT on both
            w = Math.max(MIN_PCT, w);
            h = Math.max(MIN_PCT, h);
            next.width = w;
            next.height = h;
          } else if (handle === "n" || handle === "s") {
            let w = next.height * widthPerHeight;
            w = Math.max(MIN_PCT, Math.min(w, 100 - next.x));
            let h = w / widthPerHeight;
            if (h > 100 - next.y) {
              h = Math.min(next.height, 100 - next.y);
              w = h * widthPerHeight;
            }
            next.width = Math.max(MIN_PCT, w);
            next.height = Math.max(MIN_PCT, h);
          } else {
            // corner: choose the axis that would give a valid rect and preserve minimum.
            // Compute both candidates and pick the one that stays in bounds,
            // preferring to preserve the larger change direction.
            const absDx = Math.abs(deltaXPct);
            const absDy = Math.abs(deltaYPct);
            const driveByWidth = absDx >= absDy;
            let w: number, h: number;
            if (driveByWidth) {
              w = Math.max(MIN_PCT, Math.min(next.width, 100 - next.x));
              h = w / widthPerHeight;
              if (h > 100 - next.y || h < MIN_PCT) {
                h = Math.max(MIN_PCT, Math.min(next.height, 100 - next.y));
                w = h * widthPerHeight;
              }
            } else {
              h = Math.max(MIN_PCT, Math.min(next.height, 100 - next.y));
              w = h * widthPerHeight;
              if (w > 100 - next.x || w < MIN_PCT) {
                w = Math.max(MIN_PCT, Math.min(next.width, 100 - next.x));
                h = w / widthPerHeight;
              }
            }
            // Final clamp to bounds if one dimension still overflows due to
            // simultaneous n/w shifting origin.
            if (next.x + w > 100) w = 100 - next.x;
            if (next.y + h > 100) h = 100 - next.y;
            if (w < MIN_PCT) w = MIN_PCT;
            if (h < MIN_PCT) h = MIN_PCT;
            // If after clamping aspect would break, re-derive from clamped dimension
            // preferring width when corner was width-driven (keeps handle under pointer).
            if (driveByWidth) {
              h = w / widthPerHeight;
              if (h > 100 - next.y) {
                h = 100 - next.y;
                w = h * widthPerHeight;
              }
            } else {
              w = h * widthPerHeight;
              if (w > 100 - next.x) {
                w = 100 - next.x;
                h = w / widthPerHeight;
              }
            }
            next.width = w;
            next.height = h;
          }
        }

        // Final bounds guard: ensure rect never exceeds 0..100 even after aspect correction.
        next.x = Math.min(next.x, 100 - next.width);
        next.y = Math.min(next.y, 100 - next.height);
        next.x = Math.max(0, next.x);
        next.y = Math.max(0, next.y);
      }

      videoStore.setState((previous) => ({ ...previous, crop: next }));
    };

    const onEnd = (endEvent: PointerEvent) => {
      try {
        target.releasePointerCapture(endEvent.pointerId);
      } catch {}
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onEnd);
      window.removeEventListener("pointercancel", onEnd);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onEnd);
    window.addEventListener("pointercancel", onEnd);
  };

  return (
    <div
      ref={overlayRef}
      className="absolute inset-0 z-10 touch-none select-none"
      // Background dim handled via boxShadow on the crop rect; this container
      // itself is non-draggable. Dragging the empty area does NOT pan the canvas
      // while crop mode is active — that was a drift source (canvas translate
      // changing bounds mid-drag). Canvas pan is only active outside crop mode.
      aria-label="Crop area. Drag to move, handles to resize."
    >
      <div
        className="absolute border-2 border-kumo-brand bg-transparent"
        style={{
          left: `${crop.x}%`,
          top: `${crop.y}%`,
          width: `${crop.width}%`,
          height: `${crop.height}%`,
          boxShadow: "0 0 0 9999px rgba(17, 24, 39, 0.45)",
        }}
        onPointerDown={(e) => startDrag(e, "move")}
        role="button"
        tabIndex={0}
        aria-label="Move crop area"
      >
        {/* Subtle grid for alignment — hairline */}
        <div className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3 opacity-30">
          <div className="border-r border-kumo-line/60" />
          <div className="border-r border-kumo-line/60" />
          <div />
          <div className="border-r border-t border-kumo-line/60" />
          <div className="border-r border-t border-kumo-line/60" />
          <div className="border-t border-kumo-line/60" />
          <div className="border-r border-t border-kumo-line/60" />
          <div className="border-r border-t border-kumo-line/60" />
          <div className="border-t border-kumo-line/60" />
        </div>
        {handlesArr.map((handle) => (
          <div
            key={handle}
            aria-label={`Resize crop ${handle}`}
            role="button"
            tabIndex={0}
            onPointerDown={(e) => startDrag(e, handle)}
            className={cn(
              "absolute size-3.5 -m-1 cursor-pointer rounded-full border-2 border-white bg-kumo-brand shadow-sm touch-none transition-transform hover:scale-110 active:scale-95",
              handle.includes("n")
                ? "-top-1.5"
                : handle.includes("s")
                  ? "-bottom-1.5"
                  : "top-1/2 -translate-y-1/2",
              handle.includes("w")
                ? "-left-1.5"
                : handle.includes("e")
                  ? "-right-1.5"
                  : "left-1/2 -translate-x-1/2",
            )}
            style={{ zIndex: 1 }}
          />
        ))}
      </div>
    </div>
  );
}
