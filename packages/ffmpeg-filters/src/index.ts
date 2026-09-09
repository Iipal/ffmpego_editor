export interface PixelCrop {
  cw: number;
  ch: number;
  cx: number;
  cy: number;
}

export interface CropPercentages {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function cropPercentToPixels(
  crop: CropPercentages,
  sourceWidth: number,
  sourceHeight: number,
): PixelCrop {
  const cw = Math.max(1, Math.min(sourceWidth, Math.round((crop.width / 100) * sourceWidth)));
  const ch = Math.max(1, Math.min(sourceHeight, Math.round((crop.height / 100) * sourceHeight)));
  return {
    cw,
    ch,
    cx: Math.max(0, Math.min(sourceWidth - cw, Math.round((crop.x / 100) * sourceWidth))),
    cy: Math.max(0, Math.min(sourceHeight - ch, Math.round((crop.y / 100) * sourceHeight))),
  };
}

export function zoneToPixels(
  zone: CropPercentages,
  sourceWidth: number,
  sourceHeight: number,
  normalized = true,
): PixelCrop {
  return cropPercentToPixels(
    normalized
      ? { x: zone.x * 100, y: zone.y * 100, width: zone.width * 100, height: zone.height * 100 }
      : zone,
    sourceWidth,
    sourceHeight,
  );
}

/**
 * Visual filter stack — single source of truth for server `-vf` building
 * and live canvas/CSS preview.
 *
 * Order is deterministic (eq → denoise → deshake → transform) so the
 * preview and the exporter can never drift: both call
 * {@link buildVisualVideoFilters}.
 *
 * - `eq`: maps 1:1 to ffmpeg `eq` and to CSS
 *   `brightness()/contrast()/saturate()`. `gamma` has no CSS equivalent
 *   and is server-only (preview notes it as approximate).
 * - `denoise` (`hqdn3d`): no CSS equivalent; preview is a no-op by design.
 * - `deshake`: no CSS equivalent; preview is a no-op by design.
 * - `transform` (flip/rotate): maps to `hflip`/`vflip`/`transpose` on the
 *   server and to canvas 2D transforms / CSS `scaleX(-1)/rotate()` live.
 */
export interface EqSettings {
  /** -1..1, default 0 */
  brightness: number;
  /** 0..2, default 1 */
  contrast: number;
  /** 0..3, default 1 */
  saturation: number;
  /** 0.1..10, default 1 (server-only: no CSS equivalent) */
  gamma: number;
}

export interface DenoiseSettings {
  enabled: boolean;
  /** 0..10 UI strength, default 4. Maps to hqdn3d preset scaling. */
  strength: number;
}

export interface DeshakeSettings {
  enabled: boolean;
}

export interface TransformSettings {
  flipH: boolean;
  flipV: boolean;
  /** Clockwise degrees. */
  rotate: 0 | 90 | 180 | 270;
}

export interface VisualFilters {
  eq: EqSettings;
  denoise: DenoiseSettings;
  deshake: DeshakeSettings;
  transform: TransformSettings;
}

export const DEFAULT_VISUAL_FILTERS: VisualFilters = {
  eq: { brightness: 0, contrast: 1, saturation: 1, gamma: 1 },
  denoise: { enabled: false, strength: 4 },
  deshake: { enabled: false },
  transform: { flipH: false, flipV: false, rotate: 0 },
};

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function fmt(n: number, digits = 3): string {
  const fixed = n.toFixed(digits);
  // Keep ffmpeg args stable: strip trailing zeros ("1.500" -> "1.5").
  return fixed.includes(".") ? fixed.replace(/\.?0+$/, "") || "0" : fixed;
}

function isDefaultEq(eq: EqSettings): boolean {
  return (
    eq.brightness === 0 &&
    eq.contrast === 1 &&
    eq.saturation === 1 &&
    eq.gamma === 1
  );
}

export function isVisualFiltersDefault(v: VisualFilters | undefined | null): boolean {
  if (!v) return true;
  return (
    isDefaultEq(v.eq) &&
    !v.denoise.enabled &&
    !v.deshake.enabled &&
    !v.transform.flipH &&
    !v.transform.flipV &&
    v.transform.rotate === 0
  );
}

export function normalizeVisualFilters(
  input?: Partial<VisualFilters> | null,
): VisualFilters {
  const d = DEFAULT_VISUAL_FILTERS;
  return {
    eq: {
      brightness: clamp(Number(input?.eq?.brightness ?? d.eq.brightness), -1, 1),
      contrast: clamp(Number(input?.eq?.contrast ?? d.eq.contrast), 0, 2),
      saturation: clamp(Number(input?.eq?.saturation ?? d.eq.saturation), 0, 3),
      gamma: clamp(Number(input?.eq?.gamma ?? d.eq.gamma), 0.1, 10),
    },
    denoise: {
      enabled: !!input?.denoise?.enabled,
      strength: clamp(Number(input?.denoise?.strength ?? d.denoise.strength), 0, 10),
    },
    deshake: { enabled: !!input?.deshake?.enabled },
    transform: {
      flipH: !!input?.transform?.flipH,
      flipV: !!input?.transform?.flipV,
      rotate: ([0, 90, 180, 270] as const).includes(
        input?.transform?.rotate as never,
      )
        ? (input?.transform?.rotate as 0 | 90 | 180 | 270)
        : 0,
    },
  };
}

/** `eq=brightness=…:contrast=…:saturation=…:gamma=…`, or null when default. */
export function buildEqFilter(eq: EqSettings): string | null {
  if (isDefaultEq(eq)) return null;
  return `eq=brightness=${fmt(eq.brightness)}:contrast=${fmt(eq.contrast)}:saturation=${fmt(eq.saturation)}:gamma=${fmt(eq.gamma)}`;
}

/**
 * `hqdn3d` from a 0..10 strength. Strength scales the classic
 * `4:3:6:4.5` preset linearly (strength 4 ≈ defaults).
 */
export function buildDenoiseFilter(denoise: DenoiseSettings): string | null {
  if (!denoise.enabled) return null;
  const s = clamp(denoise.strength, 0, 10) / 4;
  const lumaSpatial = fmt(4 * s);
  const chromaSpatial = fmt(3 * s);
  const lumaTmp = fmt(6 * s);
  const chromaTmp = fmt(4.5 * s);
  return `hqdn3d=${lumaSpatial}:${chromaSpatial}:${lumaTmp}:${chromaTmp}`;
}

/** `deshake`, or null when disabled. */
export function buildDeshakeFilter(deshake: DeshakeSettings): string | null {
  return deshake.enabled ? "deshake" : null;
}

/**
 * Transform filters in deterministic order: rotate first, then flips.
 * - 90 → `transpose=1`, 270 → `transpose=2`, 180 → `hflip,vflip`
 *   (two entries so join(",") yields `hflip,vflip`).
 */
export function buildTransformFilters(t: TransformSettings): string[] {
  const out: string[] = [];
  if (t.rotate === 90) out.push("transpose=1");
  else if (t.rotate === 270) out.push("transpose=2");
  else if (t.rotate === 180) out.push("hflip", "vflip");
  if (t.flipH) out.push("hflip");
  if (t.flipV) out.push("vflip");
  return out;
}

/**
 * Full visual stack as `-vf` chain entries, in fixed order:
 * eq → hqdn3d → deshake → transform. Empty when everything is default.
 * Both the server builder and any client-side `-vf` preview must use this.
 */
export function buildVisualVideoFilters(v: VisualFilters): string[] {
  const out: string[] = [];
  const eq = buildEqFilter(v.eq);
  if (eq) out.push(eq);
  const denoise = buildDenoiseFilter(v.denoise);
  if (denoise) out.push(denoise);
  const deshake = buildDeshakeFilter(v.deshake);
  if (deshake) out.push(deshake);
  out.push(...buildTransformFilters(v.transform));
  return out;
}

/**
 * CSS `filter` string matching {@link buildEqFilter} for live preview.
 * Uses the same `ctx.filter` / CSS syntax: brightness/contrast/saturate.
 * Returns "" when default (caller should set `filter: none`).
 * Gamma, denoise and deshake have no CSS equivalent and are intentionally
 * excluded — see {@link visualPreviewNotes}.
 */
export function buildCanvasCssFilter(v: VisualFilters): string {
  const parts: string[] = [];
  if (v.eq.brightness !== 0) parts.push(`brightness(${fmt(1 + v.eq.brightness)})`);
  if (v.eq.contrast !== 1) parts.push(`contrast(${fmt(v.eq.contrast)})`);
  if (v.eq.saturation !== 1) parts.push(`saturate(${fmt(v.eq.saturation)})`);
  return parts.join(" ");
}

/**
 * CSS `transform` for flip/rotate preview. Returns "" when identity.
 * Applied to the media element itself (not the zoom/pan stage) so it
 * composes with canvas zoom instead of fighting it.
 */
export function buildCanvasCssTransform(t: TransformSettings): string {
  const parts: string[] = [];
  if (t.flipH) parts.push("scaleX(-1)");
  if (t.flipV) parts.push("scaleY(-1)");
  if (t.rotate !== 0) parts.push(`rotate(${t.rotate}deg)`);
  return parts.join(" ");
}

/**
 * Human notes for preview limitations (denoise/deshake/gamma are
 * server-only). Shown in the UI so users aren't surprised.
 */
export function visualPreviewNotes(v: VisualFilters): string[] {
  const notes: string[] = [];
  if (v.eq.gamma !== 1)
    notes.push("Gamma preview is approximate (no CSS equivalent).");
  if (v.denoise.enabled)
    notes.push("Denoise (hqdn3d) has no live preview — check the export.");
  if (v.deshake.enabled)
    notes.push("Deshake has no live preview — check the export.");
  return notes;
}

export function buildSetptsFilter(speed: number): string {
  return `setpts=${(1 / speed).toFixed(6)}*PTS`;
}

export function buildAtempoFilter(speed: number): string {
  if (speed > 0 && speed < 0.5) {
    const factors: string[] = [];
    let remaining = speed;
    while (remaining < 0.5) {
      factors.push("atempo=0.5");
      remaining *= 2;
    }
    factors.push(`atempo=${remaining.toFixed(6)}`);
    return factors.join(",");
  }
  return `atempo=${speed.toFixed(6)}`;
}
