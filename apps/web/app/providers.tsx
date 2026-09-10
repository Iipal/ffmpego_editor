"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  hydrateSourceStore,
  subscribeToTrimPersistence,
} from "@/store/sourceSlice";
import { TooltipProvider } from "@/components/ui/tooltip";
import { CompareDialog } from "@/components/export/CompareDialog";
import { QueueDock } from "@/components/export/QueueDock";
import { useGlobalShortcuts } from "@/components/command/useGlobalShortcuts";

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
    return subscribeToTrimPersistence();
  }, []);

  useGlobalShortcuts();

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>{children}</TooltipProvider>
      <CompareDialog />
      <QueueDock />
    </QueryClientProvider>
  );
}
