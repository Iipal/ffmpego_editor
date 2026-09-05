// Shared SSE transcode-progress waiter.
// Deduped from cut / mobile / subtitles / bulk export hooks (were 4 copies).

export type TranscodeProgressEvent = {
  status: string;
  progress: number;
  error?: string;
};

export function awaitTranscodeCompletion(
  progressUrl: string,
  onProgress?: (progress: number) => void,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const source = new EventSource(progressUrl);
    source.onmessage = (event) => {
      try {
        const p = JSON.parse(event.data) as TranscodeProgressEvent;
        if (p.status === "processing") onProgress?.(p.progress);
        if (p.status === "completed") {
          source.close();
          resolve();
        }
        if (p.status === "failed") {
          source.close();
          reject(new Error(p.error ?? "Export failed"));
        }
      } catch {}
    };
    source.onerror = () => {
      source.close();
      reject(new Error("Lost connection to export progress"));
    };
  });
}
