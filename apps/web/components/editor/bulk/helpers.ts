import {
  createDefaultLayout,
  loadPrefForMode,
} from "@/lib/mobile-layout";
import type { MobileLayout } from "@/lib/mobile-layout";
import type { BulkStatus } from "./types";

// ---------------------------------------------------------------------------
// Shared watermark image cache
// ---------------------------------------------------------------------------

export let wmImg: HTMLImageElement | null = null;
let wmPromise: Promise<HTMLImageElement | null> | null = null;

export function ensureWatermark(): Promise<HTMLImageElement | null> {
  if (wmImg) return Promise.resolve(wmImg);
  if (!wmPromise) {
    wmPromise = new Promise((resolve) => {
      const img = new window.Image();
      img.src = "/minozavr.png";
      img.onload = () => {
        wmImg = img;
        resolve(img);
      };
      img.onerror = () => resolve(null);
    });
  }
  return wmPromise;
}

// ---------------------------------------------------------------------------
// Status helpers
// ---------------------------------------------------------------------------

export const STATUS_LABEL: Record<BulkStatus, string> = {
  idle: "Ready",
  queued: "Queued",
  uploading: "Uploading",
  processing: "Rendering",
  saving: "Saving",
  completed: "Done",
  failed: "Failed",
};

export function statusColor(s: BulkStatus): string {
  switch (s) {
    case "completed":
      return "bg-kumo-success";
    case "failed":
      return "bg-kumo-warn";
    case "uploading":
    case "processing":
    case "saving":
      return "bg-kumo-brand animate-pulse";
    default:
      return "bg-kumo-subtle/40";
  }
}

// ---------------------------------------------------------------------------
// Layout / filename helpers
// ---------------------------------------------------------------------------

export function loadStackedLayout(): MobileLayout {
  try {
    return (
      loadPrefForMode("stacked") ??
      loadPrefForMode("full") ??
      createDefaultLayout("stacked", 0.5)
    );
  } catch {
    return createDefaultLayout("stacked", 0.5);
  }
}

export { stripExtension as baseNameOf } from "@/lib/video-file";
