"use client";

import { useCallback, useMemo } from "react";
import { toast } from "sonner";
import { useSelector } from "@tanstack/react-store";
import type { MobileLayout } from "@/lib/mobile-layout";
import { baseNameOf } from "./helpers";
import type { BulkItem, FsDirHandle } from "./types";
import { exportQueue } from "@/lib/export-queue";
import { validateSettings } from "@/lib/validate-settings";
import { saveBlobFile } from "@/lib/save-blob-file";
import { openComparison } from "@/store/compareSlice";
import { exportQueueStore, selectKindActive } from "@/store/exportQueueSlice";

export type UseBulkExportArgs = {
  itemsRef: { current: BulkItem[] };
  stackedLayout: MobileLayout | null;
  layoutError: string | null;
  outputDirHandle: FsDirHandle | null;
  useWatermark: boolean;
  patchItem: (id: string, patch: Partial<BulkItem>) => void;
};

/**
 * Fire-and-forget bulk export: every selected file is submitted to the
 * export queue at once and the API queue bounds ffmpeg concurrency.
 * Per-item rows mirror queue progress; results land in the chosen folder.
 */
export function useBulkExport({
  itemsRef,
  stackedLayout,
  layoutError,
  outputDirHandle,
  useWatermark,
  patchItem,
}: UseBulkExportArgs) {
  const queueItems = useSelector(exportQueueStore, (s) => s.items);
  const activeExports = useMemo(
    () => selectKindActive(queueItems, "bulk"),
    [queueItems],
  );

  const onBulkExport = useCallback(() => {
    if (!stackedLayout || layoutError) {
      toast.error(layoutError ?? "Invalid layout");
      return;
    }
    const queue = itemsRef.current.filter(
      (it) =>
        it.selected &&
        (it.status === "idle" ||
          it.status === "failed" ||
          it.status === "cancelled"),
    );
    if (queue.length === 0) {
      toast.error("Nothing to export — select files first");
      return;
    }
    const single = queue.length === 1;
    const byId = new Map(itemsRef.current.map((it) => [it.id, it] as const));
    for (const item of queue) {
      const { id, file } = item;
      const meta = byId.get(id);
      const duration = meta?.duration ?? 0;
      const sw = meta?.width || 1920;
      const sh = meta?.height || 1080;
      const base = baseNameOf(file.name);
      const outName = `${base}_mobile_1080x1920.mp4`;
      const settingsJson = JSON.stringify({
        mobileLayout: stackedLayout,
        sourceWidth: sw,
        sourceHeight: sh,
        trimRange: [0, duration > 0 ? duration : 0.001],
        ignoreTrim: true,
        ignoreTrimSettings: true,
        exportFormat: "mp4",
        exportFps: 30,
        exportFilename: base,
        exportQuality: 10,
        exportSpeed: 1,
        customFFmpegArgs: "",
        watermark: useWatermark,
        audioTracks: item.audioTracks?.length ? item.audioTracks : undefined,
      });
      // Pre-submit: same schemas the API enforces — fail before upload bytes.
      validateSettings.assertMobile(settingsJson);
      patchItem(id, { status: "uploading", progress: 0, error: null });
      exportQueue.enqueue({
        kind: "bulk",
        endpoint: "/api/transcode/mobile",
        file,
        settingsJson,
        label: outName,
        meta: "Bulk export",
        silentSuccess: true,
        silentEnqueue: true,
        onUploadProgress: (sent, total) =>
          patchItem(id, {
            progress: total ? Math.round((sent / total) * 50) : 0,
          }),
        onProgress: (info) =>
          patchItem(id, { status: info.status, progress: info.progress }),
        onError: (message) =>
          patchItem(id, {
            status: message === null ? "cancelled" : "failed",
            progress: 0,
            error: message,
          }),
        onFinish: async ({ blob }) => {
          if (outputDirHandle) {
            const fh = await outputDirHandle.getFileHandle(outName, {
              create: true,
            });
            const w = await fh.createWritable();
            await w.write(blob);
            await w.close();
          } else {
            await saveBlobFile.save(blob, outName);
          }
          patchItem(id, { status: "completed", progress: 100 });
          if (single) {
            openComparison({
              title: outName,
              sourceUrl: null,
              outputUrl: URL.createObjectURL(blob),
              outputKind: "video",
              meta: "Bulk export",
            });
          }
        },
      });
    }
    toast.info(
      `Queued ${queue.length} file${queue.length === 1 ? "" : "s"} for bulk export`,
      { id: "export-queue" },
    );
  }, [
    stackedLayout,
    layoutError,
    itemsRef,
    outputDirHandle,
    useWatermark,
    patchItem,
  ]);

  return { activeExports, onBulkExport };
}
