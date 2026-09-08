import { z } from "zod";
import { parse as shellParse } from "shell-quote";

// ---------------------------------------------------------------------------
// B4: strict shared validation for transcode settings.
// Replaces the hand-rolled parseSettings/parseMobileSettings/parseCutSettings
// null-returns with zod schemas so 400s carry structured `issues` instead of
// a single opaque "invalid settings" string. Rules mirror the previous
// validators exactly (no behavior change beyond the error shape).
// NOTE: client/server schema sharing waits on B3 (@repo/types) — the web app
// still builds the same settingsJson payloads these schemas accept.
// ---------------------------------------------------------------------------

const finite = z.number().finite();

const zone01 = z
  .object({
    id: z.string().optional(),
    x: finite,
    y: finite,
    width: finite,
    height: finite,
    zoom: finite.optional(),
  })
  .superRefine((zone, ctx) => {
    const bad =
      zone.x < 0 ||
      zone.y < 0 ||
      zone.x + zone.width > 1.001 ||
      zone.y + zone.height > 1.001 ||
      zone.width < 0.02 ||
      zone.height < 0.02;
    if (bad) {
      ctx.addIssue({
        code: "custom",
        message:
          "zone must satisfy x>=0, y>=0, x+w<=1, y+h<=1, w>=0.02, h>=0.02 (0-1 normalized)",
      });
    }
  });

const mobileLayoutSchema = z
  .object({
    mode: z.enum(["full", "stacked"]),
    splitRatio: finite.min(0.2).max(0.8),
    zones: z.array(zone01),
  })
  .superRefine((layout, ctx) => {
    const expected = layout.mode === "full" ? 1 : 2;
    if (layout.zones.length !== expected) {
      ctx.addIssue({
        code: "custom",
        message: `mode "${layout.mode}" requires exactly ${expected} zone(s), got ${layout.zones.length}`,
      });
    }
  });

const audioTrackSchema = z.object({
  trackIndex: finite.int().min(0),
  enabled: z.boolean(),
  gainDb: finite.min(-60).max(24).default(0),
  loudnormEnabled: z.boolean().default(false),
  loudnormTargetLufs: finite.min(-70).max(-5).default(-14),
  fadeInSeconds: finite.min(0).max(3600).default(0),
  fadeOutSeconds: finite.min(0).max(3600).default(0),
  muteSegments: z
    .array(z.object({ start: finite, end: finite }))
    .max(500)
    .default([]),
});

const exportBase = z.object({
  sourceWidth: finite,
  sourceHeight: finite,
  trimRange: z.tuple([finite, finite]),
  exportFps: finite,
  exportSpeed: finite,
  exportQuality: finite,
  exportFilename: z.string().min(1),
  customFFmpegArgs: z.string().optional().default(""),
  watermark: z.boolean().optional(),
  audioTrackIndex: finite.int().min(0).optional().default(0),
  audioTracks: z.array(audioTrackSchema).max(32).optional(),
  ignoreTrim: z.boolean().optional(),
  ignoreTrimSettings: z.boolean().optional(),
  gainDb: finite.min(-60).max(24).optional().default(0),
  loudnormTargetLufs: finite.min(-70).max(-5).optional(),
  fadeInSeconds: finite.min(0).max(3600).optional().default(0),
  fadeOutSeconds: finite.min(0).max(3600).optional().default(0),
  muteSegments: z
    .array(z.object({ start: finite, end: finite }))
    .max(500)
    .optional()
    .default([]),
});

/** POST /transcode — generic crop/trim/speed (+ optional mobile layout). */
export const genericSettingsSchema = exportBase
  .extend({
    exportFormat: z.enum(["mp4", "webm", "mov"]),
    crop: z
      .object({ x: finite, y: finite, width: finite, height: finite })
      .optional(),
    mobileLayout: mobileLayoutSchema.optional(),
  })
  .superRefine((s, ctx) => {
    if (!s.crop && !s.mobileLayout) {
      ctx.addIssue({
        code: "custom",
        message: "either crop or mobileLayout is required",
      });
    }
  });

