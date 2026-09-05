"use client";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Trash2 } from "lucide-react";
import { clamp } from "@/lib/mobile-layout";
import { cn } from "@/lib/utils";
import type { Cut } from "./types";

export function CutList({
  sorted,
  selectedId,
  duration,
  onPickCut,
  onPatchCut,
  onDeleteCut,
}: {
  sorted: Cut[];
  selectedId: string | null;
  duration: number;
  onPickCut: (cut: Cut) => void;
  onPatchCut: (id: string, next: Cut) => void;
  onDeleteCut: (id: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      {sorted.map((c, i) => (
        <div
          key={c.id}
          className={cn(
            "flex flex-wrap items-center gap-2 rounded-md border p-2",
            c.id === selectedId
              ? "border-kumo-brand bg-kumo-brand/4"
              : "border-kumo-hairline bg-kumo-recessed",
          )}
        >
          <button
            type="button"
            onClick={() => onPickCut(c)}
            className="text-xs font-semibold hover:underline"
          >
            C{i + 1}
          </button>
          <Label className="font-mono text-[10px] text-kumo-subtle">
            start
          </Label>
          <Input
            type="number"
            step={0.05}
            min={0}
            max={duration}
            value={c.start}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (!Number.isFinite(v)) return;
              onPatchCut(c.id, {
                ...c,
                start: clamp(v, 0, c.end - 0.2),
              });
            }}
            className="h-7 w-24 font-mono text-xs tabular-nums"
          />
          <Label className="font-mono text-[10px] text-kumo-subtle">end</Label>
          <Input
            type="number"
            step={0.05}
            min={0}
            max={duration}
            value={c.end}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (!Number.isFinite(v)) return;
              onPatchCut(c.id, {
                ...c,
                end: clamp(v, c.start + 0.2, duration),
              });
            }}
            className="h-7 w-24 font-mono text-xs tabular-nums"
          />
          <span className="font-mono text-[11px] tabular-nums text-kumo-subtle">
            {(c.end - c.start).toFixed(2)}s
          </span>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onPickCut(c)}
            className="h-6 px-2 text-xs"
          >
            Preview
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onDeleteCut(c.id)}
            className="h-6 px-2 text-xs"
            aria-label={`Delete cut ${i + 1}`}
          >
            <Trash2 className="size-3" aria-hidden />
          </Button>
        </div>
      ))}
    </div>
  );
}
