"use client";

import { Toaster } from "@/components/ui/sonner";
import { VideoPlayer } from "@/components/editor/VideoPlayer";
import { VideoUploader } from "@/components/editor/VideoUploader";
import { Sidebar, SidebarToggle } from "@/components/editor/Sidebar";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { useVideoState } from "@/store/useVideoStore";

export default function Home() {
  const { file, isSidebarOpen } = useVideoState();

  return (
    <main className="glass-bg-animated min-h-screen px-4 py-8 sm:px-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <header className="flex items-center justify-between space-y-1">
          <div>
            <h1 className="text-2xl font-semibold">FFmpeg Editor</h1>
            <p className="text-sm text-muted-foreground">
              Trim, crop, and export local video files.
            </p>
          </div>
          <ThemeToggle />
        </header>
        {file ? (
          <div
            className={
              isSidebarOpen
                ? "grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]"
                : "space-y-2"
            }
          >
            {!isSidebarOpen && (
              <div className="flex justify-end">
                <SidebarToggle />
              </div>
            )}
            <VideoPlayer />
            {isSidebarOpen && <Sidebar />}
          </div>
        ) : (
          <VideoUploader />
        )}
      </div>
      <Toaster />
    </main>
  );
}
