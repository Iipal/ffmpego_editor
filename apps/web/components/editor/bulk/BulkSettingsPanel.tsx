"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Film, FolderInput, FolderOutput, RefreshCw } from "lucide-react";

export type BulkSettingsPanelProps = {
  inputFolderName: string | null;
  total: number;
  outputDirName: string | null;
  useWatermark: boolean;
  splitLabel: string;
  layoutError: string | null;
  activeExports: number;
  selectedCount: number;
  onPickInput: () => void;
  onPickOutput: () => void;
  onWatermarkChange: (v: boolean) => void;
  onSync: () => void;
  onBulkExport: () => void;
};

export function BulkSettingsPanel({
  inputFolderName,
  total,
  outputDirName,
  useWatermark,
  splitLabel,
  layoutError,
  activeExports,
  selectedCount,
  onPickInput,
  onPickOutput,
  onWatermarkChange,
  onSync,
  onBulkExport,
}: BulkSettingsPanelProps) {
  return (
    <Card>
      <CardHeader className="py-3">
        <CardTitle className="text-sm font-semibold tracking-normal">
          Bulk settings
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 flex-col gap-0.5">
            <Label className="text-xs">Input folder</Label>
            <span className="truncate font-mono text-[11px] tabular-nums text-kumo-subtle">
              {inputFolderName ?? "—"} · {total} files
            </span>
          </div>
          <Button
            size="sm"
            variant="secondary"
            onClick={onPickInput}
            className="h-7 shrink-0 rounded-md text-xs"
          >
            <FolderInput className="size-3.5" aria-hidden />
            Change
          </Button>
        </div>
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 flex-col gap-0.5">
            <Label className="text-xs">Output folder</Label>
            <span className="truncate font-mono text-[11px] tabular-nums text-kumo-subtle">
              {outputDirName ?? "Downloads (fallback)"}
            </span>
          </div>
          <Button
            size="sm"
            variant="secondary"
            onClick={onPickOutput}
            className="h-7 shrink-0 rounded-md text-xs"
          >
            <FolderOutput className="size-3.5" aria-hidden />
            Change
          </Button>
        </div>
        <div className="flex items-center justify-between">
          <Label className="text-xs">Use watermark</Label>
          <Switch
            checked={useWatermark}
            onCheckedChange={onWatermarkChange}
          />
        </div>
        <div className="flex items-center justify-between gap-2">
          <div className="flex flex-col gap-0.5">
            <Label className="text-xs">Zones · Stacked {splitLabel}%</Label>
            <span className="font-mono text-[11px] tabular-nums text-kumo-subtle">
              from Mobile editor
            </span>
          </div>
          <Button
            size="sm"
            variant="secondary"
            onClick={onSync}
            className="h-7 shrink-0 rounded-md text-xs"
          >
            <RefreshCw className="size-3.5" aria-hidden />
            Sync zones
          </Button>
        </div>
        {layoutError ? (
          <p className="text-xs text-kumo-warn">{layoutError}</p>
        ) : null}
        <Button
          className="w-full"
          onClick={onBulkExport}
          disabled={selectedCount === 0 || !!layoutError}
        >
          <Film className="size-3.5" aria-hidden />
          {activeExports > 0
            ? `Bulk Export (${selectedCount}) · ${activeExports} running`
            : `Bulk Export (${selectedCount})`}
        </Button>
        <p className="text-[10px] leading-3 text-kumo-subtle">
          Selected files are submitted to the export queue at once (renders
          run via the API queue), full length (trim ignored), 1080×1920. Each
          finished file saves to the output folder automatically.
        </p>
      </CardContent>
    </Card>
  );
}
