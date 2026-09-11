"use client";

import type { useCropExport } from "./useCropExport";

/** Preflight summary: ok lines + blocking warnings. */
export function SidebarPreflightSummary({
  preflightResult,
}: {
  preflightResult: ReturnType<typeof useCropExport>["preflightResult"];
}) {
  return (
    <div className="space-y-1 text-[11px] leading-4" aria-live="polite">
      {preflightResult.summary.map((line) => (
        <p key={line} className="text-kumo-subtle">
          {line}
        </p>
      ))}
      {preflightResult.issues.map((issue) => (
        <p
          key={issue.message}
          className={
            issue.level === "error"
              ? "text-red-600"
              : "text-amber-600 dark:text-amber-400"
          }
        >
          {issue.level === "error" ? "Blocked: " : "Note: "}
          {issue.message}
        </p>
      ))}
    </div>
  );
}
