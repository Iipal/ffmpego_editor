/**
 * B5 media-engine tests: filter-graph math for the three ffmpeg builders.
 * Pure arg-string assertions — no binaries spawned.
 */
import { describe, expect, test } from "bun:test";
import { buildFFmpegArgs } from "../src/utils/ffmpegBuilder.js";
import {
  buildCutFFmpegArgs,
  totalCutDuration,
} from "../src/utils/cutBuilder.js";
import {
  buildMobileSubtitlesArgs,
  OUTPUT_H,
  OUTPUT_W,
} from "../src/utils/mobileSubtitlesBuilder.js";

const BASE = {
  inputPath: "/tmp/in.mp4",
  filename: "out",
  sourceWidth: 1920,
  sourceHeight: 1080,
  trimRange: [1, 5] as [number, number],
  crop: { x: 0, y: 0, width: 100, height: 100 },
  format: "mp4" as const,
};

function vf(args: string[]): string | undefined {
  const i = args.indexOf("-vf");
  return i >= 0 ? args[i + 1] : undefined;
}

function complex(args: string[]): string | undefined {
  const i = args.indexOf("-filter_complex");
  return i >= 0 ? args[i + 1] : undefined;
}

describe("buildFFmpegArgs crop clamp", () => {
  test("full-frame crop emits no crop filter", () => {
    expect(vf(buildFFmpegArgs(BASE))).toBeUndefined();
  });

  test("50% crop maps to exact pixels", () => {
    const args = buildFFmpegArgs({
      ...BASE,
      crop: { x: 25, y: 25, width: 50, height: 50 },
    });
    expect(vf(args)).toBe("crop=960:540:480:270");
  });

  test("over-wide crop clamps to source and stays inside frame", () => {
    const args = buildFFmpegArgs({
      ...BASE,
      crop: { x: 90, y: 90, width: 50, height: 50 },
    });
    // w=960 h=540 → x clamped to 1920-960=960, y to 1080-540=540
    expect(vf(args)).toBe("crop=960:540:960:540");
  });

  test("crop larger than source clamps to full dimensions", () => {
    const args = buildFFmpegArgs({
      ...BASE,
      crop: { x: 0, y: 0, width: 200, height: 200 },
    });
    expect(vf(args)).toBeUndefined();
  });
});

describe("buildFFmpegArgs formats (B4 webm fix)", () => {
  test("webm keeps audio via libopus, no -an, no forced scale", () => {
    const args = buildFFmpegArgs({ ...BASE, format: "webm" });
    expect(args).toContain("-c:a");
    expect(args).toContain("libopus");
    expect(args).not.toContain("-an");
    expect(vf(args) ?? "").not.toContain("scale=512");
  });

  test("mp4 uses aac, mov uses prores", () => {
    expect(buildFFmpegArgs(BASE)).toContain("aac");
    expect(buildFFmpegArgs({ ...BASE, format: "mov" })).toContain("prores_ks");
  });

  test("fps becomes -r, trim becomes -ss/-to unless ignored", () => {
    const args = buildFFmpegArgs({ ...BASE, fps: 30 });
    expect(args.slice(args.indexOf("-r"), args.indexOf("-r") + 2)).toEqual([
      "-r",
      "30",
    ]);
    expect(args).toContain("-ss");
    const ignored = buildFFmpegArgs({ ...BASE, ignoreTrim: true });
    expect(ignored).not.toContain("-ss");
    expect(ignored).not.toContain("-to");
  });
});

