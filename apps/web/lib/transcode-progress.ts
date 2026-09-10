// Shared SSE transcode-progress plumbing.
// Deduped from cut / mobile / subtitles / bulk export flows.
//
// Two entry points on the `transcodeProgress` singleton below:
// - `subscribe` — push-style; the export queue drives the store directly (no
//   blocked page), so it owns the EventSource lifecycle.
// - `awaitCompletion` — legacy await-style built on top of the subscriber so
//   error handling (log tails, cancel, reconnect) stays in one place.
//
// B2 wiring: the server emits `queued` (with queuePosition) before
// `processing`, and `cancelled` on cooperative cancel. Failures carry
// `logTail` (last ffmpeg stderr lines) which is appended to the rejection
// so toasts/store show an actionable error instead of a bare message.

import { TranscodeCancelledError, transcodeJobs } from "./transcode-jobs";

export type TranscodeProgressEvent = {
  status: string;
  progress: number;
  error?: string;
  logTail?: string | null;
  queuePosition?: number | null;
};

export type TranscodeProgressInfo = {
  status: string;
  queuePosition?: number | null;
};

export type SubscribeHandlers = {
  onProgress?: (progress: number, info: TranscodeProgressInfo) => void;
  onCompleted?: () => void;
  onFailed?: (message: string) => void;
  onCancelled?: (message: string) => void;
  /** Terminal transport failure after reconnect attempts were exhausted. */
  onConnectionLost?: (message: string) => void;
};

/**
 * Singleton service owning every SSE progress subscription: EventSource
 * lifecycle, reconnect backoff, and status fan-out (queued/processing/
 * completed/failed/cancelled). Per-subscription mutable state lives in the
 * `subscribe` closure (never on the singleton), so concurrent exports each
 * get an independent stream; only the reconnect schedule is shared config.
 */
export class TranscodeProgress {
  /** Reconnect delays before reporting the stream as lost (server can flap). */
  private static readonly RECONNECT_DELAYS_MS = [2000, 2000, 2000];

  // ------------------------------------------------------------------ public

  /**
   * Open an EventSource for `progressUrl` and dispatch decoded events to
   * `handlers`. Returns a disposer that closes the source; handlers are not
   * called afterwards. Retries the connection a few times (the server can be
   * briefly unreachable while jobs rotate) before reporting connection lost.
   */
  subscribe(progressUrl: string, handlers: SubscribeHandlers): () => void {
    let disposed = false;
    let source: EventSource | null = null;
    let retry = 0;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let completed = false;

    const dispose = () => {
      if (disposed) return;
      disposed = true;
      if (retryTimer !== null) clearTimeout(retryTimer);
      source?.close();
    };

    const open = () => {
      if (disposed) return;
      source = new EventSource(progressUrl);
      source.onmessage = (event) => {
        try {
          const p = JSON.parse(event.data) as TranscodeProgressEvent;
          if (p.status === "processing" || p.status === "queued") {
            retry = 0;
            handlers.onProgress?.(p.progress, {
              status: p.status,
              queuePosition: p.queuePosition ?? null,
            });
          }
          if (p.status === "completed") {
            completed = true;
            dispose();
            handlers.onCompleted?.();
          }
          if (p.status === "failed") {
            dispose();
            handlers.onFailed?.(transcodeJobs.withLogTail(p.error, p.logTail));
          }
          if (p.status === "cancelled") {
            dispose();
            handlers.onCancelled?.(p.error ?? "Export cancelled.");
          }
        } catch {}
      };
      source.onerror = () => {
        source?.close();
        source = null;
        if (disposed || completed) return;
        if (retry < TranscodeProgress.RECONNECT_DELAYS_MS.length) {
          const delay = TranscodeProgress.RECONNECT_DELAYS_MS[retry];
          retry += 1;
          retryTimer = setTimeout(open, delay);
          return;
        }
        dispose();
        handlers.onConnectionLost?.("Lost connection to export progress");
      };
    };

    open();
    return dispose;
  }

  /**
   * Legacy await-style wrapper over `subscribe`: resolves on completion,
   * rejects with the log-tailed message (or a cancel error) otherwise. Kept
   * for admin-style one-shot waits; the export queue prefers `subscribe`.
   */
  awaitCompletion(
    progressUrl: string,
    onProgress?: (progress: number, info?: TranscodeProgressInfo) => void,
  ): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const dispose = this.subscribe(progressUrl, {
        onProgress: (progress, info) => onProgress?.(progress, info),
        onCompleted: resolve,
        onFailed: (message) => reject(new Error(message)),
        onCancelled: (message) => reject(new TranscodeCancelledError(message)),
        onConnectionLost: (message) => reject(new Error(message)),
      });
      // The handlers always settle the promise; the disposer only matters if
      // the caller loses interest (not tracked here, unlike the queue engine).
      void dispose;
    });
  }
}

/** App-wide singleton — the export queue subscribes through this service. */
export const transcodeProgress = new TranscodeProgress();
