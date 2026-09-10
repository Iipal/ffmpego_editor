import { createStore } from "@tanstack/store";
import { useSelector } from "@tanstack/react-store";

/**
 * Editor-side export history: lightweight pointers to server jobs.
 * Survives navigation (global store + localStorage) and reloads; the
 * authoritative job rows live server-side and merge via ["admin-jobs"].
 */
export interface HistoryEntry {
  jobId: string;
  /** POST endpoint the job was submitted to (for retry). */
  endpoint: string;
  kind: "transcode" | "audio-extract";
  /** Display label (export filename or preset name). */
  label: string;
  createdAt: number;
  /** Stored verbatim for transcode retry with the current source file. */
  settingsJson?: string;
  audioFormat?: "mp3" | "wav";
}

interface HistorySlice {
  entries: HistoryEntry[];
}

const STORAGE_KEY = "ffmpeg_editor_export_history_v1";
const MAX_ENTRIES = 100;

function readStored(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e): e is HistoryEntry =>
        !!e &&
        typeof e === "object" &&
        typeof (e as HistoryEntry).jobId === "string",
    );
  } catch {
    return [];
  }
}

function persist(entries: HistoryEntry[]): void {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(entries.slice(0, MAX_ENTRIES)),
    );
  } catch {}
}

export const historyStore = createStore<HistorySlice>({ entries: [] });

/** Hydrate once on the history page (client-only; localStorage). */
export function hydrateHistoryStore(): void {
  const entries = readStored();
  if (entries.length) historyStore.setState(() => ({ entries }));
}

export function useHistoryStore() {
  return useSelector(historyStore);
}

export function trackHistoryEntry(entry: HistoryEntry): void {
  historyStore.setState((p) => {
    const entries = [
      entry,
      ...p.entries.filter((e) => e.jobId !== entry.jobId),
    ].slice(0, MAX_ENTRIES);
    persist(entries);
    return { entries };
  });
}

export function untrackHistoryEntry(jobId: string): void {
  historyStore.setState((p) => {
    const entries = p.entries.filter((e) => e.jobId !== jobId);
    persist(entries);
    return { entries };
  });
}

export function renameHistoryEntry(jobId: string, label: string): void {
  historyStore.setState((p) => {
    const entries = p.entries.map((e) =>
      e.jobId === jobId ? { ...e, label } : e,
    );
    persist(entries);
    return { entries };
  });
}
