"use client";

import { Toaster } from "@/components/ui/sonner";
import { VideoUploader } from "@/components/editor/VideoUploader";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import TabSwitcher from "@/components/editor/TabSwitcher";
import { useVideoState } from "@/store/useVideoStore";
import { useState } from "react";
import PageEditorCrop from "./pageEditorCrop";
import PageEditorMobile from "./pageEditorMobile";

const TABS = [
  {
    id: "crop" as const,
    label: "Crop",
    icon: (
      <svg
        className="w-4 h-4"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <line x1="9" y1="3" x2="9" y2="21" />
      </svg>
    ),
  },
  {
    id: "mobile" as const,
    label: "Mobile",
    icon: (
      <svg
        className="w-4 h-4"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <rect x="5" y="2" width="14" height="20" rx="2" />
        <line x1="9" y1="7" x2="15" y2="7" />
      </svg>
    ),
  },
] as const;

export default function Home() {
  const { file } = useVideoState();
  const [tab, setTab] = useState<"crop" | "mobile">("crop");

  return (
    <main className="min-h-screen bg-background px-4 py-8 sm:px-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <header className="flex items-center justify-between border-b border-border bg-card -mx-4 -mt-8 px-4 py-4 sm:-mx-8 sm:px-8 mb-2">
          <div>
            <h1 className="font-sans text-2xl font-semibold tracking-tight text-foreground">FFmpeg Editor</h1>
            <p className="text-sm text-muted-foreground">
              Trim, crop, and export local video files.
            </p>
          </div>
          <ThemeToggle />
        </header>
        <div className="space-y-4">
          <TabSwitcher
            tabs={TABS}
            activeTab={tab}
            onTabChange={(t) => setTab(t as "crop" | "mobile")}
          />
        </div>

        {tab === "crop" ? (
          file ? (
            <PageEditorCrop />
          ) : (
            <VideoUploader />
          )
        ) : (
          <PageEditorMobile />
        )}
      </div>
      <Toaster />
    </main>
  );
}
