import { Hono } from "hono";
import type { Context } from "hono";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { resolveRequestInput } from "./input.js";
import { err, quotaExceeded } from "../http.js";
import { UPLOAD_ID_HEADER, UPLOAD_ID_QUERY } from "@repo/contracts";
import { FileStoreQuotaError, store } from "../storage/index.js";

const app = new Hono();
const PEAK_COUNT = 2400;

type AudioTrack = {
  trackIndex: number;
  streamIndex: number;
  codec: string | null;
  codecLongName: string | null;
  language: string | null;
  title: string | null;
  channels: number;
  sampleRate: number;
};

/**
 * Audio call-site adapter over the shared resolver: chunked sessions skip
 * multipart parsing (header/query hit passes a null form), direct uploads
 * parse the form; quota + missing-input map to the audio error shape here.
 */
async function resolveAudioInput(c: Context) {
  const headerHit =
    c.req.header(UPLOAD_ID_HEADER) ?? c.req.query(UPLOAD_ID_QUERY);
  const form = headerHit ? null : await c.req.formData().catch(() => null);
  try {
    const resolved = await resolveRequestInput(c, form);
    if (!resolved.ok)
      return {
        ok: false as const,
        response: err(c, "FILE_REQUIRED", {
          message: "Audio file is required",
        }),
      };
    const { assetId, temporaryPath: inputPath, remove } = resolved.input;
    return { ok: true as const, input: { assetId, inputPath, remove } };
  } catch (e) {
    if (e instanceof FileStoreQuotaError)
      return {
        ok: false as const,
        response: quotaExceeded(c, e.neededBytes, e.quotaBytes),
      };
    throw e;
  }
}

async function run(args: string[]) {
  const process = Bun.spawn(args, { stdout: "pipe", stderr: "pipe" });
  const [exitCode, stdout, stderr] = await Promise.all([
    process.exited,
    new Response(process.stdout as ReadableStream).arrayBuffer(),
    new Response(process.stderr as ReadableStream).text(),
  ]);
  return { exitCode, stdout: new Uint8Array(stdout), stderr };
}

