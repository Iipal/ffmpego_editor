"use client";

import { useCallback, useEffect, useMemo } from "react";
import { toast } from "sonner";
import type { JobEntry } from "./types";
import { exportQueue } from "@/lib/export-queue";
import { transcodeJobs } from "@/lib/transcode-jobs";
import {
  hydrateHistoryStore,
  renameHistoryEntry,
  trackHistoryEntry,
  untrackHistoryEntry,
  useHistoryStore,
  type HistoryEntry,
} from "@/store/exportHistorySlice";

/**
 * History-linked admin actions: entries link live rows to stored
 * settingsJson (retry) and local-only audio-extract records. Split out of
 * `useAdminJobs` — the history store hydrates once here.
 */
export function useAdminHistory(invalidateJobs: () => void) {
  useEffect(() => {
    hydrateHistoryStore();
  }, []);
  const { entries } = useHistoryStore();
  const entryById = useMemo(
    () => new Map<string, HistoryEntry>(entries.map((e) => [e.jobId, e])),
    [entries],
  );
  // Local-only audio pulls have no server job row — surfaced in their own
  // section below the jobs list.
  const extractEntries = useMemo(
    () => entries.filter((e) => e.kind === "audio-extract"),
    [entries],
  );

  const handleCompareOne = useCallback((job: JobEntry) => {
    void exportQueue.openComparison(
      job.jobId,
      job.filename || job.outputFile?.name || job.jobId,
      "Admin",
    );
  }, []);

  const handleCompareAlternateOne = useCallback((job: JobEntry) => {
    const alt = job.alternateFile;
    if (!alt) {
      toast.error("No alternate output on this job.");
      return;
    }
    void exportQueue.openFileComparison(alt.id, alt.name, "Admin · alternate");
  }, []);

  const handleRetryEntry = useCallback(
    async (entry: HistoryEntry) => {
      try {
        if (entry.kind === "audio-extract" && entry.audioFormat) {
          exportQueue.retryAudioExtract(entry.audioFormat, entry.label);
          toast.success("Retry queued", { description: entry.label });
          return;
        }
        if (!entry.settingsJson) {
          toast.error("Retry unavailable — original settings were not stored.");
          return;
        }
        exportQueue.retryEntry(entry);
        toast.success("Retry queued", { description: entry.label });
        invalidateJobs();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Retry failed");
      }
    },
    [invalidateJobs],
  );

  const handleRenameOne = useCallback(
    async (jobId: string, name: string) => {
      const clean = name.trim();
      if (!clean) throw new Error("Name cannot be empty.");
      await transcodeJobs.renameJob(jobId, clean); // server PATCH
      renameHistoryEntry(jobId, clean);
      if (!entryById.has(jobId)) {
        // Adopt untracked server job so the rename sticks across navigation.
        trackHistoryEntry({
          jobId,
          endpoint: "/api/transcode",
          kind: "transcode",
          label: clean,
          createdAt: Date.now(),
        });
      }
      invalidateJobs();
    },
    [entryById, invalidateJobs],
  );

  const handleExtractRename = useCallback((jobId: string, name: string) => {
    const clean = name.trim();
    if (!clean) {
      toast.error("Name cannot be empty.");
      return;
    }
    renameHistoryEntry(jobId, clean);
    toast.success("Renamed");
  }, []);

  const handleExtractDelete = useCallback((jobId: string) => {
    untrackHistoryEntry(jobId);
    toast.success("Record removed");
  }, []);

  return {
    entryById,
    extractEntries,
    handleCompareOne,
    handleCompareAlternateOne,
    handleRetryEntry,
    handleRenameOne,
    handleExtractRename,
    handleExtractDelete,
  };
}
