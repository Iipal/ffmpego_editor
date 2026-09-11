// Mobile-layout math + persistence service for the portrait (9:16) editor.
//
// Editors never import bare zone-math helpers — they go through the
// `mobileLayoutService` singleton below (`mobileLayoutService.normalizeLayout`,
// `clamp`, `buildMobileFilter`, ...), which owns aspect enforcement,
// default-layout construction, the ffmpeg filter builder, and the
// localStorage prefs. `useSharedMobileLayout`, `useMobileEditor`, the bulk/cut
// layout hooks, and the canvas/preview components are all thin callers over
// this service.
import type {
  CropRole,
  CropZone,
  CropZoneId,
  MobileLayout,
  MobileLayoutMode,
} from "@repo/types";
import { zoneToPixels } from "@repo/ffmpeg-filters";
import { storageJSON } from "./storage-json";

export type {
  CropRole,
  CropZone,
  CropZoneId,
  MobileLayout,
  MobileLayoutMode,
} from "@repo/types";

/**
 * Drag-direction signs per resize handle, relative to the fixed anchor on
 * the opposite corner, plus the per-corner max scale. `se` keeps max 2,
 * the other corners 4 — preserved from the original four branches.
 */
const RESIZE_CORNERS: Record<
  string,
  { fx: 1 | -1; fy: 1 | -1; maxScale: number }
> = {
  se: { fx: 1, fy: 1, maxScale: 2 },
  nw: { fx: -1, fy: -1, maxScale: 4 },
  ne: { fx: 1, fy: -1, maxScale: 4 },
  sw: { fx: -1, fy: 1, maxScale: 4 },
};

/**
 * Singleton service owning every mobile-layout concern: split/zone geometry,
 * aspect enforcement, default-layout construction, the portrait ffmpeg
 * filter builder, and per-mode localStorage prefs. Pure and stateless — all
 * inputs flow through method arguments, so canvas previews and the exporter
 * can never drift apart.
 */
export class MobileLayoutService {
  /** Lower clamp for the zone split ratio (stacked mode). */
  public static readonly MIN_SPLIT = 0.2;
  /** Upper clamp for the zone split ratio (stacked mode). */
  public static readonly MAX_SPLIT = 0.8;
  /** Portrait output width (1080x1920). */
  public static readonly OUTPUT_W = 1080;
  /** Portrait output height (1080x1920). */
  public static readonly OUTPUT_H = 1920;

  /** Smallest allowed zone edge (normalized units). */
  private static readonly MIN_ZONE = 0.05;
  // js-set-map-lookups: O(1) mode validation instead of Array.includes per call
  private static readonly VALID_MODES = new Set<MobileLayoutMode>([
    "full",
    "stacked",
  ]);

  // ------------------------------------------------------------------ public

  /**
   * Target display aspect (w/h) for one zone: 9/16 for full mode, otherwise
   * the zone's share of the 1080x1920 canvas for the given split.
   */
  zoneAspect(mode: MobileLayoutMode, split: number, id: CropZoneId): number {
    if (mode === "full") return 9 / 16;
    const h =
      id === "zone-1"
        ? MobileLayoutService.OUTPUT_H * split
        : MobileLayoutService.OUTPUT_H * (1 - split);
    return MobileLayoutService.OUTPUT_W / h;
  }

