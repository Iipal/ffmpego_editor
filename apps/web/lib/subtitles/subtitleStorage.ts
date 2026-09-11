// Single owner for everything subtitle-data: the shared subtitle types
// (re-exported from `@repo/types`), the editor defaults (default style, font
// list, minimum duration), and the versioned localStorage persistence for
// style templates (with v0 → v1 migration + legacy toggle backfill).
//
// Editors go through the `subtitleStorage` singleton below
// (`subtitleStorage.load/save`, `SubtitleStorage.DEFAULT_STYLE/...`) instead
// of touching localStorage or the defaults directly.
export type { Subtitle, SubtitleStyle, SubtitleTemplate } from "@repo/types";
import type { SubtitleStyle, SubtitleTemplate } from "@repo/types";
import { storageJSON } from "@/lib/storage-json";

/**
 * Singleton service owning subtitle data: defaults, the localStorage-backed
 * style-template registry, and the schema validation/migration that keeps
 * stored templates loadable across editor versions. All mutable persistence
 * lives here (never scattered across panels), so the template cache and the
 * settings panel stay consistent.
 */
export class SubtitleStorage {
  /** Fallback style for newly added subtitles. */
  public static readonly DEFAULT_STYLE: SubtitleStyle = {
    fontFamily: "Inter, sans-serif",
    fontSize: 48,
    color: "#FFFFFF",
    outlineEnabled: true,
    outlineThickness: 2,
    outlineColor: "#000000",
    shadowEnabled: true,
    shadowSize: 4,
    shadowOffsetX: 2,
    shadowOffsetY: 2,
    shadowColor: "#000000",
    backgroundEnabled: false,
    backgroundColor: "rgba(0,0,0,0.6)",
    backgroundPadding: 8,
    backgroundBorderRadius: 6,
  };

  /** Minimum subtitle duration in seconds (clamp floor for trims/drags). */
  public static readonly MIN_DURATION = 0.05;

  /** Bundled font choices offered before Google Fonts metadata loads. */
  public static readonly FONT_FAMILY_OPTIONS: string[] = [
    "Inter, sans-serif",
    "Arial, sans-serif",
    "Helvetica, sans-serif",
    "Times New Roman, serif",
    "Georgia, serif",
    "Courier New, monospace",
    "Verdana, sans-serif",
  ];

  // ------------------------------------------------------------------ public

  /**
   * Load stored style templates (migrating v0 → v1 once). Invalid entries
   * are dropped; storage failures yield an empty list — never throw.
   */
  public load(): SubtitleTemplate[] {
    const parsed = storageJSON.read<unknown>("ffmpego:subtitle_templates");

    if (!Array.isArray(parsed)) return [];

    return parsed.filter(SubtitleStorage.isValidTemplate);
  }

  /**
   * Persist style templates. Storage failures (quota, private mode) are
   * swallowed — templates simply don't survive reloads.
   */
  public save(templates: SubtitleTemplate[]): void {
    storageJSON.write("ffmpego:subtitle_templates", templates);
  }

  // ----------------------------------------------------------------- private

  /**
   * Backfill legacy toggles missing from pre-toggle styles: an outline is
   * enabled when its thickness is positive (default true), same for shadows;
   * the background is enabled unless its color is transparent/empty.
   */
  private static migrateStyle(
    raw: Record<string, unknown>,
  ): Record<string, unknown> {
    const s: Record<string, unknown> = { ...raw };
    if (typeof s.outlineEnabled !== "boolean") {
      s.outlineEnabled =
        typeof s.outlineThickness === "number"
          ? (s.outlineThickness as number) > 0
          : true;
    }
    if (typeof s.shadowEnabled !== "boolean") {
      s.shadowEnabled =
        typeof s.shadowSize === "number" ? (s.shadowSize as number) > 0 : true;
    }
    if (typeof s.backgroundEnabled !== "boolean") {
      const bg = s.backgroundColor as unknown;
      s.backgroundEnabled =
        typeof bg === "string" &&
        bg !== "rgba(0,0,0,0.0)" &&
        bg !== "transparent" &&
        bg !== "";
    }
    return s;
  }

  /**
   * Validate a stored template (migrating its style in place for the
   * consumer). Rejects anything missing the required style fields so a
   * corrupt entry can never crash the template UI.
   */
  private static isValidTemplate(obj: unknown): obj is SubtitleTemplate {
    if (typeof obj !== "object" || obj === null) return false;
    const o = obj as Record<string, unknown>;
    if (typeof o.id !== "string" || typeof o.name !== "string") return false;
    if (typeof o.style !== "object" || o.style === null) return false;
    const s = SubtitleStorage.migrateStyle(o.style as Record<string, unknown>);
    const required = [
      "fontFamily",
      "fontSize",
      "color",
      "outlineThickness",
      "outlineColor",
      "shadowSize",
      "shadowOffsetX",
      "shadowOffsetY",
      "shadowColor",
      "backgroundColor",
      "backgroundPadding",
      "backgroundBorderRadius",
    ] as const;
    for (const k of required) {
      if (!(k in s)) return false;
    }
    // basic type checks (including toggles if present, else migrated)
    if (typeof s.fontFamily !== "string") return false;
    if (typeof s.fontSize !== "number") return false;
    if (typeof s.color !== "string") return false;
    if (typeof s.outlineEnabled !== "boolean") return false;
    if (typeof s.outlineThickness !== "number") return false;
    if (typeof s.outlineColor !== "string") return false;
    if (typeof s.shadowEnabled !== "boolean") return false;
    if (typeof s.shadowSize !== "number") return false;
    if (typeof s.shadowOffsetX !== "number") return false;
    if (typeof s.shadowOffsetY !== "number") return false;
    if (typeof s.shadowColor !== "string") return false;
    if (typeof s.backgroundEnabled !== "boolean") return false;
    if (typeof s.backgroundColor !== "string") return false;
    if (typeof s.backgroundPadding !== "number") return false;
    if (typeof s.backgroundBorderRadius !== "number") return false;
    // write back migrated style for consumer
    (o.style as Record<string, unknown>) = s;
    return true;
  }
}

/** App-wide singleton — editors load/save templates through this service. */
export const subtitleStorage = new SubtitleStorage();
