/**
 * B5: ffprobe golden-fixture tests for extractVideoMetadata (pure helper
 * behind POST /metadata). Fixtures live in test/fixtures/.
 */
import { describe, expect, test } from "bun:test";
import { extractVideoMetadata } from "../src/utils/metadata.js";

async function fixture(name: string) {
  const file = Bun.file(new URL(`./fixtures/${name}`, import.meta.url));
  return (await file.json()) as Record<string, unknown>;
}

describe("extractVideoMetadata", () => {
  test("real av fixture: h264 320x240 @10fps + aac", async () => {
    const report = await fixture("ffprobe-av.json");
    const res = extractVideoMetadata(report, "clip.mp4");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.metadata.videoCodec).toBe("h264");
    expect(res.metadata.width).toBe(320);
    expect(res.metadata.height).toBe(240);
    expect(res.metadata.frameRate).toBeCloseTo(10);
    expect(res.metadata.audioCodec).toBe("aac");
    expect(res.metadata.durationSeconds).toBeCloseTo(1);
    expect(res.metadata.containerFormat).toContain("mp4");
    expect(res.metadata.bitrateKbps).toBeGreaterThan(0);
  });

  test("audio-only fixture → no-video-stream (route maps to 422)", async () => {
    const report = await fixture("ffprobe-audio-only.json");
    const res = extractVideoMetadata(report, "song.m4a");
    expect(res).toEqual({ ok: false, error: "no-video-stream" });
  });

  test("empty report → empty-report (route maps to 422)", async () => {
    const report = await fixture("ffprobe-empty.json");
    const res = extractVideoMetadata(report, "blank.bin");
    expect(res).toEqual({ ok: false, error: "empty-report" });
  });

  test("missing r_frame_rate → frameRate 0, not NaN", () => {
    const res = extractVideoMetadata(
      {
        format: { duration: "2", bit_rate: "1000" },
        streams: [
          { codec_type: "video", codec_name: "h264", width: 64, height: 64 },
        ],
      },
      "no-fps.mp4",
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.metadata.frameRate).toBe(0);
    expect(res.metadata.audioCodec).toBeUndefined();
  });
});
