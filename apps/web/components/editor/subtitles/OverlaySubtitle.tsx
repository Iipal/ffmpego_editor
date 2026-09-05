"use client";

import { memo, useCallback, useMemo } from "react";
import { clamp } from "@/lib/mobile-layout";
import { cn } from "@/lib/utils";
import { renderSubtitleStyle } from "./subtitle-helpers";
import type { OverlaySubtitleProps } from "./types";

export const OverlaySubtitle = memo(function OverlaySubtitle({
  sub,
  isSelected,
  onSelect,
}: OverlaySubtitleProps) {
  const style = useMemo(() => renderSubtitleStyle(sub.style), [sub.style]);
  const handleClick = useCallback(() => onSelect(sub.id), [onSelect, sub.id]);
  return (
    <div
      onClick={handleClick}
      className={cn(
        "absolute pointer-events-auto cursor-pointer select-none max-w-[90%] text-center leading-tight",
        isSelected && "ring-1 ring-dashed ring-blue-500 rounded",
      )}
      style={{
        left: `${clamp(sub.position.x, 0, 100)}%`,
        top: `${clamp(sub.position.y, 0, 100)}%`,
        transform: "translate(-50%, -50%)",
      }}
      aria-label={`Subtitle ${sub.text}`}
    >
      <span style={{ ...style, display: "inline-block" }}>
        {sub.text || "New subtitle"}
      </span>
    </div>
  );
});
