"use client";

import { useState } from "react";
import { Keyboard } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const ROWS: Array<[string, string]> = [
  ["Space / K", "Play / pause"],
  ["J / L", "Back / forward 10s (Shift: 30s)"],
  ["← / →", "Back / forward 5s (Shift: 1 frame)"],
  [", / .", "Step 1 frame"],
  ["I / O", "Set trim start / end at playhead"],
  ["X", "Clear trim"],
  ["M", "Mute"],
  ["1 – 6", "Crop / Mobile portrait / Subtitles / Batch / Cut / Jobs"],
  ["Arrows on cuts & subtitles", "Move 0.1s (Shift: 1s)"],
  ["Arrows on zones", "Nudge zone (Shift: bigger step)"],
];

export function ShortcutsHelp() {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            aria-label="Keyboard shortcuts (?)"
            title="Keyboard shortcuts (?)"
          />
        }
      >
        <Keyboard />
      </DialogTrigger>
      <DialogContent aria-label="Keyboard shortcuts">
        <DialogTitle>Keyboard shortcuts</DialogTitle>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
          {ROWS.map(([keys, desc]) => (
            <div key={keys} className="contents">
              <dt>
                <kbd className="rounded border border-kumo-line bg-kumo-recessed px-1.5 py-0.5 font-mono text-[11px]">
                  {keys}
                </kbd>
              </dt>
              <dd className="text-kumo-subtle">{desc}</dd>
            </div>
          ))}
        </dl>
      </DialogContent>
    </Dialog>
  );
}
