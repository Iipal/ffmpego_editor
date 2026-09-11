"use client";

import { ChevronDown } from "lucide-react";
import { useSelector } from "@tanstack/react-store";
import { Card } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { readSliderValue } from "@/lib/utils";
import { cutStore, setCutState } from "@/store/cutSlice";

/** Playback-speed section (export speed lives in the Filters card). */
export function SidebarSpeedCard() {
  const playbackSpeed = useSelector(cutStore, (s) => s.playbackSpeed);

  return (
    <Card className="p-4 rounded-lg">
      <Collapsible>
        <CollapsibleTrigger className="flex w-full items-center justify-between text-xs font-semibold tracking-normal">
          Video speed <ChevronDown className="size-4 text-kumo-subtle" />
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-4 pt-3">
          <div className="space-y-3">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="playback-speed">Playback speed</Label>
                <span className="text-xs text-kumo-subtle tabular-nums">
                  {playbackSpeed.toFixed(1)}x
                </span>
              </div>
              <Slider
                id="playback-speed"
                value={[playbackSpeed]}
                min={0.1}
                max={2}
                step={0.1}
                onValueChange={(value) =>
                  setCutState((previous) => ({
                    ...previous,
                    playbackSpeed: readSliderValue(value),
                  }))
                }
                aria-label="Playback speed"
              />
            </div>
            <p className="text-[11px] leading-4 text-kumo-subtle">
              Export speed (speed ramp) lives in the Filters card below.
            </p>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
