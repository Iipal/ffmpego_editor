"use client";

import type { ReactNode } from "react";
import { SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

export type AreaReadout = { label: string; value: ReactNode };

export type AreaShellProps = {
  icon: ReactNode;
  title: ReactNode;
  /** Second identity line (e.g. counts · source). Kept separate from title so the title row keeps its exact classes. */
  subtitle?: ReactNode;
  badges?: ReactNode;
  actions?: ReactNode;
  readouts: AreaReadout[];
  hint?: ReactNode;
  /** Extra outer-card classes for legacy differences (e.g. `col-span-full`). */
  className?: string;
  /** Full override for legacy readout-grid differences (JobsArea is always 4-col). */
  gridClassName?: string;
};

const READOUT_GRID =
  "grid grid-cols-2 gap-px border-t border-kumo-hairline bg-kumo-hairline sm:grid-cols-4";

// Shared skeleton for the Crop/Mobile/Bulk/Subtitle/Jobs area cards.
// Every Tailwind class below is byte-identical to the originals.
export function AreaShell({
  icon,
  title,
  subtitle,
  badges,
  actions,
  readouts,
  hint,
  className,
  gridClassName,
}: AreaShellProps) {
  return (
    <div
      className={cn(
        "rounded-md border border-kumo-hairline bg-kumo-recessed",
        className,
      )}
    >
      {/* Top bar: identity + actions */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5">
        <div className="flex items-center gap-2">
          <span className="inline-flex size-7 items-center justify-center rounded-md border border-kumo-line bg-kumo-base text-kumo-subtle">
            {icon}
          </span>
          <div className="flex flex-col gap-0.5">
            <span className="flex items-center gap-2 text-xs font-semibold leading-none">
              {title}
              {badges}
            </span>
            {subtitle ? (
              <span className="text-[11px] leading-none text-kumo-subtle tabular-nums">
                {subtitle}
              </span>
            ) : null}
          </div>
        </div>

        <div className="flex items-center gap-1.5">{actions}</div>
      </div>

      {/* Readout grid */}
      <div className={gridClassName ?? READOUT_GRID}>
        {readouts.map((r) => (
          <div key={r.label} className="bg-kumo-recessed px-3 py-2">
            <div className="text-[10px] font-medium uppercase tracking-wide text-kumo-subtle">
              {r.label}
            </div>
            {r.value}
          </div>
        ))}
      </div>

      {/* Hint — operational, not decorative */}
      {hint ? (
        <div className="flex items-center gap-1.5 border-t border-kumo-hairline px-3 py-2 text-[11px] leading-none text-kumo-subtle">
          <SlidersHorizontal className="size-3 shrink-0" aria-hidden />
          {hint}
        </div>
      ) : null}
    </div>
  );
}
