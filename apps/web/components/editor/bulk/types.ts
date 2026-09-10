export type BulkStatus =
  | "idle"
  | "queued"
  | "uploading"
  | "processing"
  | "saving"
  | "completed"
  | "failed"
  | "cancelled";

import type { AudioTrackRenderSettings } from "@/store/audioSlice";

export interface BulkItem {
  id: string;
  file: File;
  url: string;
  name: string;
  baseName: string;
  size: number;
  duration: number;
  width: number;
  height: number;
  selected: boolean;
  status: BulkStatus;
  progress: number;
  error: string | null;
  /**
   * Per-video export audio selection (undefined = server default, all
   * tracks). Set from the BulkExpandedView track picker; forwarded as
   * `audioTracks[]` by useBulkExport.
   */
  audioTracks?: AudioTrackRenderSettings[];
}

// Minimal File System Access API typings (lib.dom may not include them)
export interface FsWritable {
  write: (data: Blob) => Promise<void>;
  close: () => Promise<void>;
}

export interface FsFileHandle {
  createWritable: () => Promise<FsWritable>;
}

export interface FsDirHandle {
  getFileHandle: (
    name: string,
    opts?: { create?: boolean },
  ) => Promise<FsFileHandle>;
}