describe("buildFFmpegArgs webm-tg telegram preset", () => {
  test("honors trim + crop, ignores everything else", () => {
    const args = buildFFmpegArgs({
      ...BASE,
      format: "webm-tg",
      trimRange: [10, 50],
      crop: { x: 25, y: 25, width: 50, height: 50 },
      fps: 60,
      speed: 2,
      crf: 10,
      customArgs: ["-b:v", "2M"],
      extraVideoFilters: ["eq=contrast=1.2"],
      audioTracks: [
        {
          trackIndex: 0,
          enabled: true,
          gainDb: 5,
          loudnormEnabled: true,
          loudnormTargetLufs: -14,
          fadeInSeconds: 1,
          fadeOutSeconds: 1,
          muteSegments: [],
        },
      ],
      watermark: true,
    });
    expect(args).toEqual([
      "-y",
      "-ss",
      "10",
      "-i",
      "/tmp/in.mp4",
      "-t",
      "3",
      "-vf",
      "crop=960:540:480:270,fps=30,scale=512:-1",
      "-c:v",
      "libvpx-vp9",
      "-crf",
      "10",
      "-b:v",
      "0",
      "-an",
      "-progress",
      "pipe:2",
      "-nostats",
      "out.webm",
    ]);
  });

  test("short trim caps duration, full-frame crop emits no crop filter", () => {
    const args = buildFFmpegArgs({
      ...BASE,
      format: "webm-tg",
      trimRange: [1, 2.5],
    });
    expect(args).toContain("-ss");
    expect(args).toContain("1");
    const t = args.indexOf("-t");
    expect(args.slice(t, t + 2)).toEqual(["-t", "1.5"]);
    expect(vf(args)).toBe("fps=30,scale=512:-1");
  });

  test("ignoreTrim skips seek and renders flat 3s", () => {
    const args = buildFFmpegArgs({
      ...BASE,
      format: "webm-tg",
      trimRange: [10, 50],
      ignoreTrim: true,
    });
    expect(args).not.toContain("-ss");
    const t = args.indexOf("-t");
    expect(args.slice(t, t + 2)).toEqual(["-t", "3"]);
  });

  test("crf follows exportQuality", () => {
    const args = buildFFmpegArgs({ ...BASE, format: "webm-tg", crf: 20 });
    const i = args.indexOf("-crf");
    expect(args.slice(i, i + 2)).toEqual(["-crf", "20"]);
  });
});

describe("buildFFmpegArgs gif preview", () => {
  test("silent gif codec, capped scale, no audio maps or filters", () => {
    const args = buildFFmpegArgs({
      ...BASE,
      format: "gif",
      fps: 15,
      audioTrackIndex: 0,
      audioTracks: [
        {
          trackIndex: 0,
          enabled: true,
          gainDb: 0,
          loudnormEnabled: false,
          loudnormTargetLufs: -14,
          fadeIn: 0,
          fadeOut: 0,
          muteSegments: [],
        },
      ],
    });
    expect(args).toContain("-c:v");
    expect(args.slice(args.indexOf("-c:v"), args.indexOf("-c:v") + 2)).toEqual([
      "-c:v",
      "gif",
    ]);
    expect(args).toContain("-an");
    expect(vf(args)).toContain("scale=480:-2:flags=lanczos");
    expect(args).not.toContain("-map");
    expect(args).not.toContain("-filter:a");
    expect(args.slice(args.indexOf("-r"), args.indexOf("-r") + 2)).toEqual([
      "-r",
      "15",
    ]);
    expect(args[args.length - 1]).toMatch(/\.gif$/);
  });

  test("gif drops the mobile-layout graph", () => {
    const args = buildFFmpegArgs({
      ...BASE,
      format: "gif",
      mobileLayout: {
        mode: "full",
        splitRatio: 0.5,
        zones: [{ x: 0, y: 0, width: 100, height: 100, zoom: 1 }],
      } as never,
    });
    expect(complex(args)).toBeUndefined();
    expect(vf(args)).toContain("scale=480:-2:flags=lanczos");
  });
});

describe("buildFFmpegArgs speed", () => {
  test("2x emits setpts + single atempo", () => {
    const args = buildFFmpegArgs({ ...BASE, speed: 2 });
    expect(vf(args)).toContain("setpts=0.500000*PTS");
    expect(args).toContain("atempo=2.000000");
  });

  test("0.25x chains atempo=0.5 factors", () => {
    const args = buildFFmpegArgs({ ...BASE, speed: 0.25 });
    const i = args.indexOf("-filter:a");
    expect(args[i + 1]).toBe("atempo=0.5,atempo=0.500000");
  });
});

describe("buildFFmpegArgs custom args", () => {
  test("customArgs pass through, extraVideoFilters merge into -vf", () => {
    const args = buildFFmpegArgs({
      ...BASE,
      crop: { x: 0, y: 0, width: 50, height: 100 },
      customArgs: ["-b:v", "2M"],
      extraVideoFilters: ["eq=contrast=1.2"],
    });
    expect(args).toContain("-b:v");
    expect(vf(args)).toContain("eq=contrast=1.2");
    expect(vf(args)).toContain("crop=");
  });

  test("extraVideoFilters + filter_complex mobile layout throws", () => {
    expect(() =>
      buildFFmpegArgs({
        ...BASE,
        mobileLayout: {
          mode: "stacked",
          splitRatio: 0.5,
          zones: [
            { id: "a", x: 0, y: 0, width: 100, height: 100, zoom: 1 },
            { id: "b", x: 0, y: 0, width: 100, height: 100, zoom: 1 },
          ],
        },
        extraVideoFilters: ["eq=contrast=1.2"],
      }),
    ).toThrow(/filter_complex/);
  });
});

