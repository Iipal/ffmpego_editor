// Fire-and-forget export queue service.
//
// Editors hand an `ExportQueueTask` to `exportQueue.enqueue(...)` (upload →
// POST /transcode* → SSE → download/save) and immediately get a queue item id
// back; progress streams into the exportQueueSlice and the QueueDock while
// the UI stays interactive. The API bounds actual ffmpeg concurrency, so
// submitting several tasks at once just queues them server-side (429 +
// Retry-After is retried with backoff).
//
// Two task modes:
// - job mode (default): multipart upload (chunked >256MB, reusing the
//   sparse temp file via x-upload-id), job POST, SSE progress, download
//   by opaque job id, save via picker, side-by-side comparison.
// - direct mode (`task.run`): a custom producer returns the output Blob
//   (audio extract), skipping the job lifecycle.
//
// Cancel (`exportQueue.cancel`): abort the in-flight upload/POST, drop the
// SSE, and DELETE the server job. Cancelling before the POST lands marks the
// runner orphaned so the late job id is deleted instead of rendering.

import { apiClient, type TranscodeResponse } from "./api-client";
import { saveBlobFile } from "./save-blob-file";
import { openComparison } from "@/store/compareSlice";
import {
  exportQueueStore,
  isQueueItemActive,
  patchQueueItem,
  removeQueueItem,
  upsertQueueItem,
  type ExportQueueItem,
  type ExportQueueItemKind,
} from "@/store/exportQueueSlice";
import { trackHistoryEntry } from "@/store/exportHistorySlice";
import { sourceStore } from "@/store/sourceSlice";
import {
  TranscodeCancelledError,
  TranscodeHttpError,
  transcodeJobs,
} from "./transcode-jobs";
import { transcodeProgress } from "./transcode-progress";
import { uploadChunked } from "./upload-chunked";
import { toast } from "sonner";

export type ExportQueueProgressStatus =
  "uploading" | "queued" | "processing" | "saving";

/** Live phase snapshot forwarded to `ExportQueueTask.onProgress` mirrors. */
export interface ExportQueueProgress {
  status: ExportQueueProgressStatus;
  progress: number;
  queuePosition: number | null;
}

/** Terminal outcome handed to `ExportQueueTask.onFinish`. */
export interface ExportQueueFinish {
  jobId: string | null;
  blob: Blob;
}

/** Unit of work accepted by `ExportQueue.enqueue`. */
export interface ExportQueueTask {
  kind: ExportQueueItemKind;
  /** Output filename; doubles as the save-picker suggestion. */
  label: string;
  endpoint: string;
  file: File | null;
  settingsJson?: string;
  /** Extra multipart parts (subtitle PNGs, etc). */
  formExtras?: (fd: FormData) => void;
  /** Always send the file in the FormData (never the chunked path). */
  forceDirect?: boolean;
  onUploadProgress?: (sent: number, total: number) => void;
  /** Live status mirrors (bulk rows patch their own item card). */
  onProgress?: (info: ExportQueueProgress) => void;
  /** Called with a terminal outcome so mirrors can finalize. */
  onError?: (message: string | null) => void;
  /** Replaces the default save + comparison finisher. */
  onFinish?: (result: ExportQueueFinish) => Promise<void> | void;
  /** Direct mode producer; receives a reporter that patches the queue row. */
  run?: (report: (patch: Partial<ExportQueueItem>) => void) => Promise<Blob>;
  /** Comparison-dialog note (default finisher only). */
  meta?: string;
  /** Suppress the per-task success toast (bulk rows show state instead). */
  silentSuccess?: boolean;
  /** Suppress the per-enqueue toast (bulk submits many at once). */
  silentEnqueue?: boolean;
  /** Record a retryable history entry (default true in job mode). */
  trackHistory?: boolean;
}

/** Transport + SSE handles owned by one running task. */
interface Runner {
  abort: AbortController;
  closeSse: (() => void) | null;
  jobId: string | null;
  /** Cancelled before the job id existed — DELETE the late job. */
  orphaned: boolean;
}

