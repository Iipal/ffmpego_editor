"use client";

import { useRef } from "react";
import { useVideoState, useVideoStore } from "@/store/useVideoStore";

type Handle = "move" | "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

interface CropOverlayProps {
  isAutoZoomEnabled: boolean;
  onCanvasPanStart: (event: React.PointerEvent<HTMLDivElement>) => void;
}

const ratioFor = (aspectRatio: "custom" | "1:1" | "16:9" | "21:9") =>
  aspectRatio === "1:1"
    ? 1
    : aspectRatio === "16:9"
      ? 16 / 9
      : aspectRatio === "21:9"
        ? 21 / 9
        : null;

export function CropOverlay({
  isAutoZoomEnabled,
  onCanvasPanStart,
}: CropOverlayProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const videoStore = useVideoStore();
  const { crop, aspectRatio, sourceAspectRatio } = useVideoState();

  const startDrag = (
    event: React.PointerEvent<HTMLDivElement>,
    handle: Handle,
  ) => {
    event.preventDefault();
    const bounds = overlayRef.current?.getBoundingClientRect();
    if (!bounds) return;
    const start = { x: event.clientX, y: event.clientY, crop };
    const ratio = ratioFor(aspectRatio);
    const onMove = (moveEvent: PointerEvent) => {
      const deltaX = ((moveEvent.clientX - start.x) / bounds.width) * 100;
      const deltaY = ((moveEvent.clientY - start.y) / bounds.height) * 100;
      let next = { ...start.crop };
      if (handle === "move") {
        next.x = Math.min(
          Math.max(start.crop.x + deltaX, 0),
          100 - start.crop.width,
        );
        next.y = Math.min(
          Math.max(start.crop.y + deltaY, 0),
          100 - start.crop.height,
        );
      } else {
        if (handle.includes("e"))
          next.width = Math.max(
            5,
            Math.min(100 - next.x, start.crop.width + deltaX),
          );
        if (handle.includes("s"))
          next.height = Math.max(
            5,
            Math.min(100 - next.y, start.crop.height + deltaY),
          );
        if (handle.includes("w")) {
          next.x = Math.min(
            Math.max(start.crop.x + deltaX, 0),
            start.crop.x + start.crop.width - 5,
          );
          next.width = start.crop.width + start.crop.x - next.x;
        }
        if (handle.includes("n")) {
          next.y = Math.min(
            Math.max(start.crop.y + deltaY, 0),
            start.crop.y + start.crop.height - 5,
          );
          next.height = start.crop.height + start.crop.y - next.y;
        }
        if (ratio) {
          const widthPerHeight = ratio / sourceAspectRatio;
          next.height = Math.min(next.width / widthPerHeight, 100 - next.y);
          next.width = Math.min(next.height * widthPerHeight, 100 - next.x);
        }
      }
      videoStore.setState((previous) => ({ ...previous, crop: next }));
    };
    const onEnd = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onEnd);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onEnd);
  };

  return (
    <div
      ref={overlayRef}
      className="absolute inset-0 z-10 cursor-move touch-none"
      onPointerDown={(event) => {
        if (isAutoZoomEnabled) startDrag(event, "move");
        else onCanvasPanStart(event);
      }}
    >
      <div
        className="absolute border border-primary"
        style={{
          left: `${crop.x}%`,
          top: `${crop.y}%`,
          width: `${crop.width}%`,
          height: `${crop.height}%`,
          boxShadow: "0 0 0 9999px rgb(0 0 0 / 0.55)",
        }}
        onPointerDown={(event) => {
          event.stopPropagation();
          startDrag(event, "move");
        }}
      >
        {(["n", "s", "e", "w", "ne", "nw", "se", "sw"] as Handle[]).map(
          (handle) => (
            <div
              key={handle}
              aria-label={`Resize crop ${handle}`}
              onPointerDown={(event) => {
                event.stopPropagation();
                startDrag(event, handle);
              }}
              className={`absolute size-2 rounded-full border-2 border-background bg-primary ${handle.includes("n") ? "-top-1.5" : handle.includes("s") ? "-bottom-1.5" : "top-1/2 -translate-y-1/2"} ${handle.includes("w") ? "-left-1.5" : handle.includes("e") ? "-right-1.5" : "left-1/2 -translate-x-1/2"}`}
            />
          ),
        )}
      </div>
    </div>
  );
}