describe("buildFFmpegArgs mobile layout", () => {
  const zones = [
    { id: "a", x: 0, y: 0, width: 100, height: 100, zoom: 1 },
    { id: "b", x: 0, y: 0, width: 100, height: 100, zoom: 1 },
  ];

  test("full mode scales to 1080x1920", () => {
    const args = buildFFmpegArgs({
      ...BASE,
      mobileLayout: { mode: "full", splitRatio: 0.5, zones: [zones[0]] },
    });
    expect(vf(args)).toContain("scale=1080:1920");
  });

  test("stacked split clamps to 0.2..0.8 and halves sum to 1920", () => {
    for (const split of [0.1, 0.5, 0.9]) {
      const args = buildFFmpegArgs({
        ...BASE,
        mobileLayout: { mode: "stacked", splitRatio: split, zones },
      });
      const fc = complex(args) ?? "";
      const clamped = Math.max(0.2, Math.min(0.8, split));
      const h1 = Math.round(1920 * clamped);
      expect(fc).toContain(`scale=1080:${h1}`);
      expect(fc).toContain(`scale=1080:${1920 - h1}`);
      expect(fc).toContain("vstack=inputs=2");
    }
  });
});

describe("cutBuilder", () => {
  test("totalCutDuration sums segments", () => {
    expect(
      totalCutDuration([
        { start: 0, end: 1.5 },
        { start: 2, end: 4 },
      ]),
    ).toBeCloseTo(3.5);
  });

  test("cuts sort by start, concat n matches count", () => {
    const args = buildCutFFmpegArgs({
      inputPath: "/tmp/in.mp4",
      filename: "c",
      sourceWidth: 1920,
      sourceHeight: 1080,
      cuts: [
        { start: 5, end: 6 },
        { start: 1, end: 2 },
      ],
      mode: "full-size",
    });
    const fc = complex(args) ?? "";
    expect(fc).toContain("concat=n=2:v=1:a=1");
    expect(fc.indexOf("trim=1:2")).toBeLessThan(fc.indexOf("trim=5:6"));
  });

  test("1-stack crops zone to pixels and scales 1080x1920", () => {
    const args = buildCutFFmpegArgs({
      inputPath: "/tmp/in.mp4",
      filename: "c",
      sourceWidth: 1920,
      sourceHeight: 1080,
      cuts: [{ start: 0, end: 1 }],
      mode: "1-stack",
      zones: [{ id: "z", x: 0.25, y: 0.25, width: 0.5, height: 0.5, zoom: 1 }],
    });
    expect(complex(args)).toContain("crop=960:540:480:270,scale=1080:1920");
  });

  test("2-stack split clamps and halves sum to 1920", () => {
    const zones = [
      { id: "a", x: 0, y: 0, width: 1, height: 1, zoom: 1 },
      { id: "b", x: 0, y: 0, width: 1, height: 1, zoom: 1 },
    ];
    const args = buildCutFFmpegArgs({
      inputPath: "/tmp/in.mp4",
      filename: "c",
      sourceWidth: 1920,
      sourceHeight: 1080,
      cuts: [{ start: 0, end: 1 }],
      mode: "2-stack",
      zones,
      splitRatio: 0.05,
    });
    const fc = complex(args) ?? "";
    expect(fc).toContain("scale=1080:384");
    expect(fc).toContain("scale=1080:1536");
  });
});

