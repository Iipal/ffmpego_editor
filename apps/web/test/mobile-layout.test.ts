import { describe, expect, test } from "bun:test";
import { zoneToPixels } from "@repo/ffmpeg-filters";
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
  test("subscribeSaves notifies on savePref, stops after unsubscribe", () => {
    let calls = 0;
    const unsubscribe = mobileLayoutService.subscribeSaves(() => {
      calls += 1;
    });
    const layout = mobileLayoutService.createDefaultLayout("stacked", 0.5);
    mobileLayoutService.savePref(layout);
    expect(calls).toBe(1);
    unsubscribe();
    mobileLayoutService.savePref(layout);
    expect(calls).toBe(1);
  });
});

describe("zoneSourceRect preview/export parity", () => {
  test("matches the exporter pixel box at zoom 1", () => {
    const layout = mobileLayoutService.createDefaultLayout("stacked", 0.5);
    for (const zone of layout.zones) {
      const box = zoneToPixels(zone, 1920, 1080);
      const r = mobileLayoutService.zoneSourceRect(zone, 1920, 1080);
      expect(r.zsx).toBe(box.cx);
      expect(r.zsy).toBe(box.cy);
      expect(r.zsw).toBe(box.cw);
      expect(r.zsh).toBe(box.ch);
    }
  });

  test("applies zoom as a center-crop of the exporter box", () => {
    const layout = mobileLayoutService.createDefaultLayout("stacked", 0.5);
    const zone = { ...layout.zones[0], zoom: 2 };
    const box = zoneToPixels(zone, 1920, 1080);
    const r = mobileLayoutService.zoneSourceRect(zone, 1920, 1080);
    expect(r.zsw).toBe(box.cw / 2);
    expect(r.zsh).toBe(box.ch / 2);
    expect(r.zsx).toBe(box.cx + box.cw / 4);
    expect(r.zsy).toBe(box.cy + box.ch / 4);
  });
});
