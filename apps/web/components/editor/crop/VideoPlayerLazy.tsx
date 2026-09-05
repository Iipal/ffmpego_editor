"use client";

import dynamic from "next/dynamic";

export const DynamicVideoPlayer = dynamic(
  () =>
    import("@/components/editor/VideoPlayer").then((m) => ({
      default: m.VideoPlayer,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="aspect-video rounded-lg bg-kumo-recessed animate-pulse border border-kumo-hairline" />
    ),
  },
);

export function preloadPlayer() {
  void import("@/components/editor/VideoPlayer");
}
