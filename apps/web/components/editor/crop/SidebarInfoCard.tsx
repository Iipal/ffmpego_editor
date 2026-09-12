"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { useSelector } from "@tanstack/react-store";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { formatTime } from "@/lib/format-time";
import { useExtendedVideoMetadataMutation } from "@/lib/query-hooks";
import { videoFileService } from "@/lib/video-file";
import { sourceStore } from "@/store/sourceSlice";
import { ProbeInspector } from "@/components/editor/ProbeInspector";

/** Info section: metadata readout + deep-probe toggle + ProbeInspector. */
export function SidebarInfoCard() {
  const source = useSelector(sourceStore);
  const extendedMetadataMutation = useExtendedVideoMetadataMutation();
  // Deep probe asks ffprobe for per-frame/per-packet dumps (slower, much
  // larger report) so the inspector can show Frames/Packets tabs.
  const [deepProbe, setDeepProbe] = useState(false);

  const extension =
    source.file?.name.split(".").pop()?.toUpperCase() ?? "Unknown";
  const basename = source.file
    ? videoFileService.stripExtension(source.file.name)
    : "";
  const filename = basename || "Untitled video";

  const getExtendedInfo = () => {
    if (!source.file) return;
    const file = source.file;
    extendedMetadataMutation.mutate(
      {
        file,
        includeFrames: deepProbe,
        includePackets: deepProbe,
      },
      {
        onError: (error) =>
          toast.error("Unable to retrieve extended video info.", {
            description: error.message,
          }),
      },
    );
  };

  return (
    <Card className="p-4 rounded-lg">
      <Collapsible>
        <CollapsibleTrigger className="flex w-full items-center justify-between text-xs font-semibold tracking-normal">
          Info <ChevronDown className="size-4 text-kumo-subtle" />
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-3 pt-3">
          <div>
            <h2
              className="truncate text-sm font-medium"
              title={source.file?.name}
            >
              {filename}
            </h2>
            <p className="text-xs text-kumo-subtle">{extension} video</p>
          </div>
          <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
            <div>
              <dt className="text-kumo-subtle">Length</dt>
              <dd>{formatTime(source.duration)}</dd>
            </div>
            <div>
              <dt className="text-kumo-subtle">Size</dt>
              <dd>
                {source.file
                  ? `${(source.file.size / 1024 / 1024).toFixed(1)} MB`
                  : "-"}
              </dd>
            </div>
            <div>
              <dt className="text-kumo-subtle">Canvas</dt>
              <dd>
                {source.sourceWidth} x {source.sourceHeight}
              </dd>
            </div>
            <div>
              <dt className="text-kumo-subtle">Ratio</dt>
              <dd>{source.sourceAspectRatio.toFixed(2)}:1</dd>
            </div>
            <div>
              <dt className="text-kumo-subtle">Frame rate</dt>
              <dd>
                {source.sourceFrameRate
                  ? `${source.sourceFrameRate.toFixed(2)} fps`
                  : "-"}
              </dd>
            </div>
            <div>
              <dt className="text-kumo-subtle">Video codec</dt>
              <dd>{source.videoCodec ?? "-"}</dd>
            </div>
            <div>
              <dt className="text-kumo-subtle">Audio codec</dt>
              <dd>{source.audioCodec ?? "None"}</dd>
            </div>
            <div>
              <dt className="text-kumo-subtle">Bitrate</dt>
              <dd>{source.bitrateKbps ? `${source.bitrateKbps} kbps` : "-"}</dd>
            </div>
          </dl>
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="deep-probe" className="text-xs font-normal">
              Deep probe (frames + packets)
            </Label>
            <Switch
              id="deep-probe"
              checked={deepProbe}
              onCheckedChange={setDeepProbe}
              aria-describedby="deep-probe-hint"
            />
          </div>
          <p id="deep-probe-hint" className="text-xs text-kumo-subtle">
            Slower fetch, much larger report — enables the Frames/Packets tabs.
          </p>
          <Button
            className="w-full"
            variant="outline"
            onClick={getExtendedInfo}
            disabled={extendedMetadataMutation.isPending || !source.file}
          >
            {extendedMetadataMutation.isPending
              ? "Gathering extended info..."
              : "Get Extended Info"}
          </Button>
          {extendedMetadataMutation.data && (
            <Dialog>
              <DialogTrigger
                render={<Button className="w-full" variant="secondary" />}
              >
                Show Extended Info
              </DialogTrigger>
              <DialogContent className="flex max-h-[calc(100dvh-2rem)] max-w-5xl flex-col gap-4 p-4 sm:max-w-5xl">
                <DialogHeader>
                  <DialogTitle>Extended Video Info</DialogTitle>
                  <DialogDescription>
                    Complete FFprobe report for {source.file?.name}
                  </DialogDescription>
                </DialogHeader>
                <ProbeInspector
                  report={extendedMetadataMutation.data.ffprobe}
                  deepProbe={deepProbe}
                />
              </DialogContent>
            </Dialog>
          )}
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
