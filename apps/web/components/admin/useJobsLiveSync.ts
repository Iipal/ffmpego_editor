"use client";

import { useEffect, useState } from "react";
import { apiClient } from "@/lib/api-client";
import { useLatest } from "./hooks";
import type { JobsResponse } from "./types";

export type LiveStatus = "connecting" | "live" | "reconnecting" | "error";

function isJobsSnapshot(value: unknown): value is JobsResponse {
  if (!value || typeof value !== "object") return false;
  const v = value as { jobs?: unknown; count?: unknown };
  return Array.isArray(v.jobs) && typeof v.count === "number";
}

/**
 * Live jobs sync — replaces interval polling of GET /api/transcode/jobs.
 *
 * Opens one EventSource to GET /api/transcode/jobs/stream and forwards each
 * snapshot to `onSnapshot` (which writes it into the TanStack Query cache via
 * setQueryData, so the UI updates without an isFetching / "updating" flash).
 * EventSource reconnects automatically on drop; `liveStatus` drives a steady
 * "Live" badge instead of flickering polling copy.
 */
export function useJobsLiveSync(
  onSnapshot: (payload: JobsResponse) => void,
): LiveStatus {
  const [status, setStatus] = useState<LiveStatus>("connecting");
  // advanced-use-latest: stable subscription, latest callback without re-subscribing
  const latestRef = useLatest(onSnapshot);

  useEffect(() => {
    let closed = false;
    let seenMessage = false;
    setStatus("connecting");
    const source = new EventSource(apiClient.url("/api/transcode/jobs/stream"));
    source.onopen = () => {
      if (!closed) setStatus(seenMessage ? "live" : "connecting");
    };
    source.onmessage = (event) => {
      try {
        const payload: unknown = JSON.parse(event.data);
        if (!isJobsSnapshot(payload)) return;
        seenMessage = true;
        latestRef.current(payload);
        if (!closed) setStatus("live");
      } catch {
        // ignore malformed frames; next 1s snapshot heals
      }
    };
    source.onerror = () => {
      if (closed) return;
      // Browser auto-reconnects (unless close() was called). If we never got
      // a valid snapshot, the backend likely predates the stream endpoint.
      setStatus(seenMessage ? "reconnecting" : "error");
    };
    return () => {
      closed = true;
      source.close();
    };
  }, [latestRef]);

  return status;
}
