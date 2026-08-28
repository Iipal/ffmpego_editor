import type { SubtitleTemplate } from "./subtitleTypes";

export const SUBTITLE_TEMPLATES_STORAGE_KEY = "video-editor:subtitle-templates";

export interface SubtitleTemplateStorage {
  load(): SubtitleTemplate[];
  save(templates: SubtitleTemplate[]): void;
}

function migrateStyle(raw: Record<string, unknown>): Record<string, unknown> {
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

function isValidTemplate(obj: unknown): obj is SubtitleTemplate {
  if (typeof obj !== "object" || obj === null) return false;
  const o = obj as Record<string, unknown>;
  if (typeof o.id !== "string" || typeof o.name !== "string") return false;
  if (typeof o.style !== "object" || o.style === null) return false;
  const s = migrateStyle(o.style as Record<string, unknown>);
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

export const subtitleTemplateStorage: SubtitleTemplateStorage = {
  load(): SubtitleTemplate[] {
    try {
      const raw = localStorage.getItem(SUBTITLE_TEMPLATES_STORAGE_KEY);
      if (!raw) return [];
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      const valid = parsed.filter(isValidTemplate);
      return valid;
    } catch {
      return [];
    }
  },
  save(templates: SubtitleTemplate[]): void {
    try {
      localStorage.setItem(
        SUBTITLE_TEMPLATES_STORAGE_KEY,
        JSON.stringify(templates),
      );
    } catch {}
  },
};

export function loadSubtitleTemplates(): SubtitleTemplate[] {
  return subtitleTemplateStorage.load();
}

export function saveSubtitleTemplates(templates: SubtitleTemplate[]): void {
  subtitleTemplateStorage.save(templates);
}
