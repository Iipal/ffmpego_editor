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
import { storageJSON } from "./storage-json";

export type { ExportPreset };
export { BUILTIN_PRESETS };

/** One-shot preset → export-field patch (see `ExportPresets.toPatch`). */
export type PresetPatch = Partial<
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
 * Singleton service owning the named export presets: builtin presets from
 * `@repo/contracts` plus user customs persisted in localStorage (migrating
 * v0 bodies on load, dropping + persisting-cleaned on failure). Applying a
 * preset is one-shot via `toPatch` — it fills the export fields, and later
 * per-export edits win.
 */
class ExportPresets {
  // ------------------------------------------------------------------ public

  /** Builtins followed by stored customs. */
  all(): ExportPreset[] {
    return [...BUILTIN_PRESETS, ...this.customs()];
  }

  /**
   * Stored customs, migrating v0 bodies; drops + persists-cleaned on
   * failure so one corrupt entry never breaks the preset list.
   */
  customs(): ExportPreset[] {
    const kept: ExportPreset[] = [];
    let dirty = false;
    for (const item of this.readStored()) {
      const r = migratePreset(item);
      if (r.ok) kept.push(r.preset);
      else dirty = true;
    }
    if (dirty) this.writeStored(kept);
    return kept;
  }

  /** Upsert a custom preset (matched by id) into localStorage. */
  save(preset: ExportPreset): void {
    const customs = this.customs().filter((p) => p.id !== preset.id);
    customs.push(preset);
    this.writeStored(customs);
  }

  /** Remove a custom preset by id (no-op when unknown). */
  remove(id: string): void {
    this.writeStored(this.customs().filter((p) => p.id !== id));
  }

  /** True for builtin preset ids (`builtin:*`), which cannot be deleted. */
  isBuiltin(id: string): boolean {
    return id.startsWith("builtin:");
  }

  /** Fresh unique id for a user-created preset (`custom:*`). */
  newCustomId(): string {
    return `custom:${Math.random().toString(36).slice(2, 10)}`;
  }

  /**
   * One-shot preset → export-field patch. Filename is filled only when the
   * current field is empty (explicit user filenames are never replaced);
   * the preset suffix is appended to the source basename in that case.
   */
  toPatch(
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

  // ----------------------------------------------------------------- private

  /** Raw stored JSON array (empty when missing, corrupt, or non-array). */
  private readStored(): unknown[] {
    const parsed = storageJSON.read<unknown>("ffmpego:presets");
    return Array.isArray(parsed) ? parsed : [];
  }

  /** Persist the custom preset list (quota failures are swallowed). */
  private writeStored(presets: ExportPreset[]): void {
    storageJSON.write("ffmpego:presets", presets);
  }
}

/** App-wide singleton — preset list and application go through this service. */
export const exportPresets = new ExportPresets();
