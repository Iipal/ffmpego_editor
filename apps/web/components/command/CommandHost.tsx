"use client";

import { CommandPalette } from "@/components/command/CommandPalette";
import { useGlobalShortcuts } from "@/components/command/useGlobalShortcuts";

/** Mounts the ⌘K palette plus the global transport shortcut listener. */
export function CommandHost() {
  useGlobalShortcuts();
  return <CommandPalette />;
}