/**
 * Singleton service owning every fire-and-forget export: submission retries,
 * SSE progress fan-out, saving/comparison and cancellation. All mutable
 * runner state lives here (never in the store), so `exportQueueSlice` stays
 * plain serializable data for the QueueDock UI.
 */
class ExportQueue {
  /** Attempts before a 429 (server queue full) submission is given up. */
  private static readonly MAX_SUBMIT_ATTEMPTS = 3;
  /** Fallback backoff between 429 retries when Retry-After is absent. */
  private static readonly RETRY_FALLBACK_MS = 2000;

  /** Transport/SSE handles for each running task id. */
  private readonly runners = new Map<string, Runner>();

  // ------------------------------------------------------------------ public

  /**
   * Enqueue an export and return its queue item id immediately. Creates the
   * dock row ("uploading"), toasts (unless `silentEnqueue`), and starts the
   * runner in the background; failures never propagate to the caller.
   */
  enqueue(task: ExportQueueTask): string {
    const id = `eq_${Date.now().toString(36)}_${Math.random()
      .toString(36)
      .slice(2, 8)}`;
    upsertQueueItem({
      id,
      jobId: null,
      kind: task.kind,
      label: task.label,
      endpoint: task.endpoint,
      status: "uploading",
      progress: 0,
      queuePosition: null,
      error: null,
      createdAt: Date.now(),
    });
    if (!task.silentEnqueue) {
      toast.info("Export queued", {
        description: task.label,
        id: "export-queue",
      });
    }
    const runner: Runner = {
      abort: new AbortController(),
      closeSse: null,
      jobId: null,
      orphaned: false,
    };
    this.runners.set(id, runner);
    void this.execute(id, task, runner);
    return id;
  }

  /**
   * Cooperative cancel from the dock: aborts the in-flight transport, drops
   * the SSE subscription and DELETEs the server job (or marks the runner
   * orphaned when cancelling before the job id existed). No-op for rows that
   * are already terminal or unknown.
   */
  cancel(id: string): void {
    const item = this.itemById(id);
    if (!item || !isQueueItemActive(item)) return;
    const runner = this.runners.get(id);
    if (!runner) {
      patchQueueItem(id, { status: "cancelled" });
      return;
    }
    runner.orphaned = runner.jobId === null;
    runner.abort.abort();
    runner.closeSse?.();
    if (runner.jobId) {
      void transcodeJobs.cancelTranscodeJob(runner.jobId).catch(() => {});
    }
  }

  /**
   * Dismiss a terminal row (completed/failed/cancelled) from the dock.
   * Ignored while the row is still active.
   */
  dismiss(id: string): void {
    const item = this.itemById(id);
    if (!item || isQueueItemActive(item)) return;
    removeQueueItem(id);
  }

  // ----------------------------------------------------------------- private

  /**
   * Drive one runner to a terminal state: produce the output Blob via the
   * job pipeline or the direct producer, run the finisher, and route
   * any error into the shared failure handler. Always frees the runner.
   */
  private async execute(
    id: string,
    task: ExportQueueTask,
    runner: Runner,
  ): Promise<void> {
    try {
      const blob = task.run
        ? await this.runDirect(id, task, runner)
        : await this.runJob(id, task, runner);
      if (runner.orphaned) throw new TranscodeCancelledError();
      await this.finishExport(id, task, blob, runner.jobId);
    } catch (e) {
      this.handleFailure(id, task, e);
    } finally {
      this.runners.delete(id);
    }
  }

  /**
   * Direct mode: delegate Blob production to `task.run`, handing it a
   * reporter that patches the queue row — suppressed once the runner has
   * been orphaned by a cancel.
   */
  private async runDirect(
    id: string,
    task: ExportQueueTask,
    runner: Runner,
  ): Promise<Blob> {
    return task.run!((patch) => {
      if (runner.orphaned) return;
      patchQueueItem(id, patch);
    });
  }