app.post("/audio/analysis", async (c) => {
  const r = await resolveAudioInput(c);
  if (!r.ok) return r.response;
  const input = r.input;
  try {
    const probe = await run([
      "ffprobe",
      "-v",
      "error",
      "-print_format",
      "json",
      "-show_entries",
      "format=duration:stream=index,codec_name,codec_long_name,sample_rate,channels:stream_tags=language,title",
      "-select_streams",
      "a",
      input.inputPath,
    ]);
    if (probe.exitCode !== 0)
      return err(c, "FFPROBE_FAILED", {
        message: "Unable to inspect audio",
        details: { ffprobeStderr: probe.stderr.slice(-2000) },
      });
    const parsed = JSON.parse(new TextDecoder().decode(probe.stdout)) as {
      format?: { duration?: string };
      streams?: Array<{
        index?: number;
        codec_name?: string;
        codec_long_name?: string;
        sample_rate?: string;
        channels?: number;
        tags?: { language?: string; title?: string };
      }>;
    };
    const duration = Number(parsed.format?.duration ?? 0);
    const tracks: AudioTrack[] = (parsed.streams ?? []).map(
      (stream, trackIndex) => ({
        trackIndex,
        streamIndex: stream.index ?? trackIndex,
        codec: stream.codec_name ?? null,
        codecLongName: stream.codec_long_name ?? null,
        language: stream.tags?.language ?? null,
        title: stream.tags?.title ?? null,
        channels: stream.channels ?? 0,
        sampleRate: Number(stream.sample_rate ?? 8000),
      }),
    );
    if (!tracks.length)
      return err(c, "NO_AUDIO_TRACK", { message: "No audio tracks found" });
    const requestedTrack = Number(c.req.query("track") ?? 0);
    const trackIndex =
      Number.isInteger(requestedTrack) &&
      requestedTrack >= 0 &&
      requestedTrack < tracks.length
        ? requestedTrack
        : 0;
    const selectedTrack = tracks[trackIndex];
    const sampleRate = selectedTrack.sampleRate;
    if (!Number.isFinite(duration) || duration <= 0)
      return err(c, "AUDIO_FAILED", { message: "Audio duration unavailable" });

    const waveform = await run([
      "ffmpeg",
      "-v",
      "error",
      "-i",
      input.inputPath,
      "-map",
      `0:a:${trackIndex}`,
      "-vn",
      "-ac",
      "1",
      "-ar",
      "8000",
      "-f",
      "f32le",
      "pipe:1",
    ]);
    if (waveform.exitCode !== 0)
      return err(c, "AUDIO_FAILED", {
        message: "Unable to decode audio waveform",
        details: { ffmpegStderr: waveform.stderr.slice(-2000) },
      });
    const peaks = new Array<number>(PEAK_COUNT).fill(0);
    const rms = new Array<number>(PEAK_COUNT).fill(0);
    const counts = new Array<number>(PEAK_COUNT).fill(0);
    const values = new Float32Array(
      waveform.stdout.buffer,
      waveform.stdout.byteOffset,
      Math.floor(waveform.stdout.byteLength / 4),
    );
    for (let index = 0; index < values.length; index++) {
      const bucket = Math.min(
        PEAK_COUNT - 1,
        Math.floor((index / (8000 * duration)) * PEAK_COUNT),
      );
      const value = Math.abs(values[index]);
      peaks[bucket] = Math.max(peaks[bucket], value);
      rms[bucket] += value * value;
      counts[bucket]++;
    }
    for (let i = 0; i < PEAK_COUNT; i++)
      rms[i] = counts[i] ? Math.sqrt(rms[i] / counts[i]) : 0;

    const loudness = await run([
      "ffmpeg",
      "-v",
      "info",
      "-i",
      input.inputPath,
      "-map",
      `0:a:${trackIndex}`,
      "-af",
      "loudnorm=I=-14:print_format=json",
      "-f",
      "null",
      "-",
    ]);
    const match = loudness.stderr.match(/\{[\s\S]*\}/);
    const report = match
      ? (JSON.parse(match[0]) as Record<string, string>)
      : null;
    const inputIntegratedLufs = Number(report?.input_i);
    const inputTruePeak = Number(report?.input_tp);
    const inputLra = Number(report?.input_lra);
    const validLoudness = [inputIntegratedLufs, inputTruePeak, inputLra].every(
      Number.isFinite,
    );
    return c.json({
      duration,
      sampleRate: 8000,
      tracks,
      selectedTrack: trackIndex,
      peaks,
      rms,
      loudness: validLoudness
        ? {
            inputIntegratedLufs,
            inputTruePeak,
            inputLra,
            targetIntegratedLufs: -14,
          }
        : null,
    });
  } catch {
    return err(c, "INTERNAL", { message: "Audio analysis failed" });
  } finally {
    if (input.remove && input.assetId) store.release(input.assetId);
  }
});

app.post("/audio/extract", async (c) => {
  const r = await resolveAudioInput(c);
  if (!r.ok) return r.response;
  const input = r.input;
  const format = c.req.query("format") === "wav" ? "wav" : "mp3";
  // Direct temp file (no store record): buffered into the response, then
  // unlinked in `finally` — the 5-min-ephemeral equivalent is that the
  // file cannot outlive the request.
  const outputPath = path.join(
    os.tmpdir(),
    `ffmpeg_editor_extract_${crypto.randomUUID().replace(/-/g, "")}.${format}`,
  );
  try {
    const requestedTrack = Number(c.req.query("track") ?? 0);
    const mapTrack =
      Number.isInteger(requestedTrack) && requestedTrack >= 0
        ? requestedTrack
        : 0;
    const args =
      format === "wav"
        ? [
            "ffmpeg",
            "-y",
            "-i",
            input.inputPath,
            "-map",
            `0:a:${mapTrack}`,
            "-vn",
            "-c:a",
            "pcm_s16le",
            outputPath,
          ]
        : [
            "ffmpeg",
            "-y",
            "-i",
            input.inputPath,
            "-map",
            `0:a:${mapTrack}`,
            "-vn",
            "-c:a",
            "libmp3lame",
            "-q:a",
            "2",
            outputPath,
          ];
    const result = await run(args);
    if (result.exitCode !== 0)
      return err(c, "AUDIO_FAILED", {
        message: "Audio extraction failed",
        details: { ffmpegStderr: result.stderr.slice(-2000) },
      });
    const body = await Bun.file(outputPath).arrayBuffer();
    return new Response(body, {
      headers: {
        "Content-Type": format === "wav" ? "audio/wav" : "audio/mpeg",
        "Content-Disposition": `attachment; filename="extracted.${format}"`,
      },
    });
  } finally {
    try {
      fs.unlinkSync(outputPath);
    } catch {}
    if (input.remove && input.assetId) store.release(input.assetId);
  }
});

export default app;
