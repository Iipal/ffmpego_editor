import { queryKeys } from "@/lib/query-keys";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { uploadSessions, type UploadSession } from "@/lib/upload-sessions";

export type { UploadSession };

/**
 * Open upload sessions (`GET /api/upload/sessions`): interrupted uploads
 * still holding server bytes. Polled every 10 s so the Admin sessions card
 * shows resume progress live; each row is one cheap aggregate read.
 */
export function useUploadSessionsQuery() {
  return useQuery({
    queryKey: queryKeys.uploadSessions,
    queryFn: () => uploadSessions.listSessions(),
    refetchInterval: 10_000,
    refetchOnWindowFocus: true,
    retry: 1,
    staleTime: 8_000,
    gcTime: 60_000,
  });
}

/**
 * Abort mutation (`DELETE /api/upload/:uploadId`): releases an orphan
 * session's bytes now instead of waiting for the 6h server sweep.
 * Refcount-aware server-side — bytes a live job holds are never deleted.
 * Invalidates sessions + storage census on success.
 */
export function useAbortUploadSessionMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (uploadId: string) => uploadSessions.abortSession(uploadId),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.uploadSessions,
      });
      void queryClient.invalidateQueries({ queryKey: queryKeys.storageStats });
    },
  });
}