/** POST /transcode/mobile + /transcode/mobile/subtitles (0-1 normalized zones). */
export const mobileSettingsSchema = exportBase.extend({
  mobileLayout: mobileLayoutSchema,
});

/** POST /transcode/cut — zones accept 0-1 normalized or 0-100 percent. */
const cutZoneSchema = z.object({
  id: z.string().optional(),
  x: finite,
  y: finite,
  width: finite,
  height: finite,
  zoom: finite.optional(),
});

const cutSegmentSchema = z.object({ start: finite, end: finite });

export const cutSettingsSchema = z
  .object({
    mode: z.enum(["full-size", "2-stack", "1-stack"]),
    cuts: z.array(cutSegmentSchema).min(1).max(50),
    sourceWidth: finite,
    sourceHeight: finite,
    exportFps: z.preprocess((v) => v ?? 30, finite),
    exportQuality: z.preprocess((v) => v ?? 18, finite),
    exportSpeed: z.preprocess((v) => v ?? 1, finite),
    exportFilename: z.string().optional().default(""),
    customFFmpegArgs: z.string().optional().default(""),
    watermark: z.boolean().optional(),
    audioTrackIndex: finite.int().min(0).optional().default(0),
    audioTracks: z.array(audioTrackSchema).max(32).optional(),
    splitRatio: finite.min(0.2).max(0.8).optional(),
    zones: z.array(cutZoneSchema).optional(),
  })
  .superRefine((s, ctx) => {
    const sorted = [...s.cuts].sort((a, b) => a.start - b.start);
    sorted.forEach((cut, i) => {
      if (cut.start < 0 || cut.end <= cut.start + 0.049) {
        ctx.addIssue({
          code: "custom",
          message: `cuts[${i}]: requires start>=0 and end>start+0.05`,
        });
      }
      if (i > 0 && cut.start < sorted[i - 1].end - 0.001) {
        ctx.addIssue({
          code: "custom",
          message: `cuts[${i}]: overlaps previous cut (cuts must be sorted and non-overlapping)`,
        });
      }
    });
    if (s.mode === "2-stack") {
      if (!s.zones || s.zones.length !== 2) {
        ctx.addIssue({
          code: "custom",
          message: 'mode "2-stack" requires exactly 2 zones',
        });
      }
    }
    if (s.mode === "1-stack") {
      if (!s.zones || s.zones.length !== 1) {
        ctx.addIssue({
          code: "custom",
          message: 'mode "1-stack" requires exactly 1 zone',
        });
      }
    }
    for (const zone of s.zones ?? []) {
      const scale = zone.width > 1 || zone.height > 1 ? 100 : 1;
      const nx = zone.x / scale;
      const ny = zone.y / scale;
      const nw = zone.width / scale;
      const nh = zone.height / scale;
      if (
        nx < 0 ||
        ny < 0 ||
        nx + nw > 1.001 ||
        ny + nh > 1.001 ||
        nw < 0.02 ||
        nh < 0.02
      ) {
        ctx.addIssue({
          code: "custom",
          message:
            "zone out of bounds (0-1 normalized or 0-100 percent, min size 0.02)",
        });
        break;
      }
    }
  });

export type GenericSettings = z.infer<typeof genericSettingsSchema>;
export type MobileSettings = z.infer<typeof mobileSettingsSchema>;
export type CutSettings = z.infer<typeof cutSettingsSchema>;

/** Normalize alias: frontend may send either ignoreTrim key. */
export function normalizeTrimAlias<
  T extends { ignoreTrim?: boolean; ignoreTrimSettings?: boolean },
>(s: T): T {
  if (s.ignoreTrim === undefined && typeof s.ignoreTrimSettings === "boolean") {
    return { ...s, ignoreTrim: s.ignoreTrimSettings };
  }
  return s;
}

export type SettingsParse<T> =
  | { ok: true; data: T }
  | { ok: false; issues: string[] };

