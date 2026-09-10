import { createStore } from "@tanstack/store";
import { useSelector } from "@tanstack/react-store";

/**
 * Live export-queue state: one row per in-flight/finished export task,
 * rendered by the QueueDock and the AppNav activity badge. Pure data —
 * the engine (lib/export-queue.ts) owns abort/SSE handles in module scope
 * so this slice stays serializable.
 *
 * Progress mapping shared by every producer: upload 0–50, queued 50,
 * processing 50–95, saving 97, completed 100.
 */
export type ExportQueueItemStatus =
  | "uploading"
  | "queued"
  | "processing"
  | "saving"
  | "completed"
  | "failed"
  | "cancelled";

export type ExportQueueItemKind =
  | "crop"
  | "mobile"
  | "subtitles"
  | "cut"
  | "bulk"
  | "audio-extract";

export interface ExportQueueItem {
  id: string;
  /** Server job id once the POST has been accepted; null while uploading. */
  jobId: string | null;
  kind: ExportQueueItemKind;
  /** Output filename (used as the save-picker suggestion). */
  label: string;
  /** POST endpoint the job was submitted to (for history + admin links). */
  endpoint: string;
  status: ExportQueueItemStatus;
  progress: number;
  queuePosition: number | null;
  error: string | null;
  createdAt: number;
}

interface ExportQueueSlice {
  items: ExportQueueItem[];
  dockOpen: boolean;
}

export const exportQueueStore = createStore<ExportQueueSlice>({
  items: [],
  dockOpen: false,
});

const TERMINAL: ExportQueueItemStatus[] = ["completed", "failed", "cancelled"];
const MAX_TERMINAL_ITEMS = 50;

export function isQueueItemActive(item: ExportQueueItem): boolean {
  return !TERMINAL.includes(item.status);
}

export function useExportQueueStore() {
  return useSelector(exportQueueStore);
}

export function setExportQueueState(
  updater: (prev: ExportQueueSlice) => ExportQueueSlice,
): void {
  exportQueueStore.setState(updater);
}

export function setDockOpen(open: boolean): void {
  exportQueueStore.setState((p) => ({ ...p, dockOpen: open }));
}

function trimTerminal(items: ExportQueueItem[]): ExportQueueItem[] {
  const terminal = items.filter((i) => !isQueueItemActive(i));
  if (terminal.length <= MAX_TERMINAL_ITEMS) return items;
  const cutoff = new Set(
    terminal.slice(terminal.length - MAX_TERMINAL_ITEMS).map((i) => i.id),
  );
  return items.filter((i) => isQueueItemActive(i) || cutoff.has(i.id));
}

export function upsertQueueItem(item: ExportQueueItem): void {
  exportQueueStore.setState((p) => ({
    ...p,
    items: trimTerminal([item, ...p.items.filter((i) => i.id !== item.id)]),
  }));
}

export function patchQueueItem(
  id: string,
  patch: Partial<ExportQueueItem>,
): void {
  exportQueueStore.setState((p) => ({
    ...p,
    items: p.items.map((i) => (i.id === id ? { ...i, ...patch } : i)),
  }));
}

export function removeQueueItem(id: string): void {
  exportQueueStore.setState((p) => ({
    ...p,
    items: p.items.filter((i) => i.id !== id),
  }));
}

export function clearFinishedQueueItems(): void {
  exportQueueStore.setState((p) => ({
    ...p,
    items: p.items.filter(isQueueItemActive),
  }));
}

/** Number of non-terminal rows (spinner/badge + bulk `activeExports`). */
export function activeQueueCount(items: ExportQueueItem[]): number {
  let count = 0;
  for (const item of items) {
    if (isQueueItemActive(item)) count += 1;
  }
  return count;
}

export function selectActiveCount(items: ExportQueueItem[]): number {
  return activeQueueCount(items);
}

/** Count of non-terminal rows for one editor kind (hook return value). */
export function selectKindActive(
  items: ExportQueueItem[],
  kind: ExportQueueItemKind,
): number {
  let count = 0;
  for (const item of items) {
    if (item.kind === kind && isQueueItemActive(item)) count += 1;
  }
  return count;
}
