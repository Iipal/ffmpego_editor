"use client";

import { useRef } from "react";
import {
  ChevronDown,
  PanelRightClose,
  PanelRightOpen,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { toast } from "sonner";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatTime } from "@/lib/format-time";
import {
  useExtendedVideoMetadataMutation,
  useVideoMetadataMutation,
} from "@/hooks/useVideoMetadata";
import {
  useVideoState,
  useVideoStore,
  type VideoState,
} from "@/store/useVideoStore";
import { useTranscodeMutation } from "@/hooks/use-ffmpeg-mutations";
import { cn } from "@/lib/utils";
import { useTheme } from "@/providers/ThemeProvider";

export function SidebarToggle() {
  const store = useVideoStore();
  const { isSidebarOpen } = useVideoState();
  const label = isSidebarOpen ? "Hide sidebar" : "Show sidebar";

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            size="icon"
            variant="outline"
            aria-label={label}
            onClick={() =>
              store.setState((previous) => ({
                ...previous,
                isSidebarOpen: !previous.isSidebarOpen,
              }))
            }
          />
        }
      >
        {isSidebarOpen ? <PanelRightClose /> : <PanelRightOpen />}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

export function Sidebar() {
  const store = useVideoStore();
  const state = useVideoState();
  const metadataMutation = useVideoMetadataMutation();
  const extendedMetadataMutation = useExtendedVideoMetadataMutation();
  const transcodeMutation = useTranscodeMutation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { theme } = useTheme();
  const update = (value: Partial<VideoState>) =>
    store.setState((previous) => ({ ...previous, ...value }));
  const extension =
    state.file?.name.split(".").pop()?.toUpperCase() ?? "Unknown";
  const filename = state.file?.name.replace(/\.[^.]+$/, "") ?? "Untitled video";
  const selectReplacementFile = (file: File | undefined) => {
    if (
      !file ||
      !["video/mp4", "video/webm", "video/quicktime"].includes(file.type)
    )
      return;
    const mediaUrl = URL.createObjectURL(file);
    const defaultFilename = file.name.replace(/\.[^.]+$/, "");
    store.setState((previous) => {
      if (previous.mediaUrl) URL.revokeObjectURL(previous.mediaUrl);
      return {
        ...previous,
        file,
        mediaUrl,
        currentTime: 0,
        duration: 0,
        isPlaying: false,
        trimRange: [0, 0],
        crop: { x: 0, y: 0, width: 100, height: 100 },
        aspectRatio: "custom",
        isCropMode: false,
        isAutoZoomEnabled: false,
        canvasZoom: 1,
        canvasOffset: { x: 0, y: 0 },
        sourceAspectRatio: 1,
        sourceWidth: 0,
        sourceHeight: 0,
        sourceFrameRate: 0,
        containerFormat: null,
        videoCodec: null,
        audioCodec: null,
        bitrateKbps: 0,
        ffprobeReport: null,
        exportFilename: defaultFilename,
        transcodeStatus: "idle",
        transcodeProgress: 0,
        transcodeOutputPath: null,
        transcodeError: null,
      };
    });
    metadataMutation.mutate(file);
    extendedMetadataMutation.reset();
  };
  const setAspectRatio = (value: typeof state.aspectRatio) => {
    const ratioMap: Record<string, number> = {
      "1:1": 1,
      "16:9": 16 / 9,
      "21:9": 21 / 9,
    };
    const targetRatio = ratioMap[value];

    if (targetRatio === undefined) {
      update({ aspectRatio: value });
      return;
    }

    const widthPerHeight = targetRatio / state.sourceAspectRatio;
    const height = Math.min(
      state.crop.height,
      100 - state.crop.y,
      state.crop.width / widthPerHeight,
      (100 - state.crop.x) / widthPerHeight,
    );
    update({
      aspectRatio: value,
      crop: {
        ...state.crop,
        width: Math.min(height * widthPerHeight, 100 - state.crop.x),
        height,
      },
    });
  };
  const startExport = () => {
    if (!state.file) return;

    console.log(state);

    toast.loading("Exporting video...", { id: "transcode" });
    transcodeMutation.mutate(
      {
        file: state.file,
        crop: state.crop,
        customFFmpegArgs: state.customFFmpegArgs,
        exportFormat: state.exportFormat,
        exportFps: state.exportFps,
        exportFilename: state.exportFilename,
        exportQuality: state.exportQuality,
        exportSpeed: state.exportSpeed,
        sourceHeight: state.sourceHeight,
        sourceWidth: state.sourceWidth,
        trimRange: state.trimRange,
      },
      {
        onSuccess: (result) =>
          toast.success("Video exported.", {
            id: "transcode",
            description: result.outputPath,
          }),
        onError: (error) =>
          toast.error("Video export failed.", {
            id: "transcode",
            description: error.message,
          }),
      },
    );
  };
  const getExtendedInfo = () => {
    if (!state.file) return;
    extendedMetadataMutation.mutate(state.file, {
      onError: (error) =>
        toast.error("Unable to retrieve extended video info.", {
          description: error.message,
        }),
    });
  };
  const adjustCanvasZoom = (amount: number) => {
    update({
      canvasZoom: Math.min(4, Math.max(0.25, state.canvasZoom + amount)),
    });
  };
  return (
    <aside
      className={cn(
        "glass-card glass-panel-hover space-y-4 p-4",
        theme === "dark" && "glass-glow",
      )}
    >
      <Input
        ref={fileInputRef}
        className="sr-only"
        type="file"
        accept="video/mp4,video/webm,video/quicktime"
        onChange={(event) => selectReplacementFile(event.target.files?.[0])}
      />

      <div className="flex justify-end">
        <SidebarToggle />
      </div>

      <Button
        className="w-full"
        variant="outline"
        onClick={() => fileInputRef.current?.click()}
      >
        Choose other video
      </Button>
      <Card className="p-4">
        <Collapsible>
          <CollapsibleTrigger className="flex w-full items-center justify-between text-sm font-semibold">
            Info <ChevronDown className="size-4" />
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-3 pt-4">
            <div>
              <h2
                className="truncate text-sm font-medium"
                title={state.file?.name}
              >
                {filename}
              </h2>
              <p className="text-xs text-muted-foreground">{extension} video</p>
            </div>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
              <div>
                <dt className="text-muted-foreground">Length</dt>
                <dd>{formatTime(state.duration)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Size</dt>
                <dd>
                  {state.file
                    ? `${(state.file.size / 1024 / 1024).toFixed(1)} MB`
                    : "-"}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Canvas</dt>
                <dd>
                  {state.sourceWidth} x {state.sourceHeight}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Ratio</dt>
                <dd>{state.sourceAspectRatio.toFixed(2)}:1</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Frame rate</dt>
                <dd>
                  {state.sourceFrameRate
                    ? `${state.sourceFrameRate.toFixed(2)} fps`
                    : "-"}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Video codec</dt>
                <dd>{state.videoCodec ?? "-"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Audio codec</dt>
                <dd>{state.audioCodec ?? "None"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Bitrate</dt>
                <dd>{state.bitrateKbps ? `${state.bitrateKbps} kbps` : "-"}</dd>
              </div>
            </dl>
            <Button
              className="w-full"
              variant="outline"
              onClick={getExtendedInfo}
              disabled={extendedMetadataMutation.isPending || !state.file}
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
                <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-5xl gap-4 p-4 sm:max-w-5xl">
                  <DialogHeader>
                    <DialogTitle>Extended Video Info</DialogTitle>
                    <DialogDescription>
                      Complete FFprobe report for {state.file?.name}
                    </DialogDescription>
                  </DialogHeader>
                  <pre className="max-h-[calc(100dvh-10rem)] overflow-auto rounded-md border bg-muted p-3 text-xs leading-5 whitespace-pre-wrap break-all">
                    <code>
                      {JSON.stringify(extendedMetadataMutation.data, null, 2)}
                    </code>
                  </pre>
                </DialogContent>
              </Dialog>
            )}
          </CollapsibleContent>
        </Collapsible>
      </Card>
      <Card className="p-4">
        <Collapsible defaultOpen>
          <CollapsibleTrigger className="flex w-full items-center justify-between text-sm font-semibold">
            Crop <ChevronDown className="size-4" />
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-4 pt-4">
            <Label>Aspect ratio</Label>
            <Select
              value={state.aspectRatio ?? "custom"}
              onValueChange={(value) =>
                value && setAspectRatio(value as typeof state.aspectRatio)
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
                <dt className="text-muted-foreground">Start X</dt>
                <dd>
                  {Math.round((state.crop.x / 100) * state.sourceWidth)} px
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Start Y</dt>
                <dd>
                  {Math.round((state.crop.y / 100) * state.sourceHeight)} px
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">End X</dt>
                <dd>
                  {Math.round(
                    ((state.crop.x + state.crop.width) / 100) *
                      state.sourceWidth,
                  )}{" "}
                  px
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">End Y</dt>
                <dd>
                  {Math.round(
                    ((state.crop.y + state.crop.height) / 100) *
                      state.sourceHeight,
                  )}{" "}
                  px
                </dd>
              </div>
              <div className="col-span-2">
                <dt className="text-muted-foreground">Width × Height</dt>
                <dd className="font-medium">
                  {Math.round((state.crop.width / 100) * state.sourceWidth)} ×{" "}
                  {Math.round((state.crop.height / 100) * state.sourceHeight)}
                </dd>
              </div>
            </dl>
            <Button
              className="w-full"
              variant={state.isCropMode ? "default" : "outline"}
              onClick={() => update({ isCropMode: !state.isCropMode })}
            >
              {state.isCropMode ? "Crop mode on" : "Enable crop"}
            </Button>
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="auto-zoom">Auto-zoom Follows Crop Area</Label>
              <Switch
                id="auto-zoom"
                checked={state.isAutoZoomEnabled}
                onCheckedChange={(checked) =>
                  update({ isAutoZoomEnabled: checked })
                }
              />
            </div>
            <div className="space-y-3">
              <Label>Canvas zoom</Label>
              <Slider
                value={[state.canvasZoom * 100]}
                min={50}
                max={300}
                step={1}
                onValueChange={(value) =>
                  update({
                    canvasZoom: Array.isArray(value)
                      ? Number(value[0] ?? 100) / 100
                      : Number(value) / 100,
                  })
                }
                aria-label="Canvas zoom"
                disabled={state.isAutoZoomEnabled}
              />

              <div className="flex items-center w-full justify-between gap-2">
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        size="icon"
                        variant="outline"
                        aria-label="Zoom out canvas"
                        disabled={
                          state.isAutoZoomEnabled || state.canvasZoom <= 0.25
                        }
                        onClick={() => adjustCanvasZoom(-0.1)}
                      />
                    }
                  >
                    <ZoomOut />
                  </TooltipTrigger>
                  <TooltipContent>Zoom out canvas</TooltipContent>
                </Tooltip>
                <output className="min-w-12 text-center text-xs tabular-nums">
                  {Math.round(state.canvasZoom * 100)}%
                </output>
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        size="icon"
                        variant="outline"
                        aria-label="Zoom in canvas"
                        disabled={
                          state.isAutoZoomEnabled || state.canvasZoom >= 4
                        }
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
      <Card className="p-4">
        <Collapsible>
          <CollapsibleTrigger className="flex w-full items-center justify-between text-sm font-semibold">
            Video Speed <ChevronDown className="size-4" />
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-4 pt-4">
            <div className="space-y-3">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="playback-speed">Playback speed</Label>
                  <span className="text-xs text-muted-foreground">
                    {state.playbackSpeed.toFixed(1)}x
                  </span>
                </div>
                <Slider
                  id="playback-speed"
                  value={[state.playbackSpeed]}
                  min={0.1}
                  max={2}
                  step={0.1}
                  onValueChange={(value) =>
                    update({
                      playbackSpeed: Array.isArray(value)
                        ? Number(value[0] ?? 1)
                        : Number(value),
                    })
                  }
                  aria-label="Playback speed"
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="export-speed">Export speed</Label>
                  <span className="text-xs text-muted-foreground">
                    {state.exportSpeed.toFixed(1)}x
                  </span>
                </div>
                <Slider
                  id="export-speed"
                  value={[state.exportSpeed]}
                  min={0.1}
                  max={2}
                  step={0.1}
                  onValueChange={(value) =>
                    update({
                      exportSpeed: Array.isArray(value)
                        ? Number(value[0] ?? 1)
                        : Number(value),
                    })
                  }
                  aria-label="Export speed"
                />
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </Card>
      <Card className="p-4">
        <Collapsible>
          <CollapsibleTrigger className="flex w-full items-center justify-between text-sm font-semibold">
            Export <ChevronDown className="size-4" />
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-4 pt-4">
            <Label>Output format</Label>
            <Select
              value={state.exportFormat}
              onValueChange={(value) =>
                value &&
                update({ exportFormat: value as typeof state.exportFormat })
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="mp4">MP4</SelectItem>
                <SelectItem value="webm">WebM</SelectItem>
                <SelectItem value="mov">MOV</SelectItem>
              </SelectContent>
            </Select>
            <div className="space-y-2 pt-2">
              <Label>Filename</Label>
              <Input
                value={state.exportFilename}
                onChange={(event) =>
                  update({ exportFilename: event.target.value })
                }
                placeholder="output-file-name"
              />
            </div>
            {state.exportFormat !== "mov" && (
              <div className="flex flex-col space-y-2">
                <div className="flex items-center justify-between">
                  <Label>
                    Quality CRF{" "}
                    <span className="text-[10px] -mx-1.5">
                      (Lower is better)
                    </span>
                  </Label>
                  <span className="text-xs text-muted-foreground">
                    {state.exportQuality}
                  </span>
                </div>
                <Slider
                  value={[state.exportQuality]}
                  min={0}
                  max={60}
                  step={1}
                  onValueChange={(value) =>
                    update({
                      exportQuality: Array.isArray(value)
                        ? Number(value[0] ?? 5)
                        : Number(value),
                    })
                  }
                  aria-label="Export quality crf"
                />
              </div>
            )}
            {state.exportFormat !== "webm" && (
              <>
                <Label>Framerate</Label>
                <Select
                  value={String(state.exportFps)}
                  onValueChange={(value) =>
                    update({
                      exportFps: Number(value),
                    })
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="30">30 fps</SelectItem>
                    <SelectItem value="60">60 fps</SelectItem>
                  </SelectContent>
                </Select>
              </>
            )}
            {state.exportFormat !== "webm" && (
              <>
                <Input
                  type="number"
                  min="1"
                  placeholder="Custom fps"
                  onChange={(event) =>
                    event.target.value &&
                    update({ exportFps: Number(event.target.value) })
                  }
                />
                <Label>FFmpeg arguments</Label>
                <Textarea
                  value={state.customFFmpegArgs}
                  placeholder="-vf eq=contrast=1.2 -b:v 2M"
                  onChange={(event) =>
                    update({ customFFmpegArgs: event.target.value })
                  }
                />
              </>
            )}
            {state.transcodeStatus === "processing" && (
              <Progress
                value={state.transcodeProgress}
                aria-label="Export progress"
              />
            )}
            <Button
              className="w-full"
              onClick={startExport}
              disabled={
                transcodeMutation.isPending ||
                state.sourceWidth === 0 ||
                state.sourceHeight === 0
              }
            >
              {transcodeMutation.isPending
                ? `Exporting ${Math.round(state.transcodeProgress)}%`
                : "Export video"}
            </Button>
          </CollapsibleContent>
        </Collapsible>
      </Card>
    </aside>
  );
}
