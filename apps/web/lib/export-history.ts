// Shared export-history actions: rename (PATCH), retry (re-submit stored
// settings with the current source file), extract retry, download helper.
import { API_BASE_URL, type TranscodeResponse } from "./api-client";
import { fetchDownloadBlob } from "./save-blob-file";
import { openComparison } from "@/store/compareSlice";
import {
  serverErrorMessage,
  throwTranscodeHttpError,
} from "./transcode-jobs";
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

export async function renameJob(jobId: string, filename: string): Promise<string> {
  const res = await fetch(`${API_BASE_URL}/api/transcode/jobs/${jobId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filename }),
  });
  if (!res.ok) {
    const j = (await res.json().catch(() => null)) as unknown;
    throw new Error(serverErrorMessage(j) ?? `Rename failed: ${res.status}`);
  }
  const body = (await res.json()) as { filename: string };
  return body.filename;
}

async function submitWithCurrentFile(
  endpoint: string,
  settingsJson: string,
  extra?: Record<string, string>,
): Promise<TranscodeResponse> {
  const file = sourceStore.state.file;
  if (!file) throw new Error("Load the source file again to retry this export.");
  if (shouldUseChunked(file)) {
    const { uploadId } = await uploadFileChunked(file);
    const form = new FormData();
    form.append("settings", settingsJson);
    if (extra) for (const [k, v] of Object.entries(extra)) form.append(k, v);
    const res = await fetch(`${API_BASE_URL}${endpoint}`, {
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

/** Re-submit a failed/cancelled/completed entry; tracks the new job. */
export async function retryHistoryEntry(entry: HistoryEntry): Promise<string> {
  if (entry.kind === "audio-extract" || !entry.settingsJson) {
    throw new Error("Only video exports can be retried from history.");
  }
  const res = await submitWithCurrentFile(entry.endpoint, entry.settingsJson);
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

/** Best-effort: re-pull the render and open the side-by-side comparison. */
export async function openJobComparison(
  jobId: string,
  title: string,
  meta?: string | null,
): Promise<void> {
  try {
    const blob = await fetchDownloadBlob(
      `${API_BASE_URL}/api/transcode/download/${jobId}`,
    );
    const url = URL.createObjectURL(blob);
    const ext = (title.split(".").pop() ?? "").toLowerCase();
    openComparison({
      title,
      sourceUrl: sourceStore.state.mediaUrl,
      outputUrl: url,
      outputKind: ext === "gif" ? "image" : ext === "mp3" || ext === "wav" ? "audio" : "video",
      meta: meta ?? null,
    });
  } catch {
    // Compare is advisory — the save toast already confirmed success.
  }
}
/** Re-run an audio-only pull with the current source file. */
export async function retryAudioExtract(
  audioFormat: "mp3" | "wav",
  label: string,
): Promise<Blob> {
  const file = sourceStore.state.file;
  if (!file) throw new Error("Load the source file again to retry this export.");
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(
    `${API_BASE_URL}/api/audio/extract?format=${audioFormat}`,
    { method: "POST", body: form },
  );
  if (!res.ok) {
    const j = (await res.json().catch(() => null)) as unknown;
    throw new Error(serverErrorMessage(j) ?? `Extract failed: ${res.status}`);
  }
  const blob = await res.blob();
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
