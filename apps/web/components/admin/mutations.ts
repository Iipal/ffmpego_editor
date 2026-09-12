"use client";

import { queryKeys } from "@/lib/query-hooks";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { deleteJson } from "@/lib/query-hooks/http";
import { transcodeJobs } from "@/lib/transcode-jobs";
import { JOB_ID_RE } from "./helpers";

export function useAdminMutations(onMutated: () => void) {
  const queryClient = useQueryClient();

  // async-parallel: independent invalidations could be Promise.all; here single but pattern shown
  const deleteOneMutation = useMutation({
    mutationFn: async (jobId: string) => {
      // async-cheap-condition-before-await: validate cheap sync before async fetch
      if (!JOB_ID_RE.test(jobId)) throw new Error("Invalid jobId");
      return deleteJson<unknown>(`/api/transcode/jobs/${jobId}`, {
        label: "Delete failed",
      });
    },
    onSuccess: () => {
      // js-request-idle-callback: defer non-critical toast analytics to idle (keep main path fast)
      const run =
        typeof window !== "undefined" && "requestIdleCallback" in window
          ? (cb: () => void) =>
              (
                window as unknown as {
                  requestIdleCallback: (cb: () => void) => number;
                }
              ).requestIdleCallback(cb)
          : (cb: () => void) => setTimeout(cb, 0);
      run(() => toast.success("Job deleted"));
      // Defer read: invalidate only when needed (rerender-defer-reads)
      void onMutated();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const clearAllMutation = useMutation({
    mutationFn: () =>
      deleteJson<{
        cleared: number;
        killed: number;
        ids: string[];
      }>("/api/transcode/jobs", { label: "Clear-all failed" }),
    onSuccess: (r) => {
      // async-parallel: toast + invalidate are independent — start both promptly
      const p1 = Promise.resolve(
        toast.success(
          `Cleared ${r.cleared} jobs${r.killed ? ` (${r.killed} killed)` : ""}`,
        ),
      );
      const p2 = queryClient.invalidateQueries({
        queryKey: queryKeys.adminJobs,
      });
      void Promise.all([p1, p2]);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const clearPendingMutation = useMutation({
    mutationFn: () =>
      // B2: the server treats ?status=processing|pending as processing+queued,
      // so this clears both active and queued jobs.
      deleteJson<{ cleared: number; killed: number }>(
        "/api/transcode/jobs?status=processing",
        { label: "Clear pending failed" },
      ),
    onSuccess: (r) => {
      if (r.cleared === 0) toast.info("No pending jobs to clear");
      else toast.success(`Cleared ${r.cleared} pending jobs`);
      void queryClient.invalidateQueries({ queryKey: queryKeys.adminJobs });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // B2: cooperative cancel — kills ffmpeg but keeps the row + logTail + files
  // (unlike delete which removes everything).
  const cancelOneMutation = useMutation({
    mutationFn: async (jobId: string) => {
      if (!JOB_ID_RE.test(jobId)) throw new Error("Invalid jobId");
      return transcodeJobs.cancelTranscodeJob(jobId);
    },
    onSuccess: (status) => {
      toast.success(
        status === "cancelled"
          ? "Cancellation requested — job kept for inspection"
          : `Job already ${status}`,
      );
      void queryClient.invalidateQueries({ queryKey: queryKeys.adminJobs });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return {
    deleteOneMutation,
    clearAllMutation,
    clearPendingMutation,
    cancelOneMutation,
  };
}
