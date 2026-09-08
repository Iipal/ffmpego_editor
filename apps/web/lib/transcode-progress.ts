// Shared SSE transcode-progress waiter.
// Deduped from cut / mobile / subtitles / bulk export hooks (were 4 copies).
//
// B2 wiring: the server emits `queued` (with queuePosition) before
// `processing`, and `cancelled` on cooperative cancel. Failures carry
// `logTail` (last ffmpeg stderr lines) which is appended to the rejection
// so toasts/store show an actionable error instead of a bare message.

import {
  TranscodeCancelledError,
  withLogTail,
} from "./transcode-jobs";

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

export function awaitTranscodeCompletion(
  progressUrl: string,
  onProgress?: (progress: number, info?: TranscodeProgressInfo) => void,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const source = new EventSource(progressUrl);
    source.onmessage = (event) => {
      try {
        const p = JSON.parse(event.data) as TranscodeProgressEvent;
        if (p.status === "processing" || p.status === "queued")
          onProgress?.(p.progress, {
            status: p.status,
            queuePosition: p.queuePosition ?? null,
          });
        if (p.status === "completed") {
          source.close();
          resolve();
        }
        if (p.status === "failed") {
          source.close();
          reject(new Error(withLogTail(p.error, p.logTail)));
        }
        if (p.status === "cancelled") {
          source.close();
          reject(new TranscodeCancelledError(p.error ?? "Export cancelled."));
        }
      } catch {}
    };
    source.onerror = () => {
      source.close();
      reject(new Error("Lost connection to export progress"));
    };
  });
}
