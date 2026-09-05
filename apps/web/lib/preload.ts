// Shared lazy-preload helpers. Deduped from admin heavy + mobile helpers
// (identical bodies) — hover/focus intent preloading of the chunked-upload chunk.

export function preloadUploadChunked() {
  if (typeof window !== "undefined") void import("@/lib/upload-chunked");
}
