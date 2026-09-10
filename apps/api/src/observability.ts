/**
 * B5 observability helpers: jobId-tagged structured logs, ffmpeg version
 * probe, and tmpdir disk-space checks (quota gate + /health reporting).
 *
 * All request logging in routes should go through jobLog/systemLog so every
 * line carries a stable prefix that greps cleanly:
 *   [api] ...                    — process-level events (boot, sweep, health)
 *   [job <jobId>] ...            — per-transcode-job events
 *   [upload <uploadId>] ...      — per-upload-session events
 */

function log(prefix: string, error: boolean, args: unknown[]): void {
  (error ? console.error : console.log)(prefix, ...args);
}

export function systemLog(...args: unknown[]): void {
  log("[api]", false, args);
}

export function systemError(...args: unknown[]): void {
  log("[api]", true, args);
}

export function jobLog(jobId: string, ...args: unknown[]): void {
  log(`[job ${jobId}]`, false, args);
}

export function jobError(jobId: string, ...args: unknown[]): void {
  log(`[job ${jobId}]`, true, args);
}

export function uploadLog(uploadId: string, ...args: unknown[]): void {
  log(`[upload ${uploadId}]`, false, args);
}

let cachedFfmpegVersion: string | null | undefined;

function runCapture(cmd: string[]): string | null {
  try {
    const p = Bun.spawnSync(cmd, { stdout: "pipe", stderr: "ignore" });
    if (p.exitCode !== 0) return null;
    return new TextDecoder().decode(p.stdout).trim() || null;
  } catch {
    return null;
  }
}

/** First line of `ffmpeg -version`, cached for the process lifetime. */
export function getFfmpegVersion(): string | null {
  if (cachedFfmpegVersion !== undefined) return cachedFfmpegVersion;
  const out = runCapture(["ffmpeg", "-version"]);
  cachedFfmpegVersion = out ? out.split("\n")[0] : null;
  return cachedFfmpegVersion;
}

/**
 * Free bytes on the filesystem holding `dir` (via `df -k`).
 * Returns null when the probe fails (non-fatal — callers treat as unknown).
 */
export function getDiskFreeBytes(dir: string): number | null {
  const out = runCapture(["df", "-k", "--output=avail", dir]);
  if (!out) return null;
  const last = out.split("\n").pop()?.trim();
  const kb = last ? Number(last) : NaN;
  return Number.isFinite(kb) ? kb * 1024 : null;
}

/** Human-readable byte count for logs / API payloads. */
export function formatBytes(bytes: number): string {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let v = Math.max(0, bytes);
  let u = 0;
  while (v >= 1024 && u < units.length - 1) {
    v /= 1024;
    u += 1;
  }
  return `${v.toFixed(u === 0 ? 0 : 1)} ${units[u]}`;
}