  /**
   * Job pipeline: upload the multipart form (429s retried with backoff),
   * track the job in history, subscribe to SSE progress (queued 50 →
   * processing 50–95) and download the finished file (saving 97).
   */
  private async runJob(
    id: string,
    task: ExportQueueTask,
    runner: Runner,
  ): Promise<Blob> {
    const signal = runner.abort.signal;
    patchQueueItem(id, { status: "uploading", progress: 0 });
    task.onProgress?.({
      status: "uploading",
      progress: 0,
      queuePosition: null,
    });

    let response: TranscodeResponse | null = null;
    for (
      let attempt = 1;
      attempt <= ExportQueue.MAX_SUBMIT_ATTEMPTS;
      attempt++
    ) {
      try {
        response = await this.submitJob(task, signal);
        break;
      } catch (e) {
        if (signal.aborted) throw new TranscodeCancelledError();
        const retryable =
          e instanceof TranscodeHttpError &&
          e.status === 429 &&
          attempt < ExportQueue.MAX_SUBMIT_ATTEMPTS;
        if (!retryable) throw e;
        await this.sleep(
          e.retryAfterMs ?? ExportQueue.RETRY_FALLBACK_MS * attempt,
          signal,
        );
      }
    }
    if (!response) throw new Error("Export submission failed.");
    if (runner.orphaned) {
      void transcodeJobs.cancelTranscodeJob(response.jobId).catch(() => {});
      throw new TranscodeCancelledError();
    }

    runner.jobId = response.jobId;
    patchQueueItem(id, {
      jobId: response.jobId,
      status: "queued",
      progress: 50,
    });
    task.onProgress?.({ status: "queued", progress: 50, queuePosition: null });
    if (task.trackHistory !== false) {
      trackHistoryEntry({
        jobId: response.jobId,
        endpoint: task.endpoint,
        kind: "transcode",
        label: task.label,
        createdAt: Date.now(),
        settingsJson: task.settingsJson,
      });
    }

    const submitted = response;
    // progressUrl is served relative ("/api/transcode/progress/:id") — resolve
    // against the API origin or EventSource would hit the Next.js dev server.
    const progressUrl = apiClient.url(submitted.progressUrl);
    await new Promise<void>((resolve, reject) => {
      runner.closeSse = transcodeProgress.subscribe(progressUrl, {
        onProgress: (p, info) => {
          const status = info.status === "queued" ? "queued" : "processing";
          const progress =
            status === "queued" ? 50 : 50 + Math.round((p / 100) * 45);
          patchQueueItem(id, {
            status,
            progress,
            queuePosition: info.queuePosition ?? null,
          });
          task.onProgress?.({
            status,
            progress,
            queuePosition: info.queuePosition ?? null,
          });
        },
        onCompleted: resolve,
        onFailed: (message) => reject(new Error(message)),
        onCancelled: () => reject(new TranscodeCancelledError()),
        onConnectionLost: (message) => reject(new Error(message)),
      });
    });

    patchQueueItem(id, { status: "saving", progress: 97 });
    task.onProgress?.({ status: "saving", progress: 97, queuePosition: null });
    return saveBlobFile.fetchDownload(
      apiClient.url(`/api/transcode/download/${response.jobId}`),
    );
  }

  /**
   * POST the job multipart form: chunked (>256 MB, reusing the sparse temp
   * file via x-upload-id) or direct XHR with upload progress. Non-2xx
   * responses are shaped into `TranscodeHttpError` (429 carries Retry-After
   * for the retry loop). The chunked body omits the file part — the server
   * resolves the input from the session header and ignores the body.
   */
  private async submitJob(
    task: ExportQueueTask,
    signal: AbortSignal,
  ): Promise<TranscodeResponse> {
    return uploadChunked.submitWithUpload<TranscodeResponse>(task.endpoint, {
      file: task.file,
      forceDirect: task.forceDirect,
      onProgress: task.onUploadProgress,
      signal,
      onResumed: (resumedBytes, total) => {
        if (total > 0) {
          const pct = Math.round((resumedBytes / total) * 100);
          toast.info(`Resumed upload from ${pct}% — skipped sent chunks`);
        }
      },
      buildForm: (includeFile) => {
        const form = new FormData();
        if (includeFile && task.file) form.append("file", task.file);
        if (task.settingsJson) form.append("settings", task.settingsJson);
        task.formExtras?.(form);
        return form;
      },
    });
  }

