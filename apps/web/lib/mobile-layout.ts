export type MobileLayoutMode = "full" | "stacked";
export type CropZoneId = "zone-1" | "zone-2";
export type CropRole = "camera" | "gameplay" | "content" | "custom";

export interface CropZone {
  id: CropZoneId;
  x: number;
  y: number;
  width: number;
  height: number;
  zoom: number;
  role?: CropRole;
  locked?: boolean;
}

export interface MobileLayout {
  version: 1;
  sourceAspectRatio: number;
  outputAspectRatio: number;
  mode: MobileLayoutMode;
  zones: CropZone[];
  splitRatio: number;
  background: { type: "blur"; intensity: number } | { type: "solid"; value: string } | { type: "none" };
}

export const MIN_SPLIT = 0.2;
export const MAX_SPLIT = 0.8;
export const MIN_ZONE = 0.05;
export const OUTPUT_W = 1080;
export const OUTPUT_H = 1920;

export function zoneAspect(mode: MobileLayoutMode, split: number, id: CropZoneId) {
  if (mode === "full") return 9 / 16;
  const h = id === "zone-1" ? OUTPUT_H * split : OUTPUT_H * (1 - split);
  return OUTPUT_W / h;
}

export function clamp(v: number, min: number, max: number) { return Math.max(min, Math.min(max, v)); }

export function clampZone(z: CropZone): CropZone {
  let w = clamp(z.width, MIN_ZONE, 1);
  let h = clamp(z.height, MIN_ZONE, 1);
  let x = clamp(z.x, 0, 1 - w);
  let y = clamp(z.y, 0, 1 - h);
  let zoom = clamp(z.zoom ?? 1, 0.5, 3);
  return { ...z, x, y, width: w, height: h, zoom };
}

export function enforceZoneAspect(z: CropZone, mode: MobileLayoutMode, split: number, sourceAR = 16 / 9): CropZone {
  const A = zoneAspect(mode, split, z.id);
  const R = A / sourceAR;
  let w = z.width;
  let h = z.height;
  const currentR = w / h;
  if (Math.abs(currentR - R) > 0.001) {
    const cx = z.x + w / 2;
    const cy = z.y + h / 2;
    const area = w * h;
    const scale = Math.sqrt(area / (R));
    h = scale;
    w = h * R;
    w = clamp(w, MIN_ZONE, 0.98);
    h = clamp(w / R, MIN_ZONE, 0.98);
    w = h * R;
    let x = clamp(cx - w / 2, 0, 1 - w);
    let y = clamp(cy - h / 2, 0, 1 - h);
    if (x + w > 1) w = 1 - x;
    if (y + h > 1) h = 1 - y;
    if (Math.abs(w / h - R) > 0.001) {
      h = w / R;
      if (y + h > 1) { h = 1 - y; w = h * R; }
    }
    return { ...z, x, y, width: w, height: h };
  }
  return z;
}

export function normalizeLayout(l: MobileLayout): MobileLayout {
  const split = clamp(l.splitRatio ?? 0.5, MIN_SPLIT, MAX_SPLIT);
  const sourceAR = 16 / 9;
  let zones = l.zones.map(clampZone).map((z) => enforceZoneAspect(z, l.mode, split, sourceAR));
  zones = zones.map((z) => {
    let x = clamp(z.x, 0, 1 - z.width);
    let y = clamp(z.y, 0, 1 - z.height);
    return { ...z, x, y };
  });
  return { ...l, splitRatio: split, zones, outputAspectRatio: 9 / 16, sourceAspectRatio: sourceAR };
}

