"use client";

import { AppNav } from "./AppNav";
import { ThemeToggle } from "@/components/ui/ThemeToggle";

export function AppHeader() {
  return (
    <header
      // Persistent element isolation: keeps header out of page route transition snapshot
      style={{ viewTransitionName: "site-header" } as React.CSSProperties}
      className="flex flex-wrap items-center justify-between gap-4 rounded-b-lg border-b border-kumo-line bg-kumo-base -mx-4 -mt-8 px-4 py-4 sm:-mx-8 sm:px-8 mb-2 shadow-sm"
    >
      <div className="flex flex-wrap items-center gap-6">
        <div className="flex flex-col gap-1">
          <h1
            className="font-sans text-2xl font-semibold tracking-normal text-kumo-strong"
            style={{ letterSpacing: 0 } as React.CSSProperties}
          >
            FFmpeg Editor
          </h1>
          <p className="text-sm text-kumo-subtle leading-normal">
            Trim, crop, and export local video files.
          </p>
        </div>
        <AppNav />
      </div>
      <ThemeToggle />
    </header>
  );
}