  /**
   * Terminal save step: run the task's custom finisher, or the default
   * save-via-picker + side-by-side comparison. Success toasts (unless
   * `silentSuccess`), row flips to completed 100. A user-cancelled picker
   * surfaces as a cancelled export, not a failure.
   */
  private async finishExport(
    id: string,
    task: ExportQueueTask,
    blob: Blob,
    jobId: string | null,
  ): Promise<void> {
    try {
      if (task.onFinish) {
        await task.onFinish({ jobId, blob });
      } else {
        const saved = await saveBlobFile.save(
          blob,
          task.label,
          saveBlobFile.pickerTypesForExt(ExportQueue.extOf(task.label)),
        );
        openComparison({
          title: saved,
          sourceUrl: sourceStore.state.mediaUrl,
          outputUrl: URL.createObjectURL(blob),
          outputKind: this.outputKindFor(task),
          meta: task.meta,
        });
      }
      if (!task.silentSuccess) {
        toast.success("Exported", {
          description: task.label,
          id: ExportQueue.itemToastId(id),
        });
      }
    } catch (e) {
      if (ExportQueue.isAbortLike(e)) {
        throw new TranscodeCancelledError("Save cancelled — file not saved.");
      }
      throw e;
    }
    patchQueueItem(id, { status: "completed", progress: 100, error: null });
  }

  /**
   * Single failure funnel: abort-like errors mark the row cancelled (toast
   * info), everything else failed (toast error) — both notify the task's
   * `onError` mirror and use a stable per-row toast id.
   */
  private handleFailure(id: string, task: ExportQueueTask, e: unknown): void {
    if (ExportQueue.isAbortLike(e)) {
      const message = e instanceof Error ? e.message : null;
      patchQueueItem(id, { status: "cancelled", error: message ?? null });
      task.onError?.(null);
      toast.info("Export cancelled", {
        description: task.label,
        id: ExportQueue.itemToastId(id),
      });
      return;
    }
    const message = e instanceof Error ? e.message : String(e);
    patchQueueItem(id, { status: "failed", error: message });
    task.onError?.(message);
    toast.error(`${task.label} export failed`, {
      description: message,
      id: ExportQueue.itemToastId(id),
    });
  }

  /**
   * Resolve after `ms`, or reject with an AbortError as soon as `signal`
   * fires — used for the 429 retry backoff.
   */
  private sleep(ms: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(resolve, ms);
      signal.addEventListener(
        "abort",
        () => {
          clearTimeout(timer);
          reject(new DOMException("Aborted", "AbortError"));
        },
        { once: true },
      );
    });
  }

  /** Look up a queue row from the store (or undefined when dismissed). */
  private itemById(id: string): ExportQueueItem | undefined {
    return exportQueueStore.state.items.find((i) => i.id === id);
  }

  /** Lowercased file extension of a task label ("" when none). */
  private static extOf(label: string): string {
    const idx = label.lastIndexOf(".");
    return idx >= 0 ? label.slice(idx + 1).toLowerCase() : "";
  }

  /**
   * Compare-dialog output kind for the default finisher: audio for
   * audio-extract and mp3/wav, image for gif, video otherwise.
   */
  private outputKindFor(task: ExportQueueTask): "video" | "audio" | "image" {
    if (task.kind === "audio-extract") return "audio";
    const ext = ExportQueue.extOf(task.label);
    if (ext === "gif") return "image";
    if (ext === "mp3" || ext === "wav") return "audio";
    return "video";
  }

  /** Stable toast id so repeated events for one row update in place. */
  private static itemToastId(id: string): string {
    return `export-queue-item-${id}`;
  }

  /** True for user-intent cancellations (save-picker abort, job cancel). */
  private static isAbortLike(e: unknown): boolean {
    return (
      e instanceof TranscodeCancelledError ||
      (e as DOMException | null)?.name === "AbortError"
    );
  }
}

/** App-wide singleton — editors enqueue through this service. */
export const exportQueue = new ExportQueue();
