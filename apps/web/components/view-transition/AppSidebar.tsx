"use client";

import { useEffect, useState } from "react";
import {
  Clapperboard,
  Command,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { AppNav } from "./AppNav";
import { setPaletteOpen } from "@/components/command/paletteStore";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "ffmpego-sidebar-collapsed:v1";
const LEGACY_STORAGE_KEY = "ffmpego-sidebar-collapsed";

export function AppSidebar() {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      const stored =
        localStorage.getItem(STORAGE_KEY) ??
        localStorage.getItem(LEGACY_STORAGE_KEY);
      if (stored !== null) {
        setCollapsed(stored === "1");
        localStorage.setItem(STORAGE_KEY, stored);
      } else if (window.innerWidth < 768) {
        setCollapsed(true);
      }
    } catch {
      // ignore storage errors (private mode, etc.)
    }
  }, []);

  const toggle = () => {
    setCollapsed((prev) => {
      try {
        localStorage.setItem(STORAGE_KEY, prev ? "0" : "1");
      } catch {
        // ignore
      }
      return !prev;
    });
  };

  return (
    <aside
      style={{ viewTransitionName: "site-sidebar" } as React.CSSProperties}
      data-collapsed={collapsed}
      className={cn(
        "sticky top-0 z-40 flex h-svh shrink-0 flex-col border-r border-kumo-line bg-kumo-base transition-[width] duration-200 ease-linear",
        collapsed ? "w-16" : "w-60",
      )}
    >
      {/* Brand */}
      <div
        className={cn(
          "flex items-center gap-2 border-b border-kumo-line px-3 py-4",
          collapsed && "justify-center px-2",
        )}
      >
        <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-kumo-brand text-white">
          <Clapperboard className="size-4" />
        </span>
        {!collapsed && (
          <span className="flex min-w-0 flex-col">
            <span className="truncate font-sans text-sm font-semibold text-kumo-strong">
              FFmpeg Editor
            </span>
            <span className="truncate text-xs text-kumo-subtle">
              Local video tools
            </span>
          </span>
        )}
      </div>

      {/* Vertical navigation */}
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-2">
        <AppNav orientation="vertical" collapsed={collapsed} />
      </div>

      {/* Command palette trigger */}
      <div className={cn("px-2 pb-1", collapsed && "flex justify-center px-2")}>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size={collapsed ? "icon" : "sm"}
                onClick={() => setPaletteOpen(true)}
                aria-label="Open command palette"
                className={cn(!collapsed && "w-full justify-between")}
              />
            }
          >
            <span className="flex items-center gap-2">
              <Command />
              {!collapsed && <span>Commands</span>}
            </span>
            {!collapsed && (
              <kbd className="rounded border border-kumo-line px-1 font-mono text-[10px] text-kumo-subtle">
                ⌘K
              </kbd>
            )}
          </TooltipTrigger>
          <TooltipContent side="right">Commands (⌘K)</TooltipContent>
        </Tooltip>
      </div>

      {/* Bottom actions: theme + collapse */}
      <div
        className={cn(
          "flex items-center gap-2 border-t border-kumo-line p-2",
          collapsed ? "flex-col justify-center" : "justify-between",
        )}
      >
        <ThemeToggle />
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon"
                onClick={toggle}
                aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                aria-expanded={!collapsed}
              />
            }
          >
            {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
          </TooltipTrigger>
          <TooltipContent side="right">
            {collapsed ? "Expand sidebar" : "Collapse to icons"}
          </TooltipContent>
        </Tooltip>
      </div>
    </aside>
  );
}
