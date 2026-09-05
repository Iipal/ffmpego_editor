"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { isAcceptedVideoFile } from "@/lib/video-file";
import { validateLayout } from "@/lib/mobile-layout";
import type { MobileLayout } from "@/lib/mobile-layout";
import { baseNameOf, loadStackedLayout } from "./helpers";
import type { BulkItem, BulkStatus, FsDirHandle } from "./types";

/**
 * All synchronous bulk-editor state: file list, layout preference, folders,
 * selection, and derived counts. Export execution lives in `useBulkExport`.
 * Logic moved verbatim from `app/pageEditorMobileBulk.tsx`.
 */
export function useBulkEditorState() {
  const [items, setItems] = useState<BulkItem[]>([]);
  const [layout, setLayout] = useState<MobileLayout>(() => loadStackedLayout());
  const [useWatermark, setUseWatermark] = useState(true);
  const [inputFolderName, setInputFolderName] = useState<string | null>(null);
  const [outputDirHandle, setOutputDirHandle] = useState<FsDirHandle | null>(
    null,
  );
  const [outputDirName, setOutputDirName] = useState<string | null>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const itemsRef = useRef<BulkItem[]>([]);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  // webkitdirectory is not in React's input props — set imperatively
  useEffect(() => {
    folderInputRef.current?.setAttribute("webkitdirectory", "");
  }, []);

  // Revoke object URLs on unmount
  useEffect(() => {
    const snapshot = itemsRef;
    return () => {
      for (const it of snapshot.current) URL.revokeObjectURL(it.url);
    };
  }, []);

  const stackedLayout = layout.mode === "full" ? null : layout;
  const layoutError = stackedLayout
    ? validateLayout(stackedLayout)
    : "Open the Mobile editor and save a stacked 2-zone layout, then press Sync zones.";

  const patchItem = useCallback((id: string, patch: Partial<BulkItem>) => {
    setItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, ...patch } : it)),
    );
  }, []);

  const handleMeta = useCallback(
    (id: string, meta: { duration: number; width: number; height: number }) => {
      patchItem(id, meta);
    },
    [patchItem],
  );

  // -- folder picking --------------------------------------------------------

  const onFolderChosen = useCallback((files: FileList | File[] | null) => {
    if (!files) return;
    const list = Array.from(files);
    // Only files in the selected folder root — ignore anything from sub-folders.
    // webkitRelativePath is "<folder>/<file>" for root files vs
    // "<folder>/<sub>/.../<file>" for nested ones.
    const rootFiles = list.filter((f) => {
      const rel = (f as File & { webkitRelativePath?: string })
        .webkitRelativePath;
      if (!rel) return true;
      return rel.split("/").length === 2;
    });
    const skippedNested = list.length - rootFiles.length;
    const videos = rootFiles.filter(isAcceptedVideoFile);
    if (videos.length === 0) {
      toast.error("No supported videos in folder (MP4/WebM/MOV/MKV)");
      return;
    }
    setItems((prev) => {
      for (const it of prev) URL.revokeObjectURL(it.url);
      return videos.map((file, i) => ({
        id: `${Date.now()}-${i}`,
        file,
        url: URL.createObjectURL(file),
        name: file.name,
        baseName: baseNameOf(file.name),
        size: file.size,
        duration: 0,
        width: 0,
        height: 0,
        selected: true,
        status: "idle" as BulkStatus,
        progress: 0,
        error: null,
      }));
    });
    const first = list[0] as File & { webkitRelativePath?: string };
    const folder = first?.webkitRelativePath?.split("/")[0] || null;
    setInputFolderName(folder ?? `${videos.length} files`);
    toast.success(
      `Found ${videos.length} video${videos.length === 1 ? "" : "s"} in folder root`,
      skippedNested > 0
        ? {
            description: `Ignored ${skippedNested} file${skippedNested === 1 ? "" : "s"} from sub-folders`,
          }
        : undefined,
    );
  }, []);

  const pickInputFolder = useCallback(() => {
    folderInputRef.current?.click();
  }, []);

  const pickOutputFolder = useCallback(async () => {
    const w = window as unknown as {
      showDirectoryPicker?: (opts?: {
        mode?: string;
      }) => Promise<FsDirHandle & { name?: string }>;
    };
    if (!w.showDirectoryPicker) {
      toast.error(
        "Output folder picker not supported — files will download normally",
      );
      return;
    }
    try {
      const handle = await w.showDirectoryPicker({ mode: "readwrite" });
      setOutputDirHandle(handle);
      setOutputDirName(handle.name ?? "selected folder");
      toast.success("Output folder set — files will save there directly");
    } catch (e) {
      if ((e as DOMException)?.name !== "AbortError") {
        toast.error("Could not open output folder");
      }
    }
  }, []);

  const syncLayout = useCallback(() => {
    setLayout(loadStackedLayout());
    toast.success("Zones synced from Mobile editor");
  }, []);

  const setAllSelected = useCallback((v: boolean) => {
    setItems((prev) => prev.map((it) => ({ ...it, selected: v })));
  }, []);

  // -- derived ---------------------------------------------------------------

  const selectedCount = items.filter((it) => it.selected).length;
  const completedCount = items.filter((it) => it.status === "completed").length;
  const failedCount = items.filter((it) => it.status === "failed").length;
  const splitLabel = stackedLayout
    ? `${Math.round(stackedLayout.splitRatio * 100)} / ${Math.round((1 - stackedLayout.splitRatio) * 100)}`
    : "—";

  return {
    items,
    itemsRef,
    layout,
    stackedLayout,
    layoutError,
    splitLabel,
    useWatermark,
    setUseWatermark,
    inputFolderName,
    outputDirHandle,
    outputDirName,
    folderInputRef,
    patchItem,
    handleMeta,
    onFolderChosen,
    pickInputFolder,
    pickOutputFolder,
    syncLayout,
    setAllSelected,
    selectedCount,
    completedCount,
    failedCount,
  };
}

export type BulkEditorState = ReturnType<typeof useBulkEditorState>;
