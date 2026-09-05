"use client";

import type { RefObject } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { FolderInput } from "lucide-react";
import {
  EmptyStateShell,
  FootnoteDivider,
  LocalOnlyBadge,
} from "../shared/EmptyState";

export type BulkEmptyStateProps = {
  folderInputRef: RefObject<HTMLInputElement | null>;
  onFolderChosen: (files: FileList | null) => void;
  onPickInput: () => void;
};

export function BulkEmptyState({
  folderInputRef,
  onFolderChosen,
  onPickInput,
}: BulkEmptyStateProps) {
  return (
    <EmptyStateShell
      title="Mobile bulk export"
      description="Render a whole folder to 9:16 stacked two-zone portrait. Uses the zones saved in the Mobile editor, full length, one by one."
    >
      <Card className="p-6 sm:p-8">
        <CardContent className="p-0">
          <input
            ref={folderInputRef}
            type="file"
            multiple
            className="hidden"
            tabIndex={-1}
            onChange={(e) => {
              onFolderChosen(e.target.files);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            onClick={onPickInput}
            className="flex w-full cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-kumo-line bg-kumo-recessed px-6 py-12 text-center transition-colors hover:border-kumo-brand hover:bg-kumo-brand/4"
          >
            <span className="inline-flex size-10 items-center justify-center rounded-lg border border-kumo-line bg-kumo-base text-kumo-subtle">
              <FolderInput className="size-5" aria-hidden />
            </span>
            <span className="flex flex-col gap-1">
              <span className="text-sm font-medium">Select input folder</span>
              <span className="text-xs text-kumo-subtle">
                Only MP4 · WebM · MOV · MKV in the folder root — sub-folders
                ignored
              </span>
            </span>
          </button>
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-kumo-hairline pt-4 text-xs text-kumo-subtle">
            <LocalOnlyBadge />
            <FootnoteDivider />
            <span className="tabular-nums">
              Full length · ignore trim · 1080×1920
            </span>
          </div>
        </CardContent>
      </Card>
    </EmptyStateShell>
  );
}
