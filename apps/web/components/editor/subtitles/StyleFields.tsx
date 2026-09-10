"use client";

import type { ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

// Shared rows for the subtitle style panels. Only what repeats verbatim:
// the enable-toggle section header (Outline/Shadow/Background) and the
// labeled number input with its parse guard. Color rows stay per-panel —
// each has different fallbacks and the background one accepts rgba().

export function ToggleSection({
  title,
  enabled,
  onToggle,
  toggleLabel,
  bodyClassName,
  children,
}: {
  title: string;
  enabled: boolean;
  onToggle: (checked: boolean) => void;
  toggleLabel: string;
  bodyClassName?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-xs font-semibold">{title}</Label>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-kumo-subtle">
            {enabled ? "On" : "Off"}
          </span>
          <Switch
            checked={enabled}
            onCheckedChange={onToggle}
            aria-label={toggleLabel}
          />
        </div>
      </div>
      <div
        className={cn(
          bodyClassName,
          !enabled && "opacity-50 pointer-events-none",
        )}
      >
        {children}
      </div>
    </div>
  );
}

export function NumberField({
  id,
  label,
  value,
  onValue,
  min,
  max,
  step,
  disabled,
  ariaLabel,
  labelClassName = "text-[11px]",
  className = "space-y-1",
}: {
  id: string;
  label: string;
  value: number | string;
  onValue: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  ariaLabel?: string;
  labelClassName?: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <Label htmlFor={id} className={labelClassName}>
        {label}
      </Label>
      <Input
        id={id}
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => {
          const v = parseFloat(e.target.value);
          if (!Number.isFinite(v)) return;
          onValue(v);
        }}
        aria-label={ariaLabel ?? label}
        disabled={disabled}
      />
    </div>
  );
}
