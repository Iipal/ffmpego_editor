"use client";

import dynamic from "next/dynamic";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  hydrateSourceStore,
  subscribeToTrimPersistence,
} from "@/store/sourceSlice";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useGlobalShortcuts } from "@/components/command/useGlobalShortcuts";

// Global overlays stay out of the initial bundle: both render null until a
// store entry opens them, so they load via dynamic() + idle preload below
// (same intent-preload pattern as lib/heavy.ts preloadUploadChunked).
const DynamicCompareDialog = dynamic(
  () =>
    import("@/components/export/CompareDialog").then((m) => ({
      default: m.CompareDialog,
    })),
  { ssr: false },
);
const DynamicQueueDock = dynamic(
  () =>
    import("@/components/export/QueueDock").then((m) => ({
      default: m.QueueDock,
    })),
  { ssr: false },
);

/** Idle-warm the overlay chunks so first open never waits on network. */
function preloadExportOverlays() {
  if (typeof window === "undefined") return;
  void import("@/components/export/CompareDialog");
  void import("@/components/export/QueueDock");
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 5 * 1000,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  useEffect(() => {
    hydrateSourceStore();
    const schedule =
      typeof window !== "undefined" && "requestIdleCallback" in window
        ? (cb: () => void) =>
            (
              window as unknown as {
                requestIdleCallback: (cb: () => void) => number;
              }
            ).requestIdleCallback(cb)
        : (cb: () => void) => setTimeout(cb, 1);
    schedule(preloadExportOverlays);
    return subscribeToTrimPersistence();
  }, []);

  useGlobalShortcuts();

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>{children}</TooltipProvider>
      <DynamicCompareDialog />
      <DynamicQueueDock />
    </QueryClientProvider>
  );
}