  /** Numeric clamp shared by drag handlers, sliders, and canvas math. */
  clamp(v: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, v));
  }

  /**
   * Refit a zone to its target aspect (relative to `sourceAR`) around its
   * center, then re-clamp into the unit square. Returns the zone untouched
   * when it already matches within tolerance.
   */
  enforceZoneAspect(
    z: CropZone,
    mode: MobileLayoutMode,
    split: number,
    sourceAR = 16 / 9,
  ): CropZone {
    const A = this.zoneAspect(mode, split, z.id);
    const R = A / sourceAR;
    let w = z.width;
    let h = z.height;
    const currentR = w / h;
    if (Math.abs(currentR - R) > 0.001) {
      const cx = z.x + w / 2;
      const cy = z.y + h / 2;
      const area = w * h;
      const scale = Math.sqrt(area / R);
      h = scale;
      w = h * R;
      w = this.clamp(w, MobileLayoutService.MIN_ZONE, 0.98);
      h = this.clamp(w / R, MobileLayoutService.MIN_ZONE, 0.98);
      w = h * R;
      const x = this.clamp(cx - w / 2, 0, 1 - w);
      const y = this.clamp(cy - h / 2, 0, 1 - h);
      if (x + w > 1) w = 1 - x;
      if (y + h > 1) h = 1 - y;
      if (Math.abs(w / h - R) > 0.001) {
        h = w / R;
        if (y + h > 1) {
          h = 1 - y;
          w = h * R;
        }
      }
      return { ...z, x, y, width: w, height: h };
    }
    return z;
  }

  /**
   * Sanitize a layout in one pass: clamp the split, clamp each zone,
   * enforce each zone's aspect, and pin zones back into bounds. Also stamps
   * the canonical 9/16 output aspect and the assumed source aspect.
   */
  normalizeLayout(l: MobileLayout): MobileLayout {
    const split = this.clamp(
      l.splitRatio ?? 0.5,
      MobileLayoutService.MIN_SPLIT,
      MobileLayoutService.MAX_SPLIT,
    );
    const sourceAR = 16 / 9;
    // js-combine-iterations: single pass does clamp + aspect-enforce + bounds-clamp
    const zones = l.zones.map((raw) => {
      const clamped = this.clampZone(raw);
      const enforced = this.enforceZoneAspect(clamped, l.mode, split, sourceAR);
      const x = this.clamp(enforced.x, 0, 1 - enforced.width);
      const y = this.clamp(enforced.y, 0, 1 - enforced.height);
      return x === enforced.x && y === enforced.y
        ? enforced
        : { ...enforced, x, y };
    });
    return {
      ...l,
      splitRatio: split,
      zones,
      outputAspectRatio: 9 / 16,
      sourceAspectRatio: sourceAR,
    };
  }

  /**
   * Aspect-locked corner resize for the drag overlay: scales the zone from
   * the opposite anchor (`se`/`nw`/`ne`/`sw`), keeps the target ratio, and
   * clamps into the unit square. Unknown handles return `start` untouched.
   *
   * Corner table: `fx`/`fy` are the drag direction signs relative to the
   * anchor (the anchor itself sits on the opposite corner). `se` keeps its
   * original quirks verbatim: max scale 2 (others 4), ratio re-pin, and the
   * anchor returned unclamped.
   */
  resizeZoneAspectLocked(
    start: CropZone,
    handle: string,
    dx: number,
    dy: number,
    mode: MobileLayoutMode,
    split: number,
    sourceAR = 16 / 9,
  ): CropZone {
    const corner = RESIZE_CORNERS[handle];
    if (!corner) return start;
    const { fx, fy, maxScale } = corner;
    const A = this.zoneAspect(mode, split, start.id);
    const R = A / sourceAR;
    const sx = start.x,
      sy = start.y,
      sw = start.width,
      sh = start.height;
    const anchorX = fx > 0 ? sx : sx + sw;
    const anchorY = fy > 0 ? sy : sy + sh;
    const scale = this.clamp(
      ((sw + fx * dx) / sw + (sh + fy * dy) / sh) / 2,
      MobileLayoutService.MIN_ZONE / sw,
      maxScale,
    );
    let w = sw * scale;
    let h = w / R;
    w = this.clamp(
      w,
      MobileLayoutService.MIN_ZONE,
      fx > 0 ? 1 - anchorX : anchorX,
    );
    h = this.clamp(
      h,
      MobileLayoutService.MIN_ZONE,
      fy > 0 ? 1 - anchorY : anchorY,
    );
    let x = fx > 0 ? anchorX : anchorX - w;
    let y = fy > 0 ? anchorY : anchorY - h;
    if (fx > 0 ? x + w > 1 : x < 0) {
      if (fx > 0) {
        w = 1 - x;
        h = w / R;
      } else {
        x = 0;
        w = anchorX;
        h = w / R;
      }
      if (fy < 0) y = anchorY - h;
    }
    if (fy > 0 ? y + h > 1 : y < 0) {
      if (fy > 0) {
        h = 1 - y;
        w = h * R;
      } else {
        y = 0;
        h = anchorY;
        w = h * R;
      }
      if (fx < 0) x = anchorX - w;
    }
    if (fx > 0 && fy > 0) {
      if (w / h - R > 0.001) h = w / R;
      return { ...start, x: anchorX, y: anchorY, width: w, height: h };
    }
    x = this.clamp(x, 0, 1 - w);
    y = this.clamp(y, 0, 1 - h);
    return { ...start, x, y, width: w, height: h };
  }

  /**
   * Structural validator: mode known, zone count matches the mode (1 for
   * full, 2 for stacked), split in range, zones in bounds and not too
   * small. Returns an error string or null when valid.
   */
  validateLayout(l: MobileLayout): string | null {
    if (!MobileLayoutService.VALID_MODES.has(l.mode)) return "Invalid mode";
    if (l.mode === "full" && l.zones.length !== 1) return "Full needs 1 zone";
    if (l.mode === "stacked" && l.zones.length !== 2)
      return "Stacked needs 2 zones";
    if (
      l.splitRatio < MobileLayoutService.MIN_SPLIT ||
      l.splitRatio > MobileLayoutService.MAX_SPLIT
    )
      return "Split out of range";
    for (const z of l.zones) {
      if (z.x < 0 || z.y < 0 || z.x + z.width > 1.001 || z.y + z.height > 1.001)
        return `Zone ${z.id} out of bounds`;
      if (
        z.width < MobileLayoutService.MIN_ZONE ||
        z.height < MobileLayoutService.MIN_ZONE
      )
        return `Zone ${z.id} too small`;
    }
    return null;
  }

  /**
   * Fresh centered layout for a mode (full = 1 content zone, stacked =
   * camera + gameplay), run through `normalizeLayout` so every default is
   * already aspect-correct and in bounds.
   */
  createDefaultLayout(
    mode: MobileLayoutMode,
    split = 0.5,
    sourceAR = 16 / 9,
  ): MobileLayout {
    if (mode === "full") {
      // Centered 9:16 content zone (precomputed constants — the zone math
      // below went through several confused iterations; see git history).
      const cw = 0.31640625;
      const ch = 1;
      return this.normalizeLayout({
        version: 1,
        sourceAspectRatio: sourceAR,
        outputAspectRatio: 9 / 16,
        mode,
        zones: [
          {
            id: "zone-1",
            x: (1 - cw) / 2,
            y: 0,
            width: cw,
            height: ch,
            zoom: 1,
            role: "content",
          },
        ],
        splitRatio: 0.5,
        background: { type: "blur", intensity: 12 },
      });
    }
    const a1 = this.zoneAspect("stacked", split, "zone-1");
    const a2 = this.zoneAspect("stacked", split, "zone-2");
    const z1w = 0.32;
    const z1h = (z1w / a1) * sourceAR;
    const z2w = 0.42;
    const z2h = (z2w / a2) * sourceAR;
    return this.normalizeLayout({
      version: 1,
      sourceAspectRatio: sourceAR,
      outputAspectRatio: 9 / 16,
      mode: "stacked",
      splitRatio: split,
      background: { type: "blur", intensity: 12 },
      zones: [
        {
          id: "zone-1",
          x: 0.06,
          y: this.clamp((1 - z1h) / 2, 0, 1 - z1h),
          width: z1w,
          height: z1h,
          zoom: 1,
          role: "camera",
        },
        {
          id: "zone-2",
          x: 0.5 - z2w / 2,
          y: this.clamp((1 - z2h) / 2, 0, 1 - z2h),
          width: z2w,
          height: z2h,
          zoom: 1,
          role: "gameplay",
        },
      ],
    });
  }

  /**
   * Portrait ffmpeg filtergraph for the render plan: single crop+scale for
   * full mode, dual crop+scale+vstack for stacked (split drives the two
   * output heights). Must match what the canvas preview draws.
   */
  buildMobileFilter(
    layout: MobileLayout,
    sw: number,
    sh: number,
    split: number,
  ): string {
    if (layout.mode === "full") {
      const f = this.zoneToFilter(layout.zones[0], sw, sh);
      return `crop=${f.cw}:${f.ch}:${f.cx}:${f.cy},scale=${MobileLayoutService.OUTPUT_W}:${MobileLayoutService.OUTPUT_H}:flags=lanczos`;
    }
    const a = this.zoneToFilter(layout.zones[0], sw, sh);
    const b = this.zoneToFilter(layout.zones[1], sw, sh);
    const h1 = Math.round(MobileLayoutService.OUTPUT_H * split);
    const h2 = MobileLayoutService.OUTPUT_H - h1;
    return `[0:v]crop=${a.cw}:${a.ch}:${a.cx}:${a.cy},scale=${MobileLayoutService.OUTPUT_W}:${h1}:flags=lanczos[z1];[0:v]crop=${b.cw}:${b.ch}:${b.cx}:${b.cy},scale=${MobileLayoutService.OUTPUT_W}:${h2}:flags=lanczos[z2];[z1][z2]vstack=inputs=2`;
  }

  /**
   * Persist a layout to localStorage: both the generic most-recent key and
   * the per-mode key, so mode switches restore their own last layout.
   * Best-effort — quota/private-mode failures are swallowed.
   */
  savePref(l: MobileLayout): void {
    storageJSON.write("ffmpego:mobile_layout", l);
    storageJSON.write(
      l.mode === "full"
        ? "ffmpego:mobile_layout:full"
        : "ffmpego:mobile_layout:stacked",
      l,
    );
  }

  /** Most-recent layout regardless of mode, or null when none stored. */
  loadPref(): MobileLayout | null {
    return storageJSON.read<MobileLayout>("ffmpego:mobile_layout");
  }

  /**
   * Most-recent layout for a specific mode: per-mode key first, falling
   * back to the generic pref when it already matches the mode.
   */
  loadPrefForMode(mode: MobileLayoutMode): MobileLayout | null {
    const v = storageJSON.read<MobileLayout>(
      mode === "full"
        ? "ffmpego:mobile_layout:full"
        : "ffmpego:mobile_layout:stacked",
    );
    if (v) return v;
    const generic = this.loadPref();
    if (generic && generic.mode === mode) return generic;
    return null;
  }

  // ----------------------------------------------------------------- private

  /**
   * Clamp one zone's size/position/zoom into sane ranges (minimum edge,
   * inside the unit square, zoom 0.5–3). Raw drag math helper — callers
   * want `normalizeLayout` instead.
   */
  private clampZone(z: CropZone): CropZone {
    const w = this.clamp(z.width, MobileLayoutService.MIN_ZONE, 1);
    const h = this.clamp(z.height, MobileLayoutService.MIN_ZONE, 1);
    const x = this.clamp(z.x, 0, 1 - w);
    const y = this.clamp(z.y, 0, 1 - h);
    const zoom = this.clamp(z.zoom ?? 1, 0.5, 3);
    return { ...z, x, y, width: w, height: h, zoom };
  }

  /**
   * Vertically-centered zone constructor used by the default-layout
   * builder. Kept private — no external caller builds zones directly.
   */
  private defaultZone(
    id: CropZoneId,
    x: number,
    w: number,
    h: number,
    role?: CropRole,
  ): CropZone {
    return { id, x, y: (1 - h) / 2, width: w, height: h, zoom: 1, role };
  }

  /**
   * Normalized zone → pixel crop box for a source of `sw`×`sh`
   * (shared `@repo/ffmpeg-filters` math, so preview and exporter agree).
   */
  private zoneToFilter(z: CropZone, sw: number, sh: number) {
    return zoneToPixels(z, sw, sh);
  }
}

/** App-wide singleton — editors build layouts through this service. */
export const mobileLayoutService = new MobileLayoutService();
