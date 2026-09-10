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
import { CommandHost } from "@/components/command/CommandHost";
import { ThemeProvider } from "@/providers/ThemeProvider";

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

  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>{children}</TooltipProvider>
        <CompareDialog />
        <QueueDock />
        <CommandHost />
      </QueryClientProvider>
    </ThemeProvider>
  );
}
