import { describe, expect, test } from "bun:test";
import { mobileLayoutService } from "@/lib/mobile-layout";

describe("mobileLayoutService.clamp", () => {
  test("pins values into range", () => {
    expect(mobileLayoutService.clamp(0.5, 0, 1)).toBe(0.5);
    expect(mobileLayoutService.clamp(-1, 0, 1)).toBe(0);
    expect(mobileLayoutService.clamp(2, 0, 1)).toBe(1);
  });
});

describe("mobileLayoutService layouts", () => {
  test("creates a stacked default with two zones", () => {
    const layout = mobileLayoutService.createDefaultLayout("stacked", 0.5);
    expect(layout.mode).toBe("stacked");
    expect(layout.zones).toHaveLength(2);
  });

  test("normalizeLayout clamps an out-of-range split and zones", () => {
    const layout = mobileLayoutService.createDefaultLayout("stacked", 0.5);
    const bad = {
      ...layout,
      splitRatio: 99,
      zones: layout.zones.map((z) => ({ ...z, x: -5, y: -5 })),
    };
    const out = mobileLayoutService.normalizeLayout(bad);
    expect(out.splitRatio).toBeLessThanOrEqual(0.8);
    for (const z of out.zones) {
      expect(z.x).toBeGreaterThanOrEqual(0);
      expect(z.y).toBeGreaterThanOrEqual(0);
      expect(z.x + z.width).toBeLessThanOrEqual(1);
      expect(z.y + z.height).toBeLessThanOrEqual(1);
    }
  });
});
