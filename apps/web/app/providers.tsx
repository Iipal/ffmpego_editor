"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { StoreProvider, useCreateFFmpegStore } from "@/store/ffmpeg-store";

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

  const ffmpegStore = useCreateFFmpegStore();

  return (
    <QueryClientProvider client={queryClient}>
      <StoreProvider value={{ ffmpegStore }}>{children}</StoreProvider>
    </QueryClientProvider>
  );
}
