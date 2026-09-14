"use client";

import { memo, useCallback, useMemo } from "react";
import { mobileLayoutService } from "@/lib/mobile-layout";
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
    <button
      type="button"
      onClick={handleClick}
      className={cn(
        "absolute pointer-events-auto cursor-pointer select-none max-w-[90%] text-center leading-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white rounded",
        isSelected && "ring-1 ring-dashed ring-blue-500 rounded",
      )}
      style={{
        left: `${mobileLayoutService.clamp(sub.position.x, 0, 100)}%`,
        top: `${mobileLayoutService.clamp(sub.position.y, 0, 100)}%`,
        transform: "translate(-50%, -50%)",
      }}
      aria-label={`Edit subtitle ${sub.text || "new subtitle"}`}
    >
      <span style={{ ...style, display: "inline-block" }}>
        {sub.text || "New subtitle"}
      </span>
    </button>
  );
});