describe("buildMobileSubtitlesArgs overlay math", () => {
  const layout = {
    mode: "full" as const,
    splitRatio: 0.5,
    zones: [{ id: "z", x: 0, y: 0, width: 100, height: 100, zoom: 1 }],
  };
  const overlay = {
    startTime: 3,
    endTime: 5,
    x: 50,
    y: 80,
    width: 800,
    height: 100,
    pngPath: "/tmp/sub0.png",
  };

  test("enable window scales for trim + speed", () => {
    const args = buildMobileSubtitlesArgs({
      inputPath: "/tmp/in.mp4",
      subtitleOverlays: [overlay],
      subtitlePngPaths: ["/tmp/sub0.png"],
      sourceWidth: 1920,
      sourceHeight: 1080,
      trimRange: [1, 10],
      mobileLayout: layout,
      filename: "s",
      speed: 2,
    });
    // (3-1)/2=1, (5-1)/2=2
    expect(complex(args)).toContain("enable='between(t,1.000000,2.000000)'");
    expect(args).toContain("-shortest");
  });

  test("x/y percents clamp to canvas, centered expressions", () => {
    const args = buildMobileSubtitlesArgs({
      inputPath: "/tmp/in.mp4",
      subtitleOverlays: [{ ...overlay, x: 150, y: -20 }],
      subtitlePngPaths: ["/tmp/sub0.png"],
      sourceWidth: 1920,
      sourceHeight: 1080,
      trimRange: [0, 10],
      mobileLayout: layout,
      filename: "s",
    });
    const fc = complex(args) ?? "";
    expect(fc).toContain("x='W*1.000000-w/2'");
    expect(fc).toContain("y='H*0.000000-h/2'");
  });

  test("no subtitles → fallback composite, no -shortest", () => {
    const args = buildMobileSubtitlesArgs({
      inputPath: "/tmp/in.mp4",
      subtitleOverlays: [],
      subtitlePngPaths: [],
      sourceWidth: 1920,
      sourceHeight: 1080,
      trimRange: [0, 10],
      mobileLayout: layout,
      filename: "s",
    });
    expect(complex(args)).toContain(
      `[0:v]crop=1920:1080:0:0,scale=${OUTPUT_W}:${OUTPUT_H}:flags=lanczos[v]`,
    );
    expect(args).not.toContain("-shortest");
    expect(OUTPUT_W).toBe(1080);
    expect(OUTPUT_H).toBe(1920);
  });

  test("webm keeps opus audio (B4 leftover fix)", () => {
    const args = buildMobileSubtitlesArgs({
      inputPath: "/tmp/in.mp4",
      subtitleOverlays: [],
      subtitlePngPaths: [],
      sourceWidth: 1920,
      sourceHeight: 1080,
      trimRange: [0, 10],
      mobileLayout: layout,
      filename: "s",
      format: "webm",
    });
    expect(args).toContain("libopus");
    expect(args).not.toContain("-an");
  });

  test("omitted audioTracks → legacy whole-input map", () => {
    const args = buildMobileSubtitlesArgs({
      inputPath: "/tmp/in.mp4",
      subtitleOverlays: [],
      subtitlePngPaths: [],
      sourceWidth: 1920,
      sourceHeight: 1080,
      trimRange: [0, 10],
      mobileLayout: layout,
      filename: "s",
    });
    expect(args).toContain("0:a?");
  });

  test("audioTracks → per-track maps, disabled skipped", () => {
    const base = {
      inputPath: "/tmp/in.mp4",
      subtitleOverlays: [],
      subtitlePngPaths: [],
      sourceWidth: 1920,
      sourceHeight: 1080,
      trimRange: [0, 10] as [number, number],
      mobileLayout: layout,
      filename: "s",
    };
    const args = buildMobileSubtitlesArgs({
      ...base,
      audioTracks: [
        { trackIndex: 0, enabled: true },
        { trackIndex: 1, enabled: false },
        { trackIndex: 2, enabled: true },
      ],
    });
    expect(args).toContain("0:a:0?");
    expect(args).toContain("0:a:2?");
    expect(args).not.toContain("0:a:1?");
    expect(args).not.toContain("0:a?");
  });

  test("audioTracks survive subtitles + speed (atempo stays global)", () => {
    const args = buildMobileSubtitlesArgs({
      inputPath: "/tmp/in.mp4",
      subtitleOverlays: [overlay],
      subtitlePngPaths: ["/tmp/sub0.png"],
      sourceWidth: 1920,
      sourceHeight: 1080,
      trimRange: [0, 10],
      mobileLayout: layout,
      filename: "s",
      speed: 2,
      audioTracks: [{ trackIndex: 1, enabled: true }],
    });
    expect(args).toContain("0:a:1?");
    expect(args).toContain("-filter:a");
    expect(args).toContain("atempo=2.000000");
  });
});