export function resizeZoneAspectLocked(start: CropZone, handle: string, dx: number, dy: number, mode: MobileLayoutMode, split: number, sourceAR = 16 / 9): CropZone {
  const A = zoneAspect(mode, split, start.id);
  const R = A / sourceAR;
  let tentW: number, tentH: number;
  let anchorX: number, anchorY: number;
  const sx = start.x, sy = start.y, sw = start.width, sh = start.height;
  if (handle === "se") {
    anchorX = sx; anchorY = sy;
    tentW = sw + dx; tentH = sh + dy;
    const scaleW = tentW / sw; const scaleH = tentH / sh;
    const scale = (scaleW + scaleH) / 2;
    const clampedScale = clamp(scale, MIN_ZONE / sw, 2);
    let w = sw * clampedScale; let h = w / R;
    w = clamp(w, MIN_ZONE, 1 - anchorX); h = clamp(h, MIN_ZONE, 1 - anchorY);
    if (anchorX + w > 1) w = 1 - anchorX;
    if (anchorY + h > 1) { h = 1 - anchorY; w = h * R; }
    if (w / h - R > 0.001) h = w / R;
    return { ...start, x: anchorX, y: anchorY, width: w, height: h };
  }
  if (handle === "nw") {
    anchorX = sx + sw; anchorY = sy + sh;
    tentW = sw - dx; tentH = sh - dy;
    const scaleW = tentW / sw; const scaleH = tentH / sh;
    const scale = (scaleW + scaleH) / 2;
    const clampedScale = clamp(scale, MIN_ZONE / sw, 4);
    let w = sw * clampedScale; let h = w / R;
    w = clamp(w, MIN_ZONE, anchorX); h = clamp(h, MIN_ZONE, anchorY);
    let x = anchorX - w; let y = anchorY - h;
    if (x < 0) { x = 0; w = anchorX; h = w / R; y = anchorY - h; }
    if (y < 0) { y = 0; h = anchorY; w = h * R; x = anchorX - w; }
    x = clamp(x, 0, 1 - w); y = clamp(y, 0, 1 - h);
    return { ...start, x, y, width: w, height: h };
  }
  if (handle === "ne") {
    anchorX = sx; anchorY = sy + sh;
    tentW = sw + dx; tentH = sh - dy;
    const scaleW = tentW / sw; const scaleH = tentH / sh;
    const scale = (scaleW + scaleH) / 2;
    const clampedScale = clamp(scale, MIN_ZONE / sw, 4);
    let w = sw * clampedScale; let h = w / R;
    w = clamp(w, MIN_ZONE, 1 - anchorX); h = clamp(h, MIN_ZONE, anchorY);
    let x = anchorX; let y = anchorY - h;
    if (x + w > 1) { w = 1 - x; h = w / R; y = anchorY - h; }
    if (y < 0) { y = 0; h = anchorY; w = h * R; }
    x = clamp(x, 0, 1 - w); y = clamp(y, 0, 1 - h);
    return { ...start, x, y, width: w, height: h };
  }
  if (handle === "sw") {
    anchorX = sx + sw; anchorY = sy;
    tentW = sw - dx; tentH = sh + dy;
    const scaleW = tentW / sw; const scaleH = tentH / sh;
    const scale = (scaleW + scaleH) / 2;
    const clampedScale = clamp(scale, MIN_ZONE / sw, 4);
    let w = sw * clampedScale; let h = w / R;
    w = clamp(w, MIN_ZONE, anchorX); h = clamp(h, MIN_ZONE, 1 - anchorY);
    let x = anchorX - w; let y = anchorY;
    if (x < 0) { x = 0; w = anchorX; h = w / R; }
    if (y + h > 1) { h = 1 - y; w = h * R; x = anchorX - w; }
    x = clamp(x, 0, 1 - w); y = clamp(y, 0, 1 - h);
    return { ...start, x, y, width: w, height: h };
  }
  return start;
}

export function validateLayout(l: MobileLayout): string | null {
  if (!["full", "stacked"].includes(l.mode)) return "Invalid mode";
  if (l.mode === "full" && l.zones.length !== 1) return "Full needs 1 zone";
  if (l.mode === "stacked" && l.zones.length !== 2) return "Stacked needs 2 zones";
  if (l.splitRatio < MIN_SPLIT || l.splitRatio > MAX_SPLIT) return "Split out of range";
  for (const z of l.zones) {
    if (z.x < 0 || z.y < 0 || z.x + z.width > 1.001 || z.y + z.height > 1.001) return `Zone ${z.id} out of bounds`;
    if (z.width < MIN_ZONE || z.height < MIN_ZONE) return `Zone ${z.id} too small`;
  }
  return null;
}

export function defaultZone(id: CropZoneId, x: number, w: number, h: number, role?: CropRole): CropZone {
  return { id, x, y: (1 - h) / 2, width: w, height: h, zoom: 1, role };
}

