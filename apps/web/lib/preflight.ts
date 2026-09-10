// Preflight: fail-fast summary + estimates + connectivity check shown in the
// export panel before anything uploads. Errors block the export action;
// warnings are advisory (server ignores e.g. CRF for MOV silently).
//
// Editors call `preflight.check(...)` during render for the advisory summary
// and `preflight.probeApiConnectivity()` inside the export gate; both funnel
// through this service so the fail-fast rules live in one place.
import { apiClient } from "./api-client";
import { health } from "./health";

/** Single fail-fast finding: `error` blocks export, `warn` is advisory. */
export interface PreflightIssue {
  level: "error" | "warn";
  message: string;
}

/** Everything `Preflight.check` needs to rule an export in or out. */
export interface PreflightInput {
  hasFile: boolean;
  sourceWidth: number;
  sourceHeight: number;
  duration: number;
  trimRange: [number, number];
  ignoreTrim: boolean;
  exportFormat: string;
  exportFps: number;
  exportSpeed: number;
  watermark: boolean;
  hasMobileLayout: boolean;
  presetTarget: "transcode" | "audio-extract";
  /** Source bitrate in kbps (if probed) — drives the rough size estimate. */
  bitrateKbps?: number | null;
}

/** Verdict of `Preflight.check`: blocking flag + findings + summary lines. */
export interface PreflightResult {
  ok: boolean;
  issues: PreflightIssue[];
  /** Human summary lines (duration, geometry, pacing, rough size). */
  summary: string[];
}

/**
 * Singleton service owning the export fail-fast gate: the synchronous
 * rule check (`check`) plus the connectivity probe (`probeApiConnectivity`).
 * Stateless and side-effect free apart from the probe's single GET, so the
 * sidebar can call `check` during render without memo concerns.
 */
class Preflight {
  /** Default timeout for the connectivity probe (fail fast, don't hang). */
  private static readonly DEFAULT_PROBE_TIMEOUT_MS = 4000;
  /** Telegram sticker cap — longer trims are cut server-side. */
  private static readonly STICKER_MAX_SECONDS = 3;

  // ------------------------------------------------------------------ public

  /**
   * Rule-check an export without touching the network. Errors (no file,
   * unknown dimensions, empty trim) block the export action; warnings
   * (sticker caps, ignored speed/CRF, skipped watermark/layout) are advisory.
   * Always returns human summary lines alongside the verdict.
   */
  check(input: PreflightInput): PreflightResult {
    const issues: PreflightIssue[] = [];
    const {
      hasFile,
      sourceWidth,
      sourceHeight,
      duration,
      trimRange,
      ignoreTrim,
      exportFormat,
      exportSpeed,
      watermark,
      hasMobileLayout,
      presetTarget,
    } = input;

    if (!hasFile)
      issues.push({ level: "error", message: "No source file loaded." });
    if (sourceWidth === 0 || sourceHeight === 0)
      issues.push({
        level: "error",
        message: "Source dimensions unknown — metadata still loading.",
      });

    const renderSeconds = ignoreTrim
      ? duration
      : Math.max(0, (trimRange[1] ?? 0) - (trimRange[0] ?? 0));
    if (!ignoreTrim && renderSeconds <= 0)
      issues.push({
        level: "error",
        message: "Trim range is empty — adjust trim or enable Ignore trim.",
      });

    if (presetTarget === "audio-extract") {
      // No video-side constraints apply.
    } else if (exportFormat === "webm-tg") {
      if (!ignoreTrim && renderSeconds > Preflight.STICKER_MAX_SECONDS)
        issues.push({
          level: "warn",
          message: "Telegram sticker caps output at 3s — trim will be cut.",
        });
      if (exportSpeed !== 1)
        issues.push({
          level: "warn",
          message: "Speed is ignored for Telegram stickers.",
        });
    } else if (exportFormat === "gif") {
      if (watermark && !hasMobileLayout)
        issues.push({
          level: "warn",
          message:
            "Watermark needs a mobile layout — it will be skipped for GIF.",
        });
      if (hasMobileLayout)
        issues.push({
          level: "warn",
          message:
            "Mobile layout is skipped for GIF (cropped source is scaled to 480px).",
        });
    } else if (exportFormat === "mov") {
      issues.push({
        level: "warn",
        message: "MOV uses ProRes — the CRF slider has no effect.",
      });
    }
    if (watermark && !hasMobileLayout && exportFormat !== "gif")
      issues.push({
        level: "warn",
        message: "Watermark needs a mobile layout — it will be skipped.",
      });

    const summary: string[] = [];
    if (presetTarget === "audio-extract") {
      summary.push(`Audio-only pull · ${Preflight.fmtDuration(renderSeconds)}`);
    } else {
      const outSeconds =
        exportFormat === "webm-tg" && !ignoreTrim
          ? Math.min(Preflight.STICKER_MAX_SECONDS, renderSeconds)
          : renderSeconds;
      summary.push(
        `${exportFormat.toUpperCase()} · ${sourceWidth}×${sourceHeight} · ${input.exportFps}fps · ${Preflight.fmtDuration(outSeconds)}${exportSpeed !== 1 ? ` · ${exportSpeed}x` : ""}`,
      );
    }
    if (input.bitrateKbps && renderSeconds > 0) {
      const mb = (input.bitrateKbps * renderSeconds) / 8 / 1024;
      summary.push(
        `Rough size ~${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB (source bitrate)`,
      );
    }

    return { ok: !issues.some((i) => i.level === "error"), issues, summary };
  }

  /**
   * Fail-fast connectivity probe with a short timeout. Hits lightweight
   * `GET /health` (no SQLite/jobs-table touch) instead of the heavy
   * `GET /api/transcode/jobs` list. Returns `null` when the API is reachable,
   * otherwise a human message for the export gate toast ("API unreachable —
   * is the backend running on …?").
   */
  async probeApiConnectivity(
    timeoutMs = Preflight.DEFAULT_PROBE_TIMEOUT_MS,
  ): Promise<string | null> {
    try {
      await health.fetchHealth(timeoutMs);
      return null;
    } catch (e) {
      return e instanceof Error
        ? e.message
        : "API unreachable — is the backend running on " +
            apiClient.baseUrl +
            "?";
    }
  }

  // ----------------------------------------------------------------- private

  /** Compact duration for summary lines (`1m 2.3s`, `—` when unknown). */
  private static fmtDuration(sec: number): string {
    if (!Number.isFinite(sec) || sec < 0) return "—";
    const m = Math.floor(sec / 60);
    const s = (sec - m * 60).toFixed(1);
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
  }
}

/** App-wide singleton — the export gate checks through this service. */
export const preflight = new Preflight();
