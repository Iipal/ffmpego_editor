// Shared blob-saving: File System Access picker with anchor-download fallback.
// Deduped from cut / subtitles / mobile / bulk export flows (were 4 copies).
import { serverErrorMessage } from "./transcode-jobs";

export type SavePickerTypes = Array<{
  description?: string;
  accept: Record<string, string[]>;
}>;

const PICKER_TYPES_BY_EXT: Record<string, { description: string; mime: string }> = {
  mp4: { description: "MP4 video", mime: "video/mp4" },
  webm: { description: "WebM video", mime: "video/webm" },
  mov: { description: "QuickTime video", mime: "video/quicktime" },
  mkv: { description: "Matroska video", mime: "video/x-matroska" },
  gif: { description: "GIF image", mime: "image/gif" },
  mp3: { description: "MP3 audio", mime: "audio/mpeg" },
  wav: { description: "WAV audio", mime: "audio/wav" },
};

// Save-picker accept entry for an output extension (defaults to MP4 video
// like the legacy flows).
export function pickerTypesForExt(ext: string): SavePickerTypes {
  const known = PICKER_TYPES_BY_EXT[ext.toLowerCase()];
  if (!known) return pickerTypesForExt("mp4");
  return [{ description: known.description, accept: { [known.mime]: [`.${ext.toLowerCase()}`] } }];
}

export async function saveBlobFile(
  blob: Blob,
  filename: string,
  types?: SavePickerTypes,
): Promise<string> {
  const mimeTypes = types ?? [
    { description: "MP4 video", accept: { "video/mp4": [".mp4"] } },
  ];
  if ("showSaveFilePicker" in window) {
    try {
      const handle = await (
        window as unknown as {
          showSaveFilePicker: (o: {
            suggestedName?: string;
            types?: SavePickerTypes;
          }) => Promise<FileSystemFileHandle>;
        }
      ).showSaveFilePicker({ suggestedName: filename, types: mimeTypes });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return handle.name;
    } catch (e) {
      // User cancelled the picker — propagate so callers can dismiss quietly.
      if ((e as DOMException)?.name === "AbortError") throw e;
    }
  }
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
  return filename;
}

// Fetch a transcode download URL into a Blob, with API error shaping.
export async function fetchDownloadBlob(downloadUrl: string): Promise<Blob> {
  const res = await fetch(downloadUrl);
  if (!res.ok) {
    const payload = (await res.json().catch(() => null)) as unknown;
    throw new Error(
      serverErrorMessage(payload) ?? `Download failed: ${res.status}`,
    );
  }
  return res.blob();
}