export function createDefaultLayout(mode: MobileLayoutMode, split = 0.5, sourceAR = 16 / 9): MobileLayout {
  const fullAspect = 9 / 16;
  const fullH = 0.9;
  const fullW = fullH * (fullAspect * sourceAR);
  if (mode === "full") {
    const w = Math.min(fullW, 0.50625);
    const h = w / (fullAspect * sourceAR) * sourceAR / sourceAR;
    // normalized: width = height * (9/16 * sourceAR) ??? simplified: for source 16:9 normalized to 1x1, 9:16 crop width = height * 9/16 * 16/9? = height*? fallback to centered
    const cw = 0.31640625;
    const ch = 1;
    return normalizeLayout({
      version: 1, sourceAspectRatio: sourceAR, outputAspectRatio: 9 / 16, mode, zones: [{ id: "zone-1", x: (1 - cw) / 2, y: 0, width: cw, height: ch, zoom: 1, role: "content" }], splitRatio: 0.5, background: { type: "blur", intensity: 12 }
    });
  }
  const a1 = zoneAspect("stacked", split, "zone-1");
  const a2 = zoneAspect("stacked", split, "zone-2");
  // For 16:9 source, zone AR relative to source normalized
  const h1 = 0.85; const w1 = h1 * a1 / sourceAR * sourceAR;
  const h2 = 0.75; const w2 = h2 * a2 / sourceAR * sourceAR;
  // Correct: w = h * (zoneAspect / sourceAR) ??? For source normalized 1:1 but rendered 16:9, use w = h * zoneAspect / (sourceAR)? Keep simple use precomputed
  const z1w = 0.32; const z1h = z1w / a1 * sourceAR;
  const z2w = 0.42; const z2h = z2w / a2 * sourceAR;
  return normalizeLayout({
    version: 1, sourceAspectRatio: sourceAR, outputAspectRatio: 9 / 16, mode: "stacked", splitRatio: split, background: { type: "blur", intensity: 12 },
    zones: [
      { id: "zone-1", x: 0.06, y: clamp((1 - z1h) / 2, 0, 1 - z1h), width: z1w, height: z1h, zoom: 1, role: "camera" },
      { id: "zone-2", x: 0.5 - z2w / 2, y: clamp((1 - z2h) / 2, 0, 1 - z2h), width: z2w, height: z2h, zoom: 1, role: "gameplay" },
    ]
  });
}

export function autoSuggest(mode: MobileLayoutMode, split = 0.5): MobileLayout {
  if (mode === "full") return createDefaultLayout("full", 0.5);
  return {
    version: 1, sourceAspectRatio: 16 / 9, outputAspectRatio: 9 / 16, mode: "stacked", splitRatio: split, background: { type: "blur", intensity: 14 },
    zones: [
      { id: "zone-1", x: 0.68, y: 0.04, width: 0.26, height: 0.62, zoom: 1, role: "camera" },
      { id: "zone-2", x: 0.18, y: 0.08, width: 0.48, height: 0.84, zoom: 1, role: "gameplay" },
    ]
  };
}

export function zoneToFilter(z: CropZone, sw: number, sh: number) {
  const cw = Math.max(1, Math.round(z.width * sw));
  const ch = Math.max(1, Math.round(z.height * sh));
  const cx = Math.max(0, Math.min(sw - cw, Math.round(z.x * sw)));
  const cy = Math.max(0, Math.min(sh - ch, Math.round(z.y * sh)));
  return { cw, ch, cx, cy };
}

export function buildMobileFilter(layout: MobileLayout, sw: number, sh: number, split: number) {
  if (layout.mode === "full") {
    const f = zoneToFilter(layout.zones[0], sw, sh);
    return `crop=${f.cw}:${f.ch}:${f.cx}:${f.cy},scale=${OUTPUT_W}:${OUTPUT_H}:flags=lanczos`;
  }
  const a = zoneToFilter(layout.zones[0], sw, sh);
  const b = zoneToFilter(layout.zones[1], sw, sh);
  const h1 = Math.round(OUTPUT_H * split);
  const h2 = OUTPUT_H - h1;
  return `[0:v]crop=${a.cw}:${a.ch}:${a.cx}:${a.cy},scale=${OUTPUT_W}:${h1}:flags=lanczos[z1];[0:v]crop=${b.cw}:${b.ch}:${b.cx}:${b.cy},scale=${OUTPUT_W}:${h2}:flags=lanczos[z2];[z1][z2]vstack=inputs=2`;
}

export const STORAGE_KEY = "ffmpeg-mobile-layout-v1";
export const STORAGE_KEY_STACKED = "ffmpeg-mobile-layout-v1:stacked";
export const STORAGE_KEY_FULL = "ffmpeg-mobile-layout-v1:full";
export function savePref(l: MobileLayout) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(l));
    const key = l.mode === "full" ? STORAGE_KEY_FULL : STORAGE_KEY_STACKED;
    localStorage.setItem(key, JSON.stringify(l));
  } catch {}
}
export function loadPref(): MobileLayout | null { try { const v = localStorage.getItem(STORAGE_KEY); return v ? JSON.parse(v) as MobileLayout : null; } catch { return null; } }
export function loadPrefForMode(mode: MobileLayoutMode): MobileLayout | null {
  try {
    const key = mode === "full" ? STORAGE_KEY_FULL : STORAGE_KEY_STACKED;
    const v = localStorage.getItem(key);
    if (v) return JSON.parse(v) as MobileLayout;
    const generic = loadPref();
    if (generic && generic.mode === mode) return generic;
    return null;
  } catch { return null; }
}
