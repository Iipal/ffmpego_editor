import { describe, expect, test } from "bun:test";
import {
  BUILTIN_PRESETS,
  exportPresetSchema,
  migratePreset,
  PRESET_VERSION,
} from "../src/presets";

describe("export presets", () => {
  test("builtins are valid v1 presets with stable ids", () => {
    expect(BUILTIN_PRESETS.length).toBe(6);
    const ids = new Set<string>();
    for (const p of BUILTIN_PRESETS) {
      expect(exportPresetSchema.safeParse(p).success).toBe(true);
      expect(p.version).toBe(PRESET_VERSION);
      expect(ids.has(p.id)).toBe(false);
      ids.add(p.id);
    }
  });

  test("migratePreset passes v1 through", () => {
    const r = migratePreset(BUILTIN_PRESETS[0]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.reason).toBe("v1");
  });

  test("migratePreset wraps v0 bare settings", () => {
    const r = migratePreset({
      name: "Old one",
      settings: { exportFormat: "mp4", exportQuality: 18 },
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.reason).toBe("migrated-v0");
      expect(r.preset.version).toBe(1);
      expect(r.preset.settings.exportQuality).toBe(18);
    }
  });

  test("migratePreset rejects unknown versions and non-objects", () => {
    expect(migratePreset({ version: 99, id: "x", name: "x" }).ok).toBe(false);
    expect(migratePreset(null).ok).toBe(false);
    expect(migratePreset("mp4").ok).toBe(false);
    expect(
      migratePreset({
        version: 1,
        id: "x",
        name: "x",
        target: "nope",
        settings: {},
      }).ok,
    ).toBe(false);
  });
});
