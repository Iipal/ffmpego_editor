"use client";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { exportQueue } from "@/lib/export-queue";
import {
  activeQueueCount,
  clearFinishedQueueItems,
  isQueueItemActive,
  setDockOpen,
  useExportQueueStore,
  type ExportQueueItem,
} from "@/store/exportQueueSlice";
import {
  Ban,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Loader2,
  XCircle,
} from "lucide-react";

const KIND_LABELS: Record<ExportQueueItem["kind"], string> = {
  crop: "Crop",
  mobile: "Mobile",
  subtitles: "Subtitles",
  cut: "Cut",
  bulk: "Bulk",
  "audio-extract": "Audio",
};

function statusLabel(item: ExportQueueItem): string {
  switch (item.status) {
    case "uploading":
      return `Uploading ${Math.round(item.progress)}%`;
    case "queued":
      return item.queuePosition != null
        ? `Queued #${item.queuePosition + 1}`
        : "Queued";
    case "processing":
      return `Rendering ${Math.round(item.progress)}%`;
    case "saving":
      return "Saving file";
    case "completed":
      return "Done";
    case "failed":
      return "Failed";
    case "cancelled":
      return "Cancelled";
  }
}

function StatusIcon({ item }: { item: ExportQueueItem }) {
  if (item.status === "completed")
    return <CheckCircle2 className="size-4 text-kumo-brand" />;
  if (item.status === "failed")
    return <XCircle className="size-4 text-red-500" />;
  if (item.status === "cancelled")
    return <Ban className="size-4 text-kumo-subtle" />;
  return <Loader2 className="size-4 shrink-0 animate-spin text-kumo-subtle" />;
}

