/**
 * Versioned named export presets.
 *
 * A preset is a partial bundle of export settings with a display identity.
 * Applying a preset is one-shot: it fills the editor's export fields, and
 * any subsequent per-export edits win (presets never clobber explicit
 * overrides — they only provide starting values).
 *
 * `version` enables forward migration: v0 payloads (bare settings objects
 * without a version envelope) are wrapped via {@link migratePreset}.
 */
import { z } from "zod";

export const PRESET_VERSION = 1 as const;

/** Where a preset can run. `transcode` = video job, `audio-extract` = direct audio pull. */
export const presetTargetSchema = z.enum(["transcode", "audio-extract"]);
export type PresetTarget = z.infer<typeof presetTargetSchema>;

/** Subset of generic export fields a preset may pin. All optional. */
export const presetSettingsSchema = z.object({
  exportFormat: z.enum(["mp4", "webm", "mov", "webm-tg", "gif"]).optional(),
  exportFps: z.number().finite().positive().max(120).optional(),
  exportQuality: z.number().finite().min(0).max(60).optional(),
  exportSpeed: z.number().finite().positive().max(16).optional(),
  /** Appended to the source basename when the preset fills the filename. */
  filenameSuffix: z.string().max(32).optional(),
  watermark: z.boolean().optional(),
  customFFmpegArgs: z.string().max(2000).optional(),
  ignoreTrim: z.boolean().optional(),
});
export type PresetSettings = z.infer<typeof presetSettingsSchema>;

export const exportPresetSchema = z.object({
  version: z.literal(PRESET_VERSION),
  /** Stable machine key (`builtin:youtube`, or `custom:<uuid>`). */
  id: z.string().min(1).max(64),
  name: z.string().min(1).max(64),
  description: z.string().max(280).optional(),
  target: presetTargetSchema,
  settings: presetSettingsSchema,
  /** Only meaningful when target is `audio-extract`. */
  audioFormat: z.enum(["mp3", "wav"]).optional(),
});
export type ExportPreset = z.infer<typeof exportPresetSchema>;

export type MigratePresetResult =
  | { ok: true; preset: ExportPreset; reason: string }
  | { ok: false; reason: string };

/**
 * Normalize unknown stored data into a current preset.
 * - v1 object → validated as-is.
 * - v0 (no `version`, bare `{ name?, settings }`) → wrapped with a minted id.
 * - anything else → rejected with a reason (caller drops it).
 */
export function migratePreset(raw: unknown): MigratePresetResult {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, reason: "preset must be an object" };
  }
  const r = raw as Record<string, unknown>;
  if (r.version === undefined) {
    const wrapped = {
      version: PRESET_VERSION,
      id:
        typeof r.id === "string" && r.id
          ? r.id
          : `custom:${Math.random().toString(36).slice(2, 10)}`,
      name: typeof r.name === "string" && r.name ? r.name : "Imported preset",
      description: typeof r.description === "string" ? r.description : undefined,
      target: r.target ?? "transcode",
      settings: r.settings ?? {},
      audioFormat: r.audioFormat,
    };
    const parsed = exportPresetSchema.safeParse(wrapped);
    if (!parsed.success) return { ok: false, reason: "invalid v0 preset body" };
    return { ok: true, preset: parsed.data, reason: "migrated-v0" };
  }
  if (r.version !== PRESET_VERSION) {
    return { ok: false, reason: `unsupported preset version ${String(r.version)}` };
  }
  const parsed = exportPresetSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: "invalid preset body" };
  return { ok: true, preset: parsed.data, reason: "v1" };
}

function builtin(
  id: string,
  name: string,
  description: string,
  target: PresetTarget,
  settings: PresetSettings,
  audioFormat?: "mp3" | "wav",
): ExportPreset {
  return {
    version: PRESET_VERSION,
    id: `builtin:${id}`,
    name,
    description,
    target,
    settings,
    ...(audioFormat ? { audioFormat } : {}),
  };
}

/** Shipped defaults. Ids are stable — user edits never mutate these. */
export const BUILTIN_PRESETS: readonly ExportPreset[] = [
  builtin("source-archive", "Source-quality archive", "Near-lossless MP4, full resolution, original pacing.", "transcode", {
    exportFormat: "mp4",
    exportQuality: 16,
    exportSpeed: 1,
    filenameSuffix: "_archive",
  }),
  builtin("tg-animated-sticker", "Telegram Sticker", "Specific Telegram sticker preset: 30fps, width 512px, VP9, no audio, up to 3s. Trim, crop, filename and quality apply.", "transcode", {
    exportFormat: "webm-tg",
    exportQuality: 25,
    exportSpeed: 1,
    filenameSuffix: "_tg"
  }),
  builtin("youtube", "YouTube", "H.264 MP4, 30fps, balanced quality for uploads.", "transcode", {
    exportFormat: "mp4",
    exportFps: 30,
    exportQuality: 20,
    exportSpeed: 1,
    filenameSuffix: "_youtube",
  }),
  builtin("shorts-reels", "Shorts / Reels", "Vertical-friendly MP4 at 60fps. Crop to 9:16 first.", "transcode", {
    exportFormat: "mp4",
    exportFps: 60,
    exportQuality: 20,
    exportSpeed: 1,
    filenameSuffix: "_shorts",
  }),
  builtin("gif-preview", "GIF preview", "Small silent GIF for quick sharing. Audio is dropped.", "transcode", {
    exportFormat: "gif",
    exportFps: 15,
    exportSpeed: 1,
    filenameSuffix: "_preview",
  }),
  builtin("audio-only", "Audio only", "Extract the audio track as MP3, no video.", "audio-extract", {}, "mp3"),
];
