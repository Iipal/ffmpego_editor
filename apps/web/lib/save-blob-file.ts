// Shared blob-saving service: File System Access picker with
// anchor-download fallback, plus download-URL fetching with API error
// shaping. Deduped from cut / subtitles / mobile / bulk export flows (were
// 4 copies). Editors go through the `saveBlobFile` singleton below instead
// of touching the picker / object URLs directly.
import { transcodeJobs } from "./transcode-jobs";

/** File-picker accept entries (`showSaveFilePicker` `types` option). */
export type SavePickerTypes = Array<{
  description?: string;
  accept: Record<string, string[]>;
}>;

/**
 * Singleton service owning every blob save: the save-picker path, the
 * anchor-download fallback, picker accept entries per output extension, and
 * fetching transcode download URLs into Blobs. All picker quirks live here
 * (never scattered across export flows), so cancellation and fallback
 * behave identically for every editor.
 */
class SaveBlobFile {
  /** Delay before revoking the fallback anchor's object URL. */
  private static readonly ANCHOR_REVOKE_MS = 5000;
  /** Fallback accept entry when no picker types are given (legacy default). */
  private static readonly DEFAULT_TYPES: SavePickerTypes = [
    { description: "MP4 video", accept: { "video/mp4": [".mp4"] } },
  ];
  /** Known output extensions mapped to picker description + MIME. */
  private static readonly PICKER_TYPES_BY_EXT: Record<
    string,
    { description: string; mime: string }
  > = {
    mp4: { description: "MP4 video", mime: "video/mp4" },
    webm: { description: "WebM video", mime: "video/webm" },
    mov: { description: "QuickTime video", mime: "video/quicktime" },
    mkv: { description: "Matroska video", mime: "video/x-matroska" },
    gif: { description: "GIF image", mime: "image/gif" },
    mp3: { description: "MP3 audio", mime: "audio/mpeg" },
    wav: { description: "WAV audio", mime: "audio/wav" },
  };

  // ------------------------------------------------------------------ public

  /**
   * Save-picker accept entry for an output extension (defaults to MP4 video
   * like the legacy flows, so unknown extensions still offer a filter).
   */
  pickerTypesForExt(ext: string): SavePickerTypes {
    const lower = ext.toLowerCase();
    const known = SaveBlobFile.PICKER_TYPES_BY_EXT[lower];
    if (!known) return this.pickerTypesForExt("mp4");
    return [
      {
        description: known.description,
        accept: { [known.mime]: [`.${lower}`] },
      },
    ];
  }

  /**
   * Save a Blob and resolve with the saved filename: via the File System
   * Access picker when available, otherwise via an anchor download. A
   * user-cancelled picker propagates the AbortError so callers can dismiss
   * quietly; other picker failures fall through to the anchor fallback.
   */
  async save(
    blob: Blob,
    filename: string,
    types?: SavePickerTypes,
  ): Promise<string> {
    const viaPicker = await this.saveViaPicker(
      blob,
      filename,
      types ?? SaveBlobFile.DEFAULT_TYPES,
    );
    if (viaPicker !== null) return viaPicker;
    return this.saveViaAnchor(blob, filename);
  }

  /**
   * Fetch a transcode download URL into a Blob, with API error shaping
   * (envelope message when present, else `Download failed: <status>`).
   */
  async fetchDownload(downloadUrl: string): Promise<Blob> {
    const res = await fetch(downloadUrl);
    if (!res.ok) {
      const payload = (await res.json().catch(() => null)) as unknown;
      throw new Error(
        transcodeJobs.serverErrorMessage(payload) ??
          `Download failed: ${res.status}`,
      );
    }
    return res.blob();
  }

  // ----------------------------------------------------------------- private

  /**
   * Picker path: resolve with the picked handle name, or null when the
   * picker is unsupported (or failed non-fatally) so `save` falls back to
   * the anchor download. User cancellation rethrows the AbortError.
   */
  private async saveViaPicker(
    blob: Blob,
    filename: string,
    types: SavePickerTypes,
  ): Promise<string | null> {
    if (!("showSaveFilePicker" in window)) return null;
    try {
      const handle = await (
        window as unknown as {
          showSaveFilePicker: (o: {
            suggestedName?: string;
            types?: SavePickerTypes;
          }) => Promise<FileSystemFileHandle>;
        }
      ).showSaveFilePicker({ suggestedName: filename, types });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return handle.name;
    } catch (e) {
      // User cancelled the picker — propagate so callers can dismiss quietly.
      if ((e as DOMException)?.name === "AbortError") throw e;
      return null;
    }
  }

  /**
   * Anchor-download fallback: click a temporary object-URL anchor and
   * resolve with the requested filename (revoking the URL shortly after).
   */
  private saveViaAnchor(blob: Blob, filename: string): string {
    const url = URL.createObjectURL(blob);
    try {
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), SaveBlobFile.ANCHOR_REVOKE_MS);
    }
    return filename;
  }
}

/** App-wide singleton — editors save through this service. */
export const saveBlobFile = new SaveBlobFile();
