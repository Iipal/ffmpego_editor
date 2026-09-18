import { memo } from "react";
import { Button } from "@/components/ui/button";
import { AreaShell } from "@/components/shared/AreaShell";
import { Redo2, Save, Smartphone, Undo2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MobileAreaProps } from "./types";

export const MobileArea = memo(function MobileArea({
  layout,
  modeBadge,
  outputLabel,
  validationError,
  isStale,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onSave,
}: MobileAreaProps) {
  const status = validationError ? "invalid" : isStale ? "syncing" : "ready";
  const zoneLabel =
    layout.zones.length > 0
      ? `${layout.zones.length} zone${layout.zones.length === 1 ? "" : "s"}`
      : "no zones";

  return (
    <AreaShell
      icon={<Smartphone className="size-3.5" aria-hidden />}
      title="Mobile area"
      badges={
        <>
          <span
            className={cn(
              "inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium leading-none tabular-nums",
              validationError
                ? "border-kumo-warn/30 bg-kumo-warn/10 text-kumo-warn"
                : "border-kumo-hairline bg-kumo-base text-kumo-subtle",
            )}
          >
            {modeBadge}
          </span>
          <span className="inline-flex items-center gap-1 text-[11px] font-normal">
            <span
              className={cn(
                "size-1.5 rounded-full",
                validationError
                  ? "bg-kumo-warn"
                  : isStale
                    ? "bg-kumo-warn animate-pulse"
                    : "bg-kumo-success",
              )}
              aria-hidden
            />
            <span
              className={
                validationError ? "text-kumo-warn" : "text-kumo-subtle"
              }
            >
              {status}
            </span>
          </span>
        </>
      }
      subtitle={
        <>
          {zoneLabel}
          <span aria-hidden className="mx-1 text-kumo-hairline">
            ·
          </span>
          {outputLabel}
        </>
      }
      actions={
        <>
          <Button
            size="sm"
            variant="ghost"
            onClick={onUndo}
            disabled={!canUndo}
            className="h-7 rounded-md text-xs"
            title="Undo layout change"
            aria-label="Undo layout change"
          >
            <Undo2 className="size-3.5" aria-hidden />
            Undo
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={onRedo}
            disabled={!canRedo}
            className="h-7 rounded-md text-xs"
            title="Redo layout change"
            aria-label="Redo layout change"
          >
            <Redo2 className="size-3.5" aria-hidden />
            Redo
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={onSave}
            className="h-7 gap-1.5 rounded-md text-xs"
            title="Save layout to localStorage"
            aria-label="Save layout preference"
          >
            <Save className="size-3.5" aria-hidden />
            Save
          </Button>
        </>
      }
      hint={
        layout.mode === "full" ? (
          <span>
            Full mode renders Zone 1 only · switch to Stacked for two zones
          </span>
        ) : (
          <span>
            Drag zones on the source stage · drag the preview divider to split ·
            zoom per zone card
          </span>
        )
      }
    />
  );
});
