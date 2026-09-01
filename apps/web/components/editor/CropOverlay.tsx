"use client";

import { useRef } from "react";
import { useVideoState, useVideoStore } from "@/store/useVideoStore";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types & constants — fresh implementation, no carry-over
// ---------------------------------------------------------------------------

type Handle = "move" | "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

type Rect = { x: number; y: number; width: number; height: number };

const MIN = 5;

const HANDLES: readonly Handle[] = [
  "n",
  "s",
  "e",
  "w",
  "ne",
  "nw",
  "se",
  "sw",
] as const;

function clamp(n: number, min: number, max: number): number {
  return Math.min(Math.max(n, min), max);
}

function targetRatio(aspect: string): number | null {
  switch (aspect) {
    case "1:1":
      return 1;
    case "16:9":
      return 16 / 9;
    case "21:9":
      return 21 / 9;
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Pure geometry — testable, no side effects
// ---------------------------------------------------------------------------

/**
 * Given a start rect and pointer deltas (in pct of overlay), produce the
 * next rect for a given handle. Aspect lock is applied after the raw resize
 * so the rect never drifts with accumulated rounding.
 *
 * Coordinate system: 0..100 on both axes (percent of source video).
 * Overlay inherits VideoPlayer's canvas zoom/pan transform — bounds.width
 * includes the scale, so dividing delta by bounds maps correctly to pct.
 */
function computeNextRect(args: {
  start: Rect;
  dxPct: number;
  dyPct: number;
  handle: Handle;
  lockedRatio: number | null; // width/height in pct-space = targetRatio / srcAspect
}): Rect {
  const { start, dxPct, dyPct, handle, lockedRatio } = args;
  let next: Rect = { ...start };

  // ---- move ---------------------------------------------------------------
  if (handle === "move") {
    next.x = clamp(start.x + dxPct, 0, 100 - start.width);
    next.y = clamp(start.y + dyPct, 0, 100 - start.height);
    return next;
  }

  // ---- raw resize from start geometry (snap-free, recomputed each move) ---
  if (handle.includes("e")) {
    next.width = clamp(start.width + dxPct, MIN, 100 - next.x);
  }
  if (handle.includes("s")) {
    next.height = clamp(start.height + dyPct, MIN, 100 - next.y);
  }
  if (handle.includes("w")) {
    const proposedX = clamp(start.x + dxPct, 0, start.x + start.width - MIN);
    next.x = proposedX;
    next.width = start.width + start.x - proposedX;
  }
  if (handle.includes("n")) {
    const proposedY = clamp(start.y + dyPct, 0, start.y + start.height - MIN);
    next.y = proposedY;
    next.height = start.height + start.y - proposedY;
  }

  // ---- aspect lock --------------------------------------------------------
  if (lockedRatio === null) {
    return clampToBounds(next);
  }

  // lockedRatio = widthPerHeight in pct-space
  const r = lockedRatio;

  if (handle === "e" || handle === "w") {
    // width drives height
    let h = next.width / r;
    h = clamp(h, MIN, 100 - next.y);
    let w = h * r;
    // if height was clamped by bottom edge, w already matches; if w overflows right edge, re-clamp
    if (w > 100 - next.x) {
      w = clamp(next.width, MIN, 100 - next.x);
      h = w / r;
    }
    next.width = clamp(w, MIN, 100 - next.x);
    next.height = clamp(h, MIN, 100 - next.y);
  } else if (handle === "n" || handle === "s") {
    // height drives width
    let w = next.height * r;
    w = clamp(w, MIN, 100 - next.x);
    let h = w / r;
    if (h > 100 - next.y) {
      h = clamp(next.height, MIN, 100 - next.y);
      w = h * r;
    }
    next.width = clamp(w, MIN, 100 - next.x);
    next.height = clamp(h, MIN, 100 - next.y);
  } else {
    // corner — anchored diagonally to opposite point.
    // ne -> sw, nw -> se, se -> nw, sw -> ne per spec. The anchor never moves.
    const isE = handle.includes("e");
    const isW = handle.includes("w");
    const isN = handle.includes("n");
    const isS = handle.includes("s");

    // Opposite corner is the anchor
    const anchorX = isE ? start.x : start.x + start.width;
    const anchorY = isS ? start.y : start.y + start.height;
    // Max size available from anchor to the far bounds
    const maxW = isE ? 100 - anchorX : anchorX;
    const maxH = isS ? 100 - anchorY : anchorY;

    const desiredW = next.width;
    const desiredH = next.height;

    const driveByWidth = Math.abs(dxPct) >= Math.abs(dyPct);
    let w: number;
    let h: number;

    if (driveByWidth) {
      w = clamp(desiredW, MIN, maxW);
      h = w / r;
      if (h < MIN || h > maxH) {
        h = clamp(desiredH, MIN, maxH);
        w = h * r;
        if (w > maxW) {
          w = maxW;
          h = w / r;
        }
      }
    } else {
      h = clamp(desiredH, MIN, maxH);
      w = h * r;
      if (w < MIN || w > maxW) {
        w = clamp(desiredW, MIN, maxW);
        h = w / r;
        if (h > maxH) {
          h = maxH;
          w = h * r;
        }
      }
    }

    w = clamp(w, MIN, maxW);
    h = clamp(h, MIN, maxH);
    // Re-derive to keep aspect exact after clamping
    if (driveByWidth) {
      h = w / r;
      if (h > maxH) {
        h = maxH;
        w = h * r;
      }
    } else {
      w = h * r;
      if (w > maxW) {
        w = maxW;
        h = w / r;
      }
    }

    // Place rect so anchor stays fixed
    next.width = w;
    next.height = h;
    next.x = isE ? anchorX : anchorX - w;
    next.y = isS ? anchorY : anchorY - h;
  }

  return clampToBounds(next);
}

function clampToBounds(r: Rect): Rect {
  let { x, y, width, height } = r;
  width = clamp(width, MIN, 100);
  height = clamp(height, MIN, 100);
  x = clamp(x, 0, 100 - width);
  y = clamp(y, 0, 100 - height);
  // if clamping x/y pushed rect out of bounds by MIN, shrink instead
  if (x + width > 100) width = 100 - x;
  if (y + height > 100) height = 100 - y;
  return { x, y, width, height };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CropOverlay() {
  const overlayRef = useRef<HTMLDivElement>(null);
  const store = useVideoStore();
  const { crop, aspectRatio, sourceAspectRatio } = useVideoState();

  const beginDrag = (e: React.PointerEvent<HTMLDivElement>, handle: Handle) => {
    e.preventDefault();
    e.stopPropagation();

    const bounds = overlayRef.current?.getBoundingClientRect();
    if (!bounds || bounds.width === 0 || bounds.height === 0) return;

    const start: Rect = { ...crop };
    const originX = e.clientX;
    const originY = e.clientY;

    const ratio = targetRatio(aspectRatio);
    const srcAspect = sourceAspectRatio > 0 ? sourceAspectRatio : 1;
    const lockedRatio = ratio !== null ? ratio / srcAspect : null;

    const target = e.currentTarget as HTMLElement;
    try {
      target.setPointerCapture(e.pointerId);
    } catch {
      // ignore — not all targets support pointer capture in tests
    }

    const onMove = (ev: PointerEvent) => {
      const dxPct = ((ev.clientX - originX) / bounds.width) * 100;
      const dyPct = ((ev.clientY - originY) / bounds.height) * 100;

      const next = computeNextRect({
        start,
        dxPct,
        dyPct,
        handle,
        lockedRatio,
      });

      store.setState((prev) => ({ ...prev, crop: next }));
    };

    const onEnd = (ev: PointerEvent) => {
      try {
        target.releasePointerCapture(ev.pointerId);
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
      aria-label="Crop area. Drag to move, handles to resize."
    >
      {/* Crop window — border + dim outside via large box-shadow (cheap, no extra elements) */}
      <div
        className="absolute border-2 border-kumo-brand bg-transparent cursor-move"
        style={{
          left: `${crop.x}%`,
          top: `${crop.y}%`,
          width: `${crop.width}%`,
          height: `${crop.height}%`,
          boxShadow: "0 0 0 9999px rgba(17, 24, 39, 0.45)",
        }}
        onPointerDown={(ev) => beginDrag(ev, "move")}
        role="button"
        tabIndex={0}
        aria-label="Move crop area"
      >
        {/* Alignment grid — 3x3, hairline, pointer-events none */}
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

        {HANDLES.map((h) => (
          <div
            key={h}
            role="button"
            tabIndex={0}
            aria-label={`Resize crop ${h}`}
            onPointerDown={(ev) => beginDrag(ev, h)}
            className={cn(
              "absolute size-3.5 -m-1 cursor-pointer rounded-full border-2 border-white bg-kumo-brand shadow-sm touch-none transition-transform hover:scale-110 active:scale-95",
              h.includes("n")
                ? "-top-1.5"
                : h.includes("s")
                  ? "-bottom-1.5"
                  : "top-1/2 -translate-y-1/2",
              h.includes("w")
                ? "-left-1.5"
                : h.includes("e")
                  ? "-right-1.5"
                  : "left-1/2 -translate-x-1/2",
            )}
            // Keep handle above grid; individual handle decides its own z
            style={{ zIndex: 1 }}
          />
        ))}
      </div>
    </div>
  );
}
