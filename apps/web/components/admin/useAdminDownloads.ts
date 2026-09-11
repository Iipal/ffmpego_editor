"use client";

import { useCallback } from "react";
import { toast } from "sonner";
import type { JobEntry } from "./types";
import { downloadPlan } from "./helpers";

async function downloadToPicker(
  url: string,
  label: string | undefined,
  serverName: string,
  nameSuffix: string,
  successMessage: string,
  failureMessage: string,
) {
  const [{ apiClient }, { saveBlobFile }] = await Promise.all([
    import("@/lib/api-client"),
    import("@/lib/save-blob-file"),
  ]);
  try {
    const blob = await saveBlobFile.fetchDownload(apiClient.url(url));
    const { filename, types } = downloadPlan(label, serverName, nameSuffix);
    const saved = await saveBlobFile.save(blob, filename, types);
    toast.success(successMessage, { description: saved });
  } catch (e) {
    if ((e as DOMException)?.name === "AbortError") return;
    toast.error(e instanceof Error ? e.message : failureMessage);
  }
}

/**
 * Admin download actions: primary outputs persist server-side until deleted,
 * so any completed job re-downloads straight from its row; alternate
 * outputs (webm-tg CRF-search runner-up, display-only until now) pull by
 * opaque file id with an "-alt" suffix so they can't collide with the
 * primary. Split out of `useAdminJobs`.
 */
export function useAdminDownloads() {
  // Outputs persist server-side until deleted — re-download any completed
  // job straight from the row.
  const handleDownloadOne = useCallback((job: JobEntry) => {
    void downloadToPicker(
      `/api/transcode/download/${job.jobId}`,
      job.filename,
      job.outputFile?.name || `${job.jobId}.mp4`,
      "",
      "Download saved",
      "Download failed",
    );
  }, []);

  const handleDownloadAlternateOne = useCallback((job: JobEntry) => {
    const alt = job.alternateFile;
    if (!alt) {
      toast.error("No alternate output on this job.");
      return;
    }
    void downloadToPicker(
      `/api/files/${alt.id}/download`,
      job.filename,
      alt.name,
      "-alt",
      "Alternate download saved",
      "Alternate download failed",
    );
  }, []);

  return { handleDownloadOne, handleDownloadAlternateOne };
}
