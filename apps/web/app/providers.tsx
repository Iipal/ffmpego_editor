"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { VideoStoreProvider, useCreateVideoStore, usePersistTrim } from "@/store/useVideoStore";
import { TooltipProvider } from "@/components/ui/tooltip";
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

  const videoStore = useCreateVideoStore();
  usePersistTrim(videoStore);

  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <VideoStoreProvider value={{ videoStore }}>
            {children}
          </VideoStoreProvider>
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
