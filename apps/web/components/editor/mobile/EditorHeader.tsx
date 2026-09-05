"use client";

import { Button } from "@/components/ui/button";
import { UploadOtherButton } from "./UploadOtherButton";
import { preloadUploadChunked } from "./mobile-helpers";

type EditorHeaderProps = {
  modeBadge: string;
  fileName: string;
  sourceLabel: string;
  outputLabel: string;
  validationError: string | null;
  isExporting: boolean;
  onExport: () => void;
  onReset: () => void;
};

export function EditorHeader({
  modeBadge,
  fileName,
  sourceLabel,
  outputLabel,
  validationError,
  isExporting,
  onExport,
  onReset,
}: EditorHeaderProps) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-3 border-b border-kumo-hairline pb-4">
      <div className="flex min-w-0 flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-semibold leading-none tracking-normal">
            Mobile layout
          </h2>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-kumo-hairline bg-kumo-recessed px-2 py-0.5 text-[11px] font-medium leading-none text-kumo-subtle">
            <span
              className="size-1.5 rounded-full bg-kumo-brand"
              aria-hidden
            />
            {modeBadge}
            <span aria-hidden className="opacity-40">
              ·
            </span>
            <span className="tabular-nums">non-destructive</span>
          </span>
        </div>
        <p className="flex flex-wrap items-center gap-1.5 text-xs leading-4 text-kumo-subtle">
          <span>16:9 → 9:16 · Two zones</span>
          <span aria-hidden className="text-kumo-hairline">
            ·
          </span>
          <span
            className="min-w-0 truncate font-mono text-[11px] tabular-nums text-kumo-subtle"
            title={fileName}
          >
            {fileName || "untitled"}
          </span>
          <span aria-hidden className="text-kumo-hairline">
            ·
          </span>
          <span className="tabular-nums">{sourceLabel}</span>
          <span aria-hidden className="text-kumo-hairline">
            ·
          </span>
          <span className="tabular-nums">{outputLabel}</span>
        </p>
      </div>

      <div
        className="flex shrink-0 flex-wrap items-center gap-1.5 justify-end"
        onMouseEnter={preloadUploadChunked}
        onFocus={preloadUploadChunked}
      >
        <UploadOtherButton />
        <span aria-hidden className="h-5 w-px bg-kumo-hairline mx-0.5" />
        <Button
          size="sm"
          variant="secondary"
          onClick={onReset}
          className="h-7 rounded-md text-xs"
        >
          Reset
        </Button>
        <Button
          size="sm"
          onClick={onExport}
          disabled={!!validationError || isExporting}
          className="h-7 rounded-md text-xs font-medium"
        >
          {isExporting ? "Exporting…" : "Export 9:16"}
        </Button>
      </div>
    </header>
  );
}
