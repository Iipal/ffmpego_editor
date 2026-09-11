// Retry/compare/rename service over the persisted export history.
//
// Entries in `exportHistorySlice` link a server job (or a local-only
// audio-extract record) to the stored `settingsJson`/label. Editors go through
// the `exportHistory` singleton below to re-submit stored settings with the
// current source file, re-pull a render into the side-by-side comparison, or
// rename a job server-side. Compare opening stays best-effort (advisory), so
// failures there never reject.
import { apiClient, type TranscodeResponse } from "./api-client";
import { saveBlobFile } from "./save-blob-file";
import { openComparison } from "@/store/compareSlice";
import { uploadChunked } from "./upload-chunked";
import { sourceStore } from "@/store/sourceSlice";
import { videoFileService } from "./video-file";
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
      const blob = await saveBlobFile.fetchDownload(
        apiClient.url(`/api/transcode/download/${jobId}`),
      );
      this.openBlobComparison(blob, title, meta ?? null);
    } catch {
      // Compare is advisory — the save toast already confirmed success.
    }
  }

  /**
   * Best-effort: pull an alternate output by opaque file id
   * (`GET /api/files/:id/download` — the first web caller; job downloads
   * use the job-scoped endpoint above) and open the side-by-side
   * comparison against the current source. Never rejects (advisory).
   */
  async openFileComparison(
    fileId: string,
    title: string,
    meta?: string | null,
  ): Promise<void> {
    try {
      const blob = await saveBlobFile.fetchDownload(
        apiClient.url(`/api/files/${fileId}/download`),
      );
      this.openBlobComparison(blob, title, meta ?? null);
    } catch {
      // Compare is advisory — the row stays put on failure.
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
    // Large files reuse the shared chunked session (uploaded once for
    // analysis/preview); small files keep the direct FormData path.
    const blob = await uploadChunked.postBlob(
      `/api/audio/extract?format=${audioFormat}`,
      file,
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
   * Push fetched output bytes into the global side-by-side comparison
   * dialog (source = current media, output = blob object URL).
   */
  private openBlobComparison(
    blob: Blob,
    title: string,
    meta: string | null,
  ): void {
    openComparison({
      title,
      sourceUrl: sourceStore.state.mediaUrl,
      outputUrl: URL.createObjectURL(blob),
      outputKind: videoFileService.outputKindForName(title),
      meta,
    });
  }

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
    return uploadChunked.submitWithUpload<TranscodeResponse>(endpoint, {
      file,
      buildForm: (includeFile) => {
        const form = new FormData();
        if (includeFile) form.append("file", file);
        form.append("settings", settingsJson);
        if (extra)
          for (const [k, v] of Object.entries(extra)) form.append(k, v);
        return form;
      },
    });
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
}

/** App-wide singleton — history actions go through this service. */
export const exportHistory = new ExportHistory();
