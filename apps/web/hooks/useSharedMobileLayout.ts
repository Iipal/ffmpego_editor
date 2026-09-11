"use client";
import { useEffect, useState, useCallback } from "react";
import { mobileLayoutService, type MobileLayout } from "@/lib/mobile-layout";

export function useSharedMobileLayout() {
  const [layout, setLayout] = useState<MobileLayout>(() => {
    try {
      return (
        mobileLayoutService.loadPref() ??
        mobileLayoutService.createDefaultLayout("stacked", 0.5)
      );
    } catch {
      return mobileLayoutService.createDefaultLayout("stacked", 0.5);
    }
  });

  const refresh = useCallback(() => {
    try {
      const loaded = mobileLayoutService.loadPref();
      if (loaded) setLayout(mobileLayoutService.normalizeLayout(loaded));
    } catch {
      console.warn("[useSharedMobileLayout] failed to reload layout pref");
    }
  }, []);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key && e.key.includes("ffmpeg-mobile-layout")) refresh();
    };
    window.addEventListener("storage", onStorage);
    // also listen to visibility change to pick up changes from same tab
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", onFocus);
    };
  }, [refresh]);

  return { layout };
}
