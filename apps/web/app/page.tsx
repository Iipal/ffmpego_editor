"use client";

import { Toaster } from "@/components/ui/sonner";
import { VideoUploader } from "@/components/editor/VideoUploader";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import TabSwitcher from "@/components/editor/TabSwitcher";
import { useVideoState } from "@/store/useVideoStore";
import { useState } from "react";
import PageEditorCrop from "./pageEditorCrop";
import PageEditorMobile from "./pageEditorMobile";
import PageEditorSubtitles from "./pageEditorSubtitles";

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
  {
    id: "subtitles" as const,
    label: "Subtitles",
    icon: (
      <svg
        className="w-4 h-4"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <rect x="2" y="4" width="20" height="16" rx="2" />
        <line x1="6" y1="10" x2="18" y2="10" />
        <line x1="8" y1="14" x2="16" y2="14" />
      </svg>
    ),
  },
] as const;

type EditorTab = (typeof TABS)[number]["id"];
export default function Home() {
  const { file } = useVideoState();
  const [tab, setTab] = useState<EditorTab>("crop");

  return (
    <main className="min-h-screen bg-kumo-canvas px-4 py-8 sm:px-8">
      <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-6">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-kumo-line bg-kumo-base -mx-4 -mt-8 px-4 py-4 sm:-mx-8 sm:px-8 mb-2 shadow-sm">
          <div className="flex flex-wrap items-center gap-6">
            <div className="flex flex-col gap-1">
              <h1 className="font-sans text-2xl font-semibold tracking-normal text-kumo-strong" style={{ letterSpacing: 0 }}>FFmpeg Editor</h1>
              <p className="text-sm text-kumo-subtle leading-normal">
                Trim, crop, and export local video files.
              </p>
            </div>
            <TabSwitcher
              tabs={TABS}
              activeTab={tab}
              onTabChange={(t) => setTab(t as EditorTab)}
            />
          </div>
          <ThemeToggle />
        </header>

        {tab === "crop" ? (
          file ? (
            <PageEditorCrop />
          ) : (
            <VideoUploader />
          )
        ) : tab === "mobile" ? (
          <PageEditorMobile />
        ) : (
          <PageEditorSubtitles />
        )}
      </div>
      <Toaster />
    </main>
  );
}
