"use client";

import { memo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { HistoryEntry } from "@/store/exportHistorySlice";

type ExtractRowsProps = {
  entries: HistoryEntry[];
  onRetry: (entry: HistoryEntry) => void;
  onRename: (jobId: string, name: string) => void;
  onDelete: (jobId: string) => void;
};

/**
 * Local-only audio-extract records (no server job row — the bytes were
 * downloaded at creation). Retry re-runs the pull against the current
 * source file; rename/delete touch local history only.
 */
export const ExtractRows = memo(function ExtractRows({
  entries,
  onRetry,
  onRename,
  onDelete,
}: ExtractRowsProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  if (entries.length === 0) return null;
  return (
    <ul className="space-y-3">
      {entries.map((entry) => (
        <li
          key={entry.jobId}
          className="rounded-lg border border-kumo-line bg-kumo-base p-3 shadow-sm flex flex-col gap-2"
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold tracking-widest uppercase">
              audio · {entry.audioFormat ?? "mp3"}
            </span>
            {editingId === entry.jobId ? (
              <form
                className="flex min-w-0 flex-1 gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  onRename(entry.jobId, draftName);
                  setEditingId(null);
                }}
              >
                <Input
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  className="h-7 text-xs"
                  autoFocus
                  aria-label="Extract name"
                />
                <Button type="submit" size="xs">
                  Save
                </Button>
                <Button
                  type="button"
                  size="xs"
                  variant="ghost"
                  onClick={() => setEditingId(null)}
                >
                  Cancel
                </Button>
              </form>
            ) : (
              <span className="min-w-0 flex-1 truncate text-sm font-medium">
                {entry.label}
              </span>
            )}
            <span className="text-xs text-kumo-subtle">
              {new Date(entry.createdAt).toLocaleString()}
            </span>
          </div>
          {editingId !== entry.jobId ? (
            <div className="flex items-center gap-1.5 shrink-0">
              <Button
                variant="outline"
                size="xs"
                onClick={() => onRetry(entry)}
                title="Re-run the audio pull with the current source file"
              >
                Retry
              </Button>
              <Button
                variant="ghost"
                size="xs"
                onClick={() => {
                  setDraftName(entry.label);
                  setEditingId(entry.jobId);
                }}
              >
                Rename
              </Button>
              <Button
                variant="secondary-destructive"
                size="xs"
                onClick={() => onDelete(entry.jobId)}
              >
                Delete
              </Button>
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  );
});
