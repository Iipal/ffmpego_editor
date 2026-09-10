// Retry/compare/rename service over the persisted export history.
//
// Entries in `exportHistorySlice` link a server job (or a local-only
// audio-extract record) to the stored `settingsJson`/label. Editors go through
// the `exportHistory` singleton below to re-submit stored settings with the
// current source file, re-pull a render into the side-by-side comparison, or
// rename a job server-side. Compare opening stays best-effort (advisory), so
// failures there never reject.
import { apiClient, type TranscodeResponse } from "./api-client";
import { fetchDownloadBlob } from "./save-blob-file";
import { openComparison } from "@/store/compareSlice";
import { throwTranscodeHttpError } from "./transcode-jobs";
import {
  shouldUseChunked,
  uploadFileChunked,
  uploadFormWithProgress,
} from "./upload-chunked";
import { sourceStore } from "@/store/sourceSlice";
import {
  trackHistoryEntry,
  type HistoryEntry,
} from "@/store/exportHistorySlice";

/**
 * Singleton service owning every history-backed export action: job rename,
 * settings replay with the current source file, comparison re-pull, and
 * audio-extract re-run. All transport details (chunked vs direct upload,
 * envelope error shaping, history tracking) live here, so the admin
 * dashboard stays a thin caller over `exportHistory.*` methods.
 */
class ExportHistory {
  // ------------------------------------------------------------------ public

  /**
   * Rename a job server-side (`PATCH /api/transcode/jobs/:id`) and return
   * the canonical filename. Callers adopt the rename into the history store.
   */
  async renameJob(jobId: string, filename: string): Promise<string> {
    const body = await apiClient.patch<{ filename: string }>(
      `/api/transcode/jobs/${jobId}`,
      { filename },
    );
    return body.filename;
  }

  /**
   * Re-submit a failed/cancelled/completed video entry with the current
   * source file and track the new job (`"<label> (retry)"`). Rejects for
   * audio-extract entries and entries without stored settings.
   */
  async retryEntry(entry: HistoryEntry): Promise<string> {
    if (entry.kind === "audio-extract" || !entry.settingsJson) {
      throw new Error("Only video exports can be retried from history.");
    }
    const res = await this.submitWithCurrentFile(
      entry.endpoint,
      entry.settingsJson,
    );
    trackHistoryEntry({
      jobId: res.jobId,
      endpoint: entry.endpoint,
      kind: "transcode",
      label: `${entry.label} (retry)`,
      createdAt: Date.now(),
      settingsJson: entry.settingsJson,
    });
    return res.jobId;
  }

  /**
   * Best-effort: re-pull a finished render and open the side-by-side
   * comparison. Never rejects — compare is advisory, and the save toast has
   * already confirmed success by the time this runs.
   */
  async openComparison(
    jobId: string,
    title: string,
    meta?: string | null,
  ): Promise<void> {
    try {
      const blob = await fetchDownloadBlob(
        apiClient.url(`/api/transcode/download/${jobId}`),
      );
      openComparison({
        title,
        sourceUrl: sourceStore.state.mediaUrl,
        outputUrl: URL.createObjectURL(blob),
        outputKind: ExportHistory.outputKindFor(title),
        meta: meta ?? null,
      });
    } catch {
      // Compare is advisory — the save toast already confirmed success.
    }
  }

  /**
   * Re-run an audio-only pull with the current source file, track it as a
   * local-only history record, and return the output `Blob`.
   */
  async retryAudioExtract(
    audioFormat: "mp3" | "wav",
    label: string,
  ): Promise<Blob> {
    const file = this.currentFile();
    const form = new FormData();
    form.append("file", file);
    const blob = await apiClient.postBlob(
      `/api/audio/extract?format=${audioFormat}`,
      form,
    );
    trackHistoryEntry({
      jobId: `extract-${Date.now()}`,
      endpoint: "/api/audio/extract",
      kind: "audio-extract",
      label,
      createdAt: Date.now(),
      audioFormat,
    });
    return blob;
  }

  // ----------------------------------------------------------------- private

  /**
   * POST stored settings with the current source file: chunked (>256 MB,
   * reusing the sparse temp file via x-upload-id, 429s shaped for the retry
   * loop) or direct XHR form upload. Rejects when no source file is loaded.
   */
  private async submitWithCurrentFile(
    endpoint: string,
    settingsJson: string,
    extra?: Record<string, string>,
  ): Promise<TranscodeResponse> {
    const file = this.currentFile();
    if (shouldUseChunked(file)) {
      const { uploadId } = await uploadFileChunked(file);
      const form = new FormData();
      form.append("settings", settingsJson);
      if (extra) for (const [k, v] of Object.entries(extra)) form.append(k, v);
      const res = await fetch(apiClient.url(endpoint), {
        method: "POST",
        headers: { "x-upload-id": uploadId },
        body: form,
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as unknown;
        throwTranscodeHttpError(res, err);
      }
      return (await res.json()) as TranscodeResponse;
    }
    const form = new FormData();
    form.append("file", file);
    form.append("settings", settingsJson);
    if (extra) for (const [k, v] of Object.entries(extra)) form.append(k, v);
    return uploadFormWithProgress<TranscodeResponse>(endpoint, form, {});
  }

  /**
   * Current source file, or a rejection telling the user to reload it
   * (retries replay stored settings against whatever is loaded now).
   */
  private currentFile(): File {
    const file = sourceStore.state.file;
    if (!file)
      throw new Error("Load the source file again to retry this export.");
    return file;
  }

  /**
   * Compare-dialog output kind derived from the export title: image for gif,
   * audio for mp3/wav, video otherwise.
   */
  private static outputKindFor(title: string): "video" | "audio" | "image" {
    const ext = (title.split(".").pop() ?? "").toLowerCase();
    if (ext === "gif") return "image";
    if (ext === "mp3" || ext === "wav") return "audio";
    return "video";
  }
}

/** App-wide singleton — history actions go through this service. */
export const exportHistory = new ExportHistory();
