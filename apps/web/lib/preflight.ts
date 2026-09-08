// Preflight: fail-fast summary + estimates + connectivity check shown in the
// export panel before anything uploads. Errors block the export action;
// warnings are advisory (server ignores e.g. CRF for MOV silently).
import { API_BASE_URL } from "./api-client";

export interface PreflightIssue {
  level: "error" | "warn";
  message: string;
}

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

export interface PreflightResult {
  ok: boolean;
  issues: PreflightIssue[];
  /** Human summary lines (duration, geometry, pacing, rough size). */
  summary: string[];
}

function fmtDuration(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return "—";
  const m = Math.floor(sec / 60);
  const s = (sec - m * 60).toFixed(1);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export function preflightExport(input: PreflightInput): PreflightResult {
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

  if (!hasFile) issues.push({ level: "error", message: "No source file loaded." });
  if (sourceWidth === 0 || sourceHeight === 0)
    issues.push({ level: "error", message: "Source dimensions unknown — metadata still loading." });

  const renderSeconds = ignoreTrim
    ? duration
    : Math.max(0, (trimRange[1] ?? 0) - (trimRange[0] ?? 0));
  if (!ignoreTrim && renderSeconds <= 0)
    issues.push({ level: "error", message: "Trim range is empty — adjust trim or enable Ignore trim." });

  if (presetTarget === "audio-extract") {
    // No video-side constraints apply.
  } else if (exportFormat === "webm-tg") {
    if (!ignoreTrim && renderSeconds > 3)
      issues.push({ level: "warn", message: "Telegram sticker caps output at 3s — trim will be cut." });
    if (exportSpeed !== 1)
      issues.push({ level: "warn", message: "Speed is ignored for Telegram stickers." });
  } else if (exportFormat === "gif") {
    if (watermark && !hasMobileLayout)
      issues.push({ level: "warn", message: "Watermark needs a mobile layout — it will be skipped for GIF." });
    if (hasMobileLayout)
      issues.push({ level: "warn", message: "Mobile layout is skipped for GIF (cropped source is scaled to 480px)." });
  } else if (exportFormat === "mov") {
    issues.push({ level: "warn", message: "MOV uses ProRes — the CRF slider has no effect." });
  }
  if (watermark && !hasMobileLayout && exportFormat !== "gif")
    issues.push({ level: "warn", message: "Watermark needs a mobile layout — it will be skipped." });

  const summary: string[] = [];
  if (presetTarget === "audio-extract") {
    summary.push(`Audio-only pull · ${fmtDuration(renderSeconds)}`);
  } else {
    const outSeconds =
      exportFormat === "webm-tg" && !ignoreTrim ? Math.min(3, renderSeconds) : renderSeconds;
    summary.push(
      `${exportFormat.toUpperCase()} · ${sourceWidth}×${sourceHeight} · ${input.exportFps}fps · ${fmtDuration(outSeconds)}${exportSpeed !== 1 ? ` · ${exportSpeed}x` : ""}`,
    );
  }
  if (input.bitrateKbps && renderSeconds > 0) {
    const mb = (input.bitrateKbps * renderSeconds) / 8 / 1024;
    summary.push(`Rough size ~${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB (source bitrate)`);
  }

  return { ok: !issues.some((i) => i.level === "error"), issues, summary };
}

/** Fail-fast connectivity probe with a short timeout. Null = reachable. */
export async function probeApiConnectivity(timeoutMs = 4000): Promise<string | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${API_BASE_URL}/api/transcode/jobs`, {
      signal: ctrl.signal,
    });
    if (!res.ok) return `API responded with HTTP ${res.status}.`;
    return null;
  } catch {
    return "API unreachable — is the backend running on " + API_BASE_URL + "?";
  } finally {
    clearTimeout(timer);
  }
}
