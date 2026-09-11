import { describe, expect, test } from "bun:test";
import { migratePreset } from "../src/presets";

describe("export presets", () => {
  test("migratePreset passes v1 through", () => {
    const r = migratePreset({
      version: 1,
      id: "builtin:youtube",
      name: "YouTube",
      target: "transcode",
      settings: { exportFormat: "mp4" },
    });
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