function QueueItemRow({ item }: { item: ExportQueueItem }) {
  const active = !["completed", "failed", "cancelled"].includes(item.status);
  return (
    <div className="rounded-lg border border-kumo-line bg-kumo-base p-2.5">
      <div className="flex items-start gap-2">
        <StatusIcon item={item} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-xs font-medium" title={item.label}>
              {item.label}
            </span>
            <button
              type="button"
              aria-label={active ? "Cancel export" : "Dismiss"}
              className="shrink-0 rounded p-0.5 text-kumo-subtle hover:bg-kumo-recessed hover:text-foreground"
              onClick={() =>
                active
                  ? exportQueue.cancel(item.id)
                  : exportQueue.dismiss(item.id)
              }
            >
              <XCircle className="size-3.5" />
            </button>
          </div>
          <div className="flex items-center justify-between text-[11px] text-kumo-subtle">
            <span className="uppercase tracking-wide">
              {KIND_LABELS[item.kind]}
            </span>
            <span className="tabular-nums">{statusLabel(item)}</span>
          </div>
          {active && (
            <Progress
              value={item.progress}
              className="mt-1.5 h-1"
              aria-label={item.label}
            />
          )}
          {item.status === "failed" && item.error && (
            <p className="mt-1 line-clamp-3 text-[11px] whitespace-pre-wrap text-red-500">
              {item.error}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Mini export queue: a pill (bottom-right) while collapsed, expanding to a
 * per-item progress list. Cancel aborts upload/POST + DELETEs the job;
 * terminal rows can be dismissed or cleared.
 */
export function QueueDock() {
  const { items, dockOpen } = useExportQueueStore();
  const active = activeQueueCount(items);
  const finished = items.length - active;

  if (items.length === 0) return null;

  if (!dockOpen) {
    return (
      <Button
        variant="outline"
        size="sm"
        className="fixed right-4 bottom-4 z-50 gap-2 rounded-full bg-kumo-base shadow-lg"
        onClick={() => setDockOpen(true)}
        aria-label={`Export queue, ${active} active`}
      >
        <Loader2
          className={cn("size-4", active > 0 && "animate-spin text-kumo-brand")}
        />
        <span className="tabular-nums">
          {active > 0 ? `${active} exporting` : `${finished} finished`}
        </span>
      </Button>
    );
  }

  return (
    <div
      className="fixed right-4 bottom-4 z-50 w-80 rounded-xl border border-kumo-line bg-kumo-base shadow-lg"
      aria-label="Export queue"
    >
      <div className="flex items-center justify-between px-3 py-2">
        <span className="text-xs font-semibold">
          Export queue
          {active > 0 && (
            <span className="ml-1.5 text-kumo-subtle">{active} active</span>
          )}
        </span>
        <div className="flex items-center gap-1">
          {finished > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-[11px] text-kumo-subtle"
              onClick={clearFinishedQueueItems}
            >
              Clear
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="size-6"
            aria-label="Collapse queue"
            onClick={() => setDockOpen(false)}
          >
            <ChevronDown className="size-4" />
          </Button>
        </div>
      </div>
      <div className="max-h-80 space-y-2 overflow-y-auto px-3 pb-3">
        {items.map((item) => (
          <QueueItemRow key={item.id} item={item} />
        ))}
      </div>
    </div>
  );
}

/** Nav badge: spinner + active count; click opens the dock. */
export function QueueActivityBadge({ className }: { className?: string }) {
  const { items } = useExportQueueStore();
  const active = activeQueueCount(items);
  if (active === 0) return null;
  return (
    <button
      type="button"
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-kumo-subtle hover:bg-kumo-recessed",
        className,
      )}
      onClick={() => setDockOpen(true)}
      aria-label={`${active} export${active === 1 ? "" : "s"} in progress — open queue`}
    >
      <Loader2 className="size-3.5 animate-spin text-kumo-brand" />
      <span className="tabular-nums">{active}</span>
    </button>
  );
}

/**
 * Full-width nav activity strip (expanded sidebar): aggregate counts +
 * average progress; click toggles the dock (open ⇄ collapse).
 */
export function QueueActivityNav({ className }: { className?: string }) {
  const { items, dockOpen } = useExportQueueStore();
  if (items.length === 0) return null;
  const active = activeQueueCount(items);
  const failed = items.filter((i) => i.status === "failed").length;
  const finished = items.length - active;
  const avg =
    active > 0
      ? Math.round(
          items
            .filter(isQueueItemActive)
            .reduce((sum, i) => sum + i.progress, 0) / active,
        )
      : 100;
  return (
    <button
      type="button"
      className={cn(
        "inline-flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-sm font-medium transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kumo-focus",
        "text-kumo-subtle hover:bg-kumo-recessed hover:text-kumo-default",
        className,
      )}
      onClick={() => setDockOpen(!dockOpen)}
      aria-expanded={dockOpen}
      aria-label={
        active > 0
          ? `${active} export${active === 1 ? "" : "s"} in progress — ${dockOpen ? "collapse" : "expand"} queue`
          : `${finished} finished export${finished === 1 ? "" : "s"} — ${dockOpen ? "collapse" : "expand"} queue`
      }
      title={`Export queue — click to ${dockOpen ? "collapse" : "expand"}`}
    >
      {active > 0 ? (
        <Loader2 className="size-4 shrink-0 animate-spin text-kumo-brand" />
      ) : (
        <CheckCircle2 className="size-4 shrink-0 text-kumo-brand" />
      )}
      <span className="tabular-nums">
        {active > 0 ? `${active} exporting` : `${finished} finished`}
      </span>
      {failed > 0 ? (
        <span className="tabular-nums text-red-500">{failed} failed</span>
      ) : null}
      <span className="ml-auto flex items-center gap-1.5">
        {active > 0 ? (
          <Progress value={avg} className="h-1 w-12" aria-hidden />
        ) : null}
        {dockOpen ? (
          <ChevronUp className="size-3.5 shrink-0" />
        ) : (
          <ChevronDown className="size-3.5 shrink-0" />
        )}
      </span>
    </button>
  );
}
