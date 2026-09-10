import { mobileLayoutService } from "@/lib/mobile-layout";
import type { MobileLayout } from "@/lib/mobile-layout";
import { videoFileService } from "@/lib/video-file";
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
  cancelled: "Cancelled",
};

export function statusColor(s: BulkStatus): string {
  switch (s) {
    case "completed":
      return "bg-kumo-success";
    case "failed":
    case "cancelled":
      return "bg-kumo-warn";
    case "queued":
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
      mobileLayoutService.loadPrefForMode("stacked") ??
      mobileLayoutService.loadPrefForMode("full") ??
      mobileLayoutService.createDefaultLayout("stacked", 0.5)
    );
  } catch {
    return mobileLayoutService.createDefaultLayout("stacked", 0.5);
  }
}

/** Basename without extension — `videoFileService.stripExtension` re-exported under the bulk-local name. */
export function baseNameOf(name: string): string {
  return videoFileService.stripExtension(name);
}
