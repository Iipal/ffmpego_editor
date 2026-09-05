"use client";

import { useCallback, useEffect } from "react";
import { toast } from "sonner";
import { useVideoState, useVideoStore } from "@/store/useVideoStore";
import { CROP_STORAGE_KEY, formatPct, isValidPersistedCrop } from "./helpers";
import type { CropAspect, CropPixelReadout, CropRect, PersistedCrop } from "./types";

export interface CropControls {
  crop: CropRect;
  aspectRatio: CropAspect;
  isCropMode: boolean;
  hasSource: boolean;
  px: CropPixelReadout | null;
  cropLabel: string;
  sourceLabel: string;
  isFullFrame: boolean;
  resetCrop: () => void;
  toggleCropMode: () => void;
  saveCrop: () => void;
}

export function useCropControls(): CropControls {
  const store = useVideoStore();
  const { crop, aspectRatio, sourceWidth, sourceHeight, isCropMode } =
    useVideoState() as {
      crop: CropRect;
      aspectRatio: CropAspect;
      sourceWidth: number;
      sourceHeight: number;
      isCropMode: boolean;
    };

  const hasSource = sourceWidth > 0 && sourceHeight > 0;

  // Pixel-space readout — derived each render, no memo/caching needed (cheap).
  const px = hasSource
    ? {
        x: Math.round((crop.x / 100) * sourceWidth),
        y: Math.round((crop.y / 100) * sourceHeight),
        w: Math.round((crop.width / 100) * sourceWidth),
        h: Math.round((crop.height / 100) * sourceHeight),
        x2: Math.round(((crop.x + crop.width) / 100) * sourceWidth),
        y2: Math.round(((crop.y + crop.height) / 100) * sourceHeight),
      }
    : null;

  const cropLabel =
    hasSource && px
      ? `${px.w} × ${px.h} px`
      : `${formatPct(crop.width)} × ${formatPct(crop.height)}`;
  const sourceLabel = hasSource ? `${sourceWidth} × ${sourceHeight} px` : "—";
  const isFullFrame =
    crop.x === 0 && crop.y === 0 && crop.width === 100 && crop.height === 100;

  const resetCrop = useCallback(() => {
    try {
      const raw = localStorage.getItem(CROP_STORAGE_KEY);
      if (!raw) {
        toast.error("No saved crop settings found", {
          description: "Click Save to store the current crop first.",
        });
        return;
      }
      const parsed = JSON.parse(raw) as unknown;
      if (!isValidPersistedCrop(parsed)) {
        toast.error("Saved crop settings are invalid");
        return;
      }
      const p = parsed as PersistedCrop & { isCropMode?: boolean };
      store.setState((prev) => ({
        ...prev,
        crop: p.crop,
        aspectRatio: p.aspectRatio,
        isCropMode:
          typeof p.isCropMode === "boolean" ? p.isCropMode : prev.isCropMode,
      }));
      toast.success("Crop restored from saved settings", {
        description: `${p.aspectRatio} · ${formatPct(p.crop.width)} × ${formatPct(p.crop.height)}${typeof p.isCropMode === "boolean" && p.isCropMode ? " · enabled" : ""}`,
      });
    } catch {
      toast.error("Failed to restore crop settings");
    }
  }, [store]);

  const toggleCropMode = useCallback(() => {
    store.setState((prev) => ({ ...prev, isCropMode: !prev.isCropMode }));
  }, [store]);

  // Hydrate saved crop once on mount — keeps Save meaningful across reloads.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(CROP_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as unknown;
      if (!isValidPersistedCrop(parsed)) return;
      const p = parsed as PersistedCrop & { isCropMode?: boolean };
      store.setState((prev) => {
        // Don't clobber an active edit session; only restore if still at defaults.
        const isDefault =
          prev.crop.x === 0 &&
          prev.crop.y === 0 &&
          prev.crop.width === 100 &&
          prev.crop.height === 100 &&
          prev.aspectRatio === "custom" &&
          prev.isCropMode === false;
        if (!isDefault) return prev;
        return {
          ...prev,
          crop: p.crop,
          aspectRatio: p.aspectRatio,
          isCropMode:
            typeof p.isCropMode === "boolean" ? p.isCropMode : prev.isCropMode,
        };
      });
    } catch {}
  }, [store]);

  const saveCrop = useCallback(() => {
    try {
      const payload: PersistedCrop = { crop, aspectRatio, isCropMode };
      localStorage.setItem(CROP_STORAGE_KEY, JSON.stringify(payload));
      toast.success("Crop settings saved", {
        description: `${aspectRatio} · ${formatPct(crop.width)} × ${formatPct(crop.height)} ${isCropMode ? "· enabled" : "· disabled"}`,
      });
    } catch {
      toast.error("Failed to save crop settings");
    }
  }, [crop, aspectRatio, isCropMode]);

  return {
    crop,
    aspectRatio,
    isCropMode,
    hasSource,
    px,
    cropLabel,
    sourceLabel,
    isFullFrame,
    resetCrop,
    toggleCropMode,
    saveCrop,
  };
}
