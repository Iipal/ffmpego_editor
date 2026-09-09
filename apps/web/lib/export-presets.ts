// Named export presets: builtins from @repo/contracts + user customs in
// localStorage. Applying a preset is one-shot — it fills the export fields,
// later per-export edits win (presets never clobber explicit overrides).
import {
  BUILTIN_PRESETS,
  migratePreset,
  type ExportPreset,
} from "@repo/contracts";
import type { CutSlice } from "@/store/cutSlice";
import type { VisualFilters } from "@/store/filterSlice";

export type { ExportPreset };
export { BUILTIN_PRESETS };

const STORAGE_KEY = "ffmpeg_editor_presets_v1";

function readStored(): unknown[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeStored(presets: ExportPreset[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
  } catch {}
}

/** Load customs, migrating v0 bodies; drops + persists-cleaned on failure. */
export function loadCustomPresets(): ExportPreset[] {
  const raw = readStored();
  const kept: ExportPreset[] = [];
  let dirty = false;
  for (const item of raw) {
    const r = migratePreset(item);
    if (r.ok) kept.push(r.preset);
    else dirty = true;
  }
  if (dirty) writeStored(kept);
  return kept;
}

export function allPresets(): ExportPreset[] {
  return [...BUILTIN_PRESETS, ...loadCustomPresets()];
}

export function saveCustomPreset(preset: ExportPreset): void {
  const customs = loadCustomPresets().filter((p) => p.id !== preset.id);
  customs.push(preset);
  writeStored(customs);
}

export function deleteCustomPreset(id: string): void {
  writeStored(loadCustomPresets().filter((p) => p.id !== id));
}

export function isBuiltinPreset(id: string): boolean {
  return id.startsWith("builtin:");
}

export function newCustomId(): string {
  return `custom:${Math.random().toString(36).slice(2, 10)}`;
}

type PresetPatch = Partial<
  Pick<
    CutSlice,
    | "exportFormat"
    | "exportFps"
    | "exportQuality"
    | "exportSpeed"
    | "exportFilename"
    | "watermark"
    | "customFFmpegArgs"
    | "ignoreTrim"
    | "presetTarget"
    | "audioFormat"
  >
> & { visualFilters?: VisualFilters };

/**
 * One-shot preset → export-field patch. Filename is filled only when the
 * current field is empty (explicit user filenames are never replaced);
 * the preset suffix is appended to the source basename in that case.
 */
export function presetToPatch(
  preset: ExportPreset,
  currentFilename: string,
  sourceBaseName: string,
): PresetPatch {
  const s = preset.settings;
  const patch: PresetPatch = {
    presetTarget: preset.target,
    ...(preset.audioFormat ? { audioFormat: preset.audioFormat } : {}),
  };
  if (s.exportFormat !== undefined) {
    patch.exportFormat = s.exportFormat;
    // Leaving video for audio-only (or back) resets pacing to 1x.
    if (preset.target === "audio-extract") patch.exportSpeed = 1;
  }
  if (s.exportFps !== undefined) patch.exportFps = s.exportFps;
  if (s.exportQuality !== undefined) patch.exportQuality = s.exportQuality;
  if (s.exportSpeed !== undefined) patch.exportSpeed = s.exportSpeed;
  if (s.watermark !== undefined) patch.watermark = s.watermark;
  if (s.visualFilters !== undefined)
    patch.visualFilters = s.visualFilters as VisualFilters;
  if (s.customFFmpegArgs !== undefined)
    patch.customFFmpegArgs = s.customFFmpegArgs;
  if (s.ignoreTrim !== undefined) patch.ignoreTrim = s.ignoreTrim;
  if (!currentFilename.trim() && s.filenameSuffix) {
    const base = sourceBaseName.trim() || "output";
    patch.exportFilename = `${base}${s.filenameSuffix}`;
  }
  return patch;
}
