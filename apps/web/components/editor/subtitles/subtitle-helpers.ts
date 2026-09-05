import type { CSSProperties } from "react";
import { clamp } from "@/lib/mobile-layout";
import type {
  Subtitle,
  SubtitleStyle,
} from "@/lib/subtitles/subtitleTypes";

// js-hoist-regexp: hoisted RegExp (avoid per-render creation, no /g mutable state)
const HEX_VALID_RE = /^#([0-9A-Fa-f]{6}|[0-9A-Fa-f]{3})$/;
const HEX_3_RE = /^#[0-9A-Fa-f]{3}$/;
const HEX_6_RE = /^#[0-9A-Fa-f]{6}$/;

// js-cache-function-results: module-level cache for renderSubtitleStyle
const subtitleStyleCache = new Map<string, CSSProperties>();

export function getCachedSubtitleStyleKey(style: SubtitleStyle): string {
  return `${style.fontFamily}|${style.fontSize}|${style.color}|${style.outlineEnabled}|${style.outlineThickness}|${style.outlineColor}|${style.shadowEnabled}|${style.shadowSize}|${style.shadowOffsetX}|${style.shadowOffsetY}|${style.shadowColor}|${style.backgroundEnabled}|${style.backgroundColor}|${style.backgroundPadding}|${style.backgroundBorderRadius}`;
}

export function timeToPercent(
  time: number,
  start: number,
  end: number,
): number {
  if (end <= start) return 0;
  return clamp(((time - start) / (end - start)) * 100, 0, 100);
}

export function percentToTime(
  percent: number,
  start: number,
  end: number,
): number {
  const p = clamp(percent, 0, 100) / 100;
  return start + p * (end - start);
}

export function generateId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }
}

export function isValidHexColor(v: string): boolean {
  return HEX_VALID_RE.test(v.trim());
}

export function normalizeHex(v: string): string {
  const t = v.trim();
  if (HEX_3_RE.test(t)) {
    return `#${t[1]}${t[1]}${t[2]}${t[2]}${t[3]}${t[3]}`.toUpperCase();
  }
  if (HEX_6_RE.test(t)) return t.toUpperCase();
  return t;
}

export function getSubtitleTrack(s: Subtitle): number {
  return typeof (s as unknown as { track?: number }).track === "number"
    ? (s as unknown as { track: number }).track
    : 0;
}

export function intervalsOverlap(
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number,
): boolean {
  return aStart < bEnd && bStart < aEnd;
}

export function findFirstFreeTrack(
  subtitles: Subtitle[],
  start: number,
  end: number,
  excludeId?: string,
): number {
  // js-set-map-lookups: use Set for O(1) track existence
  const existingTracks = new Set<number>();
  for (const s of subtitles) {
    if (excludeId && s.id === excludeId) continue;
    existingTracks.add(getSubtitleTrack(s));
  }
  // js-min-max-loop: loop for max instead of Math.max(...sorted)
  let maxTrack = -1;
  for (const t of existingTracks) if (t > maxTrack) maxTrack = t;
  for (let t = 0; t <= maxTrack; t++) {
    let overlaps = false;
    for (const s of subtitles) {
      if (excludeId && s.id === excludeId) continue;
      if (getSubtitleTrack(s) !== t) continue;
      if (intervalsOverlap(s.startTime, s.endTime, start, end)) {
        overlaps = true;
        break;
      }
    }
    if (!overlaps) return t;
  }
  return maxTrack + 1;
}

export function renderSubtitleStyle(style: SubtitleStyle): CSSProperties {
  const key = getCachedSubtitleStyleKey(style);
  const cached = subtitleStyleCache.get(key);
  if (cached) return cached;
  const hasOutline = style.outlineEnabled && style.outlineThickness > 0;
  const hasShadow = style.shadowEnabled && style.shadowSize > 0;
  const hasBackground = style.backgroundEnabled;
  const shadow = hasShadow
    ? `${style.shadowOffsetX}px ${style.shadowOffsetY}px ${style.shadowSize}px ${style.shadowColor}`
    : undefined;
  const result: CSSProperties = {
    fontFamily: style.fontFamily,
    fontSize: `${style.fontSize / 4}px`,
    color: style.color,
    WebkitTextStroke: hasOutline
      ? `${style.outlineThickness}px ${style.outlineColor}`
      : undefined,
    textShadow: shadow
      ? hasOutline
        ? `${shadow}, -${style.outlineThickness}px -${style.outlineThickness}px 0 ${style.outlineColor}, ${style.outlineThickness}px -${style.outlineThickness}px 0 ${style.outlineColor}, -${style.outlineThickness}px ${style.outlineThickness}px 0 ${style.outlineColor}, ${style.outlineThickness}px ${style.outlineThickness}px 0 ${style.outlineColor}`
        : shadow
      : hasOutline
        ? `-1px -1px 0 ${style.outlineColor}, 1px -1px 0 ${style.outlineColor}, -1px 1px 0 ${style.outlineColor}, 1px 1px 0 ${style.outlineColor}`
        : undefined,
    backgroundColor: hasBackground ? style.backgroundColor : "transparent",
    padding: hasBackground
      ? `${style.backgroundPadding / 3}px ${style.backgroundPadding / 2}px`
      : "0",
    borderRadius: hasBackground ? `${style.backgroundBorderRadius}px` : "0",
    border: hasBackground ? undefined : "none",
    outline: hasBackground ? undefined : "none",
    boxShadow: hasBackground ? undefined : "none",
    lineHeight: 1.2,
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    paintOrder: "stroke fill" as unknown as string,
  } as CSSProperties;
  subtitleStyleCache.set(key, result);
  return result;
}
