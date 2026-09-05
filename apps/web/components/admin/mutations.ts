"use client";

import type { RefObject } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { API_BASE_URL } from "@/lib/api-client";
import { JOB_ID_RE } from "./helpers";

export function useAdminMutations(
  invalidateRef: RefObject<() => void>,
) {
  const queryClient = useQueryClient();

  // async-parallel: independent invalidations could be Promise.all; here single but pattern shown
  const deleteOneMutation = useMutation({
    mutationFn: async (jobId: string) => {
      // async-cheap-condition-before-await: validate cheap sync before async fetch
      if (!JOB_ID_RE.test(jobId)) throw new Error("Invalid jobId");
      // async-defer-await: start fetch, defer res.json until success branch
      const res = await fetch(`${API_BASE_URL}/api/transcode/jobs/${jobId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(j?.error ?? `Delete failed: ${res.status}`);
      }
      return res.json() as Promise<unknown>;
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
      // Defer read: invalidate only when needed, via ref (rerender-defer-reads)
      void invalidateRef.current();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const clearAllMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${API_BASE_URL}/api/transcode/jobs`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(`Clear-all failed: ${res.status}`);
      return res.json() as Promise<{
        cleared: number;
        killed: number;
        ids: string[];
      }>;
    },
    onSuccess: (r) => {
      // async-parallel: toast + invalidate are independent — start both promptly
      const p1 = Promise.resolve(
        toast.success(
          `Cleared ${r.cleared} jobs${r.killed ? ` (${r.killed} killed)` : ""}`,
        ),
      );
      const p2 = queryClient.invalidateQueries({ queryKey: ["admin-jobs"] });
      void Promise.all([p1, p2]);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const clearPendingMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(
        `${API_BASE_URL}/api/transcode/jobs?status=processing`,
        { method: "DELETE" },
      );
      if (!res.ok) throw new Error(`Clear pending failed: ${res.status}`);
      return res.json() as Promise<{ cleared: number; killed: number }>;
    },
    onSuccess: (r) => {
      if (r.cleared === 0) toast.info("No pending jobs to clear");
      else toast.success(`Cleared ${r.cleared} pending jobs`);
      void queryClient.invalidateQueries({ queryKey: ["admin-jobs"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return { deleteOneMutation, clearAllMutation, clearPendingMutation };
}