/** Parse the multipart `settings` JSON field against a zod schema. */
export function parseSettingsJson<T>(
  value: FormDataEntryValue | null,
  schema: z.ZodType<T>,
): SettingsParse<T> {
  if (typeof value !== "string") {
    return { ok: false, issues: ["settings: required JSON string field"] };
  }
  let raw: unknown;
  try {
    raw = JSON.parse(value);
  } catch {
    return { ok: false, issues: ["settings: invalid JSON"] };
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    return {
      ok: false,
      issues: result.error.issues.map((i) => {
        const at = i.path.length ? `${i.path.join(".")}: ` : "";
        return `${at}${i.message}`;
      }),
    };
  }
  return { ok: true, data: result.data };
}

// ---------------------------------------------------------------------------
// customFFmpegArgs parsing (shell-quote + structural denylist).
// Previously `str.trim().split(/\s+/)` — broke quoted values ('-vf "eq=..."')
// and let structural flags (-i, -map, second outputs, -progress overrides)
// silently corrupt the pipeline. Now: shell-aware tokenize, reject shell
// operators, deny pipeline-structure flags, reject bare positionals (only one
// output — ours, appended last). `-vf`/`-filter:v` are merged into the
// builder's own filter chain for the generic builder; denied for the
// filter_complex builders (cut/subtitles) where they would conflict.
// ---------------------------------------------------------------------------

export interface ParsedCustomArgs {
  args: string[];
  /** -vf values to merge into the builder's own video filter chain. */
  extraVf: string[];
}

const DENY_FLAGS = new Set([
  "-i",
  "-ss",
  "-to",
  "-t",
  "-progress",
  "-nostats",
  "-map",
  "-filter_complex",
  "-filter:a",
  "-f",
  "-y",
  "-n",
]);

/**
 * Parse user-supplied extra ffmpeg args. Throws Error with a user-facing
 * message on anything structural or shell-like; routes turn it into 400.
 */
export function parseCustomArgs(
  raw: string | undefined | null,
  opts?: { allowVf?: boolean },
): ParsedCustomArgs {
  const out: ParsedCustomArgs = { args: [], extraVf: [] };
  const text = (raw ?? "").trim();
  if (!text) return out;
  let tokens: Array<string | object>;
  try {
    tokens = shellParse(text) as Array<string | object>;
  } catch (e) {
    throw new Error(
      `customFFmpegArgs could not be parsed: ${e instanceof Error ? e.message : "quote mismatch?"}`,
    );
  }
  const allowVf = opts?.allowVf ?? false;
  let i = 0;
  let prevWasFlag = false;
  while (i < tokens.length) {
    const tok = tokens[i];
    if (typeof tok !== "string") {
      throw new Error(
        "customFFmpegArgs must not contain shell operators (|, ;, &&, >, <, $, globs). Pass plain ffmpeg flags only.",
      );
    }
    if (tok === "-vf" || tok === "-filter:v") {
      const value = tokens[i + 1];
      if (typeof value !== "string" || !value) {
        throw new Error(`${tok} requires a filter value.`);
      }
      if (!allowVf) {
        throw new Error(
          `${tok} is not allowed here (this export builds its own filter graph). Use the crop/speed/fps controls instead.`,
        );
      }
      out.extraVf.push(value);
      i += 2;
      prevWasFlag = false;
      continue;
    }
    if (tok.startsWith("-")) {
      if (DENY_FLAGS.has(tok)) {
        throw new Error(
          `${tok} is managed by the exporter and cannot be overridden via customFFmpegArgs.`,
        );
      }
      out.args.push(tok);
      prevWasFlag = true;
      i += 1;
      continue;
    }
    // Bare token: only allowed as a flag's value (e.g. `-b:v 2M`).
    if (!prevWasFlag) {
      throw new Error(
        `customFFmpegArgs: unexpected positional argument "${tok.length > 40 ? `${tok.slice(0, 40)}…` : tok}". Only flag values are allowed (single output is managed by the exporter).`,
      );
    }
    out.args.push(tok);
    prevWasFlag = false;
    i += 1;
  }
  return out;
}
