"use client";

import { useRouter } from "next/navigation";
import {
  Captions,
  Crop,
  LayoutGrid,
  Pause,
  Play,
  Repeat,
  Scissors,
  ShieldCheck,
  SkipBack,
  SkipForward,
  Smartphone,
  StepBack,
  StepForward,
  VolumeX,
} from "lucide-react";
import { NAV_ITEMS } from "@/components/view-transition/AppNav";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import {
  clearTrim,
  seekBy,
  setTrimInToPlayhead,
  setTrimOutToPlayhead,
  stepFrame,
  toggleLoop,
  toggleMute,
  togglePlay,
} from "@/lib/playback-bus";
import { sourceStore } from "@/store/sourceSlice";
import {
  setPaletteOpen,
  usePaletteOpen,
} from "@/components/command/paletteStore";

const NAV_ICONS: Record<string, React.ReactNode> = {
  "/editor/crop": <Crop />,
  "/editor/mobile": <Smartphone />,
  "/editor/mobile/subtitles": <Captions />,
  "/editor/mobile/bulk": <LayoutGrid />,
  "/editor/cut": <Scissors />,
  "/admin": <ShieldCheck />,
};

function run(fn: () => void) {
  fn();
  setPaletteOpen(false);
}

/**
 * Global command palette (cmdk `Command.Dialog` via the Shadcn wrappers).
 * Toggle with ⌘K/Ctrl+K or `?`. Navigation mirrors `NAV_ITEMS` order and
 * the `1..6` hints match the number-row shortcuts.
 */
export function CommandPalette() {
  const open = usePaletteOpen();
  const router = useRouter();

  const go = (href: string) => {
    setPaletteOpen(false);
    router.push(href);
  };

  return (
    <CommandDialog
      open={open}
      onOpenChange={setPaletteOpen}
      title="Command palette"
      description="Jump to an editor or control playback"
    >
      <Command label="Global command menu" loop>
        <CommandInput placeholder="Type a command or search pages…" />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>

          <CommandGroup heading="Go to">
            {NAV_ITEMS.map((item, index) => (
              <CommandItem
                key={item.href}
                value={`${item.label} ${item.href} go to page`}
                keywords={[item.label, item.href]}
                onSelect={() => go(item.href)}
              >
                {NAV_ICONS[item.href]}
                <span>{item.label}</span>
                <CommandShortcut>{index + 1}</CommandShortcut>
              </CommandItem>
            ))}
          </CommandGroup>

          <CommandSeparator />

          <CommandGroup heading="Playback">
            <CommandItem
              value="play pause toggle space k"
              keywords={["play", "pause", "space"]}
              onSelect={() => run(togglePlay)}
            >
              {sourceStore.state.isPlaying ? <Pause /> : <Play />}
              <span>Play / pause</span>
              <CommandShortcut>Space or K</CommandShortcut>
            </CommandItem>
            <CommandItem
              value="seek back 10 seconds j"
              keywords={["rewind", "back", "j"]}
              onSelect={() => run(() => seekBy(-10))}
            >
              <SkipBack />
              <span>Back 10 seconds</span>
              <CommandShortcut>J</CommandShortcut>
            </CommandItem>
            <CommandItem
              value="seek forward 10 seconds l"
              keywords={["forward", "l"]}
              onSelect={() => run(() => seekBy(10))}
            >
              <SkipForward />
              <span>Forward 10 seconds</span>
              <CommandShortcut>L</CommandShortcut>
            </CommandItem>
            <CommandItem
              value="previous frame step"
              keywords={["frame", "previous", "step"]}
              onSelect={() => run(() => stepFrame(-1))}
            >
              <StepBack />
              <span>Previous frame</span>
              <CommandShortcut>,</CommandShortcut>
            </CommandItem>
            <CommandItem
              value="next frame step"
              keywords={["frame", "next", "step"]}
              onSelect={() => run(() => stepFrame(1))}
            >
              <StepForward />
              <span>Next frame</span>
              <CommandShortcut>.</CommandShortcut>
            </CommandItem>
            <CommandItem
              value="mute unmute volume m"
              keywords={["mute", "volume", "audio"]}
              onSelect={() => run(toggleMute)}
            >
              <VolumeX />
              <span>Mute / unmute</span>
              <CommandShortcut>M</CommandShortcut>
            </CommandItem>
            <CommandItem
              value="loop trim repeat"
              keywords={["loop", "repeat"]}
              onSelect={() => run(toggleLoop)}
            >
              <Repeat />
              <span>Toggle trim loop</span>
            </CommandItem>
          </CommandGroup>

          <CommandSeparator />

          <CommandGroup heading="Trim">
            <CommandItem
              value="set trim in point i"
              keywords={["trim", "in", "start"]}
              onSelect={() => run(() => void setTrimInToPlayhead())}
            >
              <span className="flex size-4 items-center justify-center font-mono text-xs font-semibold">
                I
              </span>
              <span>Set trim start to playhead</span>
              <CommandShortcut>I</CommandShortcut>
            </CommandItem>
            <CommandItem
              value="set trim out point o"
              keywords={["trim", "out", "end"]}
              onSelect={() => run(() => void setTrimOutToPlayhead())}
            >
              <span className="flex size-4 items-center justify-center font-mono text-xs font-semibold">
                O
              </span>
              <span>Set trim end to playhead</span>
              <CommandShortcut>O</CommandShortcut>
            </CommandItem>
            <CommandItem
              value="clear trim full length x"
              keywords={["trim", "clear", "reset", "full"]}
              onSelect={() => run(clearTrim)}
            >
              <span className="flex size-4 items-center justify-center font-mono text-xs font-semibold">
                X
              </span>
              <span>Reset trim to full length</span>
              <CommandShortcut>X</CommandShortcut>
            </CommandItem>
          </CommandGroup>
        </CommandList>
        <div className="flex items-center gap-3 border-t border-kumo-line px-3 py-2 text-[11px] text-kumo-subtle">
          <span>
            <kbd className="rounded border border-kumo-line px-1 font-mono">
              ←
            </kbd>{" "}
            <kbd className="rounded border border-kumo-line px-1 font-mono">
              →
            </kbd>{" "}
            ±5s
          </span>
          <span>
            <kbd className="rounded border border-kumo-line px-1 font-mono">
              ⇧
            </kbd>
            +
            <kbd className="rounded border border-kumo-line px-1 font-mono">
              ←
            </kbd>
            <kbd className="rounded border border-kumo-line px-1 font-mono">
              →
            </kbd>{" "}
            frame
          </span>
          <span className="ml-auto">
            <kbd className="rounded border border-kumo-line px-1 font-mono">
              ⌘K
            </kbd>{" "}
            toggle
          </span>
        </div>
      </Command>
    </CommandDialog>
  );
}
