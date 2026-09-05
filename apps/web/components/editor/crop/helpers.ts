import type { PersistedCrop } from "./types";

export function formatPct(n: number) {
  return `${n.toFixed(1)}%`;
}

export const CROP_STORAGE_KEY = "ffmpeg_editor_crop_v1";

export function isValidPersistedCrop(v: unknown): v is PersistedCrop {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  const c = o.crop as Record<string, unknown> | undefined;
  if (
    !c ||
    typeof c.x !== "number" ||
    typeof c.y !== "number" ||
    typeof c.width !== "number" ||
    typeof c.height !== "number"
  )
    return false;
  if (![c.x, c.y, c.width, c.height].every((n) => Number.isFinite(n as number)))
    return false;
  if (
    c.x < 0 ||
    c.y < 0 ||
    c.width < 5 ||
    c.height < 5 ||
    c.x + c.width > 100.01 ||
    c.y + c.height > 100.01
  )
    return false;
  if (
    o.aspectRatio !== "custom" &&
    o.aspectRatio !== "1:1" &&
    o.aspectRatio !== "16:9" &&
    o.aspectRatio !== "21:9"
  )
    return false;
  // isCropMode is new — allow missing for backward compat with old saves, but if present must be boolean
  if (o.isCropMode !== undefined && typeof o.isCropMode !== "boolean")
    return false;
  return true;
}
