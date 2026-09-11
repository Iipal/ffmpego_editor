import { describe, expect, test } from "bun:test";
import { validateSettings } from "@/lib/validate-settings";

const BASE = {
  sourceWidth: 1920,
  sourceHeight: 1080,
  trimRange: [0, 10],
  exportFps: 30,
  exportSpeed: 1,
  exportQuality: 18,
  exportFilename: "out.mp4",
  exportFormat: "mp4",
};

const LAYOUT = {
  mode: "stacked",
  splitRatio: 0.5,
  zones: [
    { id: "zone-1", x: 0, y: 0, width: 1, height: 0.5 },
    { id: "zone-2", x: 0, y: 0.5, width: 1, height: 0.5 },
  ],
};

describe("validateSettings", () => {
  test("assertGeneric accepts crop settings, rejects garbage", () => {
    const ok = validateSettings.assertGeneric(
      JSON.stringify({
        ...BASE,
        crop: { x: 0, y: 0, width: 100, height: 100 },
      }),
    );
    expect(ok.exportFilename).toBe("out.mp4");
    expect(() => validateSettings.assertGeneric("nope")).toThrow();
    expect(() =>
      validateSettings.assertGeneric(JSON.stringify({ ...BASE })),
    ).toThrow(/crop|mobileLayout/);
  });

  test("assertMobile accepts a mobile layout, rejects a bad split", () => {
    const ok = validateSettings.assertMobile(
      JSON.stringify({ ...BASE, mobileLayout: LAYOUT }),
    );
    expect(ok.mobileLayout.mode).toBe("stacked");
    expect(() =>
      validateSettings.assertMobile(
        JSON.stringify({
          ...BASE,
          mobileLayout: { ...LAYOUT, splitRatio: 0.01 },
        }),
      ),
    ).toThrow();
  });

  test("assertCut accepts cuts, rejects an empty list", () => {
    const ok = validateSettings.assertCut(
      JSON.stringify({
        mode: "full-size",
        cuts: [{ start: 0, end: 5 }],
        sourceWidth: 1920,
        sourceHeight: 1080,
      }),
    );
    expect(ok.cuts).toHaveLength(1);
    expect(() =>
      validateSettings.assertCut(
        JSON.stringify({
          mode: "full-size",
          cuts: [],
          sourceWidth: 1920,
          sourceHeight: 1080,
        }),
      ),
    ).toThrow();
  });
});
