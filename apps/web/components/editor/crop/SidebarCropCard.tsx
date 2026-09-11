"use client";

import { ChevronDown, ZoomIn, ZoomOut } from "lucide-react";
import { useSelector } from "@tanstack/react-store";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { readSliderValue } from "@/lib/utils";
import { sourceStore } from "@/store/sourceSlice";
import { cropStore, setCropState } from "@/store/cropSlice";

/** Crop section: aspect presets, px readout, crop mode, canvas zoom. */
export function SidebarCropCard() {
  const crop = useSelector(cropStore);
  const rect = crop.crop;
  const sourceWidth = useSelector(sourceStore, (s) => s.sourceWidth);
  const sourceHeight = useSelector(sourceStore, (s) => s.sourceHeight);
  const sourceAspectRatio = useSelector(
    sourceStore,
    (s) => s.sourceAspectRatio,
  );

  const setAspectRatio = (value: typeof crop.aspectRatio) => {
    const ratioMap: Record<string, number> = {
      "1:1": 1,
      "16:9": 16 / 9,
      "21:9": 21 / 9,
    };
    const targetRatio = ratioMap[value];

    if (targetRatio === undefined) {
      setCropState((previous) => ({ ...previous, aspectRatio: value }));
      return;
    }

    const srcAspect = sourceAspectRatio > 0 ? sourceAspectRatio : 16 / 9;
    const widthPerHeight = targetRatio / srcAspect;
    // Preserve crop center while enforcing aspect. Start from current rect
    // and shrink the limiting dimension so the new rect fits inside bounds
    // and stays centered where possible — avoids drift toward origin.
    const cx = rect.x + rect.width / 2;
    const cy = rect.y + rect.height / 2;
    // Max size that fits inside 100x100 around center at desired ratio
    const maxWByH = rect.height * widthPerHeight;
    const maxHByW = rect.width / widthPerHeight;
    let h: number;
    let w: number;
    if (maxWByH <= rect.width) {
      h = rect.height;
      w = maxWByH;
    } else {
      w = rect.width;
      h = maxHByW;
    }
    // Ensure centered rect stays inside bounds; shrink if needed
    const marginX = Math.min(cx, 100 - cx);
    const marginY = Math.min(cy, 100 - cy);
    const maxWInBounds = marginX * 2;
    const maxHInBounds = marginY * 2;
    if (w > maxWInBounds) {
      w = maxWInBounds;
      h = w / widthPerHeight;
    }
    if (h > maxHInBounds) {
      h = maxHInBounds;
      w = h * widthPerHeight;
    }
    w = Math.max(5, Math.min(w, 100));
    h = Math.max(5, Math.min(h, 100));
    let x = cx - w / 2;
    let y = cy - h / 2;
    x = Math.max(0, Math.min(x, 100 - w));
    y = Math.max(0, Math.min(y, 100 - h));
    setCropState((previous) => ({
      ...previous,
      aspectRatio: value,
      crop: { x, y, width: w, height: h },
    }));
  };

  const adjustCanvasZoom = (amount: number) => {
    setCropState((previous) => ({
      ...previous,
      canvasZoom: Math.min(4, Math.max(0.25, previous.canvasZoom + amount)),
    }));
  };

  return (
    <Card className="p-4 rounded-lg">
      <Collapsible defaultOpen>
        <CollapsibleTrigger className="flex w-full items-center justify-between text-xs font-semibold tracking-normal">
          Crop <ChevronDown className="size-4 text-kumo-subtle" />
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-4 pt-3">
          <Label>Aspect ratio</Label>
          <Select
            value={crop.aspectRatio ?? "custom"}
            onValueChange={(value) =>
              value && setAspectRatio(value as typeof crop.aspectRatio)
            }
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="custom">Custom</SelectItem>
              <SelectItem value="1:1">1:1</SelectItem>
              <SelectItem value="16:9">16:9</SelectItem>
              <SelectItem value="21:9">21:9</SelectItem>
            </SelectContent>
          </Select>
          <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
            <div>
              <dt className="text-kumo-subtle">Start X</dt>
              <dd>{Math.round((rect.x / 100) * sourceWidth)} px</dd>
            </div>
            <div>
              <dt className="text-kumo-subtle">Start Y</dt>
              <dd>{Math.round((rect.y / 100) * sourceHeight)} px</dd>
            </div>
            <div>
              <dt className="text-kumo-subtle">End X</dt>
              <dd>
                {Math.round(((rect.x + rect.width) / 100) * sourceWidth)} px
              </dd>
            </div>
            <div>
              <dt className="text-kumo-subtle">End Y</dt>
              <dd>
                {Math.round(((rect.y + rect.height) / 100) * sourceHeight)} px
              </dd>
            </div>
            <div className="col-span-2">
              <dt className="text-kumo-subtle">Width × Height</dt>
              <dd className="font-medium">
                {Math.round((rect.width / 100) * sourceWidth)} ×{" "}
                {Math.round((rect.height / 100) * sourceHeight)}
              </dd>
            </div>
          </dl>
          <Button
            className="w-full"
            variant={crop.isCropMode ? "default" : "outline"}
            onClick={() =>
              setCropState((previous) => ({
                ...previous,
                isCropMode: !previous.isCropMode,
              }))
            }
          >
            {crop.isCropMode ? "Crop mode on" : "Enable crop"}
          </Button>
          <div className="space-y-3">
            <Label>Canvas zoom</Label>
            <Slider
              value={[crop.canvasZoom * 100]}
              min={50}
              max={300}
              step={1}
              onValueChange={(value) =>
                setCropState((previous) => ({
                  ...previous,
                  canvasZoom: readSliderValue(value) / 100,
                }))
              }
              aria-label="Canvas zoom"
            />

            <div className="flex items-center w-full justify-between gap-2">
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      size="icon"
                      variant="outline"
                      aria-label="Zoom out canvas"
                      disabled={crop.canvasZoom <= 0.25}
                      onClick={() => adjustCanvasZoom(-0.1)}
                    />
                  }
                >
                  <ZoomOut />
                </TooltipTrigger>
                <TooltipContent>Zoom out canvas</TooltipContent>
              </Tooltip>
              <output className="min-w-12 text-center text-xs tabular-nums text-kumo-subtle">
                {Math.round(crop.canvasZoom * 100)}%
              </output>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      size="icon"
                      variant="outline"
                      aria-label="Zoom in canvas"
                      disabled={crop.canvasZoom >= 4}
                      onClick={() => adjustCanvasZoom(0.1)}
                    />
                  }
                >
                  <ZoomIn />
                </TooltipTrigger>
                <TooltipContent>Zoom in canvas</TooltipContent>
              </Tooltip>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
