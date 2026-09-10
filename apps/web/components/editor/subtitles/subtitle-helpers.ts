import type { CSSProperties } from "react";
import { mobileLayoutService } from "@/lib/mobile-layout";
import type { Subtitle, SubtitleStyle } from "@/lib/subtitles/subtitleStorage";

// js-hoist-regexp: hoisted RegExp (avoid per-render creation, no /g mutable state)
const HEX_VALID_RE = /^#([0-9A-Fa-f]{6}|[0-9A-Fa-f]{3})$/;
const HEX_3_RE = /^#[0-9A-Fa-f]{3}$/;
const HEX_6_RE = /^#[0-9A-Fa-f]{6}$/;

// js-cache-function-results: module-level cache for renderSubtitleStyle.
// Bounded (Map insertion order) so long sessions can't grow it unbounded.
const SUBTITLE_STYLE_CACHE_MAX = 500;
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
  return mobileLayoutService.clamp(
    ((time - start) / (end - start)) * 100,
    0,
    100,
  );
}

export function percentToTime(
  percent: number,
  start: number,
  end: number,
): number {
  const p = mobileLayoutService.clamp(percent, 0, 100) / 100;
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
  // js-early-exit: empty list needs track 0
  if (subtitles.length === 0) return 0;
  // js-combine-iterations + js-set-map-lookups: single pass groups by track
  // (was: one pass for the track set + one full scan per candidate track)
  const byTrack = new Map<number, Subtitle[]>();
  // js-min-max-loop: loop for max instead of Math.max(...spread)
  let maxTrack = -1;
  for (const s of subtitles) {
    if (excludeId && s.id === excludeId) continue;
    const t = getSubtitleTrack(s);
    let group = byTrack.get(t);
    if (!group) {
      group = [];
      byTrack.set(t, group);
    }
    group.push(s);
    if (t > maxTrack) maxTrack = t;
  }
  if (maxTrack < 0) return 0;
  for (let t = 0; t <= maxTrack; t++) {
    const group = byTrack.get(t);
    if (!group) return t;
    let overlaps = false;
    for (const s of group) {
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
  if (subtitleStyleCache.size > SUBTITLE_STYLE_CACHE_MAX) {
    const oldest = subtitleStyleCache.keys().next();
    if (!oldest.done) subtitleStyleCache.delete(oldest.value);
  }
  return result;
}
