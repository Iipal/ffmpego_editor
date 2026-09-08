/**
 * Server validation entry point.
 *
 * Settings schemas live in @repo/contracts (shared with the web app, which
 * validates the same payloads before upload). This module re-exports them
 * for existing import sites and keeps server-only parsing here:
 * customFFmpegArgs (shell-quote tokenizing + structural denylist).
 */
import { parse as shellParse } from "shell-quote";

export {
  audioTrackSchema,
  cutSettingsSchema,
  flattenIssues,
  genericSettingsSchema,
  mobileLayoutSchema,
  mobileSettingsSchema,
  normalizeTrimAlias,
  parseSettingsJson,
  type CutSettings,
  type GenericSettings,
  type MobileSettings,
  type SettingsParse,
} from "@repo/contracts";

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
