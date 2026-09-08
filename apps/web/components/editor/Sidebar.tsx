"use client";

import { useEffect, useRef } from "react";
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
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  ACCEPTED_VIDEO_INPUT_ATTR,
  isAcceptedVideoFile,
  isFileTooLarge,
  formatFileSize,
  MAX_UPLOAD_BYTES,
  stripExtension,
} from "@/lib/video-file";
import {
  sourceStore,
  setSourceState,
  type SourceSlice,
} from "@/store/sourceSlice";
import { useSelector } from "@tanstack/react-store";
import { cropStore, setCropState, type CropSlice } from "@/store/cropSlice";
import { cutStore, setCutState, type CutSlice } from "@/store/cutSlice";
import { useTranscodeMutation } from "@/hooks/use-ffmpeg-mutations";
import { UploadProgress } from "@/components/editor/UploadProgress";
import { audioStore, getAudioRenderSettings } from "@/store/audioSlice";

export function SidebarToggle() {
  const isSidebarOpen = useSelector(cutStore, (state) => state.isSidebarOpen);
  const label = isSidebarOpen ? "Hide sidebar" : "Show sidebar";

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            size="icon-xs"
            variant="ghost"
            aria-label={label}
            onClick={() =>
              setCutState((previous) => ({
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
  const source = useSelector(sourceStore);
  const crop = useSelector(cropStore);
  const cut = useSelector(cutStore);
  const audio = useSelector(audioStore);
  const state = { ...source, ...crop, ...cut };
  const metadataMutation = useVideoMetadataMutation();
  const extendedMetadataMutation = useExtendedVideoMetadataMutation();
  const transcodeMutation = useTranscodeMutation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const update = (value: Partial<SourceSlice & CropSlice & CutSlice>) => {
    const sourceKeys = new Set<keyof SourceSlice>(
      Object.keys(source) as Array<keyof SourceSlice>,
    );
    const cropKeys = new Set<keyof CropSlice>(
      Object.keys(crop) as Array<keyof CropSlice>,
    );
    const cutKeys = new Set<keyof CutSlice>(
      Object.keys(cut) as Array<keyof CutSlice>,
    );
    const sourceValue = Object.fromEntries(
      Object.entries(value).filter(([key]) =>
        sourceKeys.has(key as keyof SourceSlice),
      ),
    ) as Partial<SourceSlice>;
    const cropValue = Object.fromEntries(
      Object.entries(value).filter(([key]) =>
        cropKeys.has(key as keyof CropSlice),
      ),
    ) as Partial<CropSlice>;
    const cutValue = Object.fromEntries(
      Object.entries(value).filter(([key]) =>
        cutKeys.has(key as keyof CutSlice),
      ),
    ) as Partial<CutSlice>;
    if (Object.keys(sourceValue).length)
      setSourceState((previous) => ({ ...previous, ...sourceValue }));
    if (Object.keys(cropValue).length)
      setCropState((previous) => ({ ...previous, ...cropValue }));
    if (Object.keys(cutValue).length)
      setCutState((previous) => ({ ...previous, ...cutValue }));
  };
  const extension =
    state.file?.name.split(".").pop()?.toUpperCase() ?? "Unknown";
  const filename = state.file
    ? stripExtension(state.file.name)
    : "Untitled video";
  const basename = state.file ? stripExtension(state.file.name) : "";

  // Keep export filename in sync with uploaded file's basename.
  // VideoUploader and the two "Upload other" handlers already set exportFilename
  // on file change, but this effect covers any other file-set path (e.g. future
  // uploader variants) and restores a sensible default when the stored name is
  // empty while a file is present.
  useEffect(() => {
    if (!state.file || !basename) return;
    if (!state.exportFilename) {
      update({ exportFilename: basename });
    }
  }, [basename, state.exportFilename, state.file]);
  const selectReplacementFile = (file: File | undefined) => {
    if (!file || !isAcceptedVideoFile(file)) {
      if (file) toast.error("Unsupported format. Use MP4/WebM/MOV/MKV");
      return;
    }
    if (isFileTooLarge(file)) {
      toast.error(
        `File too large (${formatFileSize(file.size)}). Max ${formatFileSize(MAX_UPLOAD_BYTES)}.`,
      );
      return;
    }
    const mediaUrl = URL.createObjectURL(file);
    const defaultFilename = stripExtension(file.name);
    setSourceState((previous) => {
      if (previous.mediaUrl) URL.revokeObjectURL(previous.mediaUrl);
      return {
        ...previous,
        file,
        mediaUrl,
        currentTime: 0,
        duration: 0,
        isPlaying: false,
        sourceAspectRatio: 1,
        sourceWidth: 0,
        sourceHeight: 0,
        sourceFrameRate: 0,
        containerFormat: null,
        videoCodec: null,
        audioCodec: null,
        bitrateKbps: 0,
        ffprobeReport: null,
      };
    });
    setCropState((previous) => ({
      ...previous,
      crop: { x: 0, y: 0, width: 100, height: 100 },
      aspectRatio: "custom",
      isCropMode: false,
      canvasZoom: 1,
      canvasOffset: { x: 0, y: 0 },
    }));
    setCutState((previous) => ({
      ...previous,
      exportFilename: defaultFilename,
      transcodeStatus: "idle",
      transcodeProgress: 0,
      transcodeOutputPath: null,
      transcodeError: null,
    }));
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

    const srcAspect =
      state.sourceAspectRatio > 0 ? state.sourceAspectRatio : 16 / 9;
    const widthPerHeight = targetRatio / srcAspect;
    // Preserve crop center while enforcing aspect. Start from current rect
    // and shrink the limiting dimension so the new rect fits inside bounds
    // and stays centered where possible — avoids drift toward origin.
    const cx = state.crop.x + state.crop.width / 2;
    const cy = state.crop.y + state.crop.height / 2;
    // Max size that fits inside 100x100 around center at desired ratio
    const maxWByH = state.crop.height * widthPerHeight;
    const maxHByW = state.crop.width / widthPerHeight;
    let h: number;
    let w: number;
    if (maxWByH <= state.crop.width) {
      h = state.crop.height;
      w = maxWByH;
    } else {
      w = state.crop.width;
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
    update({
      aspectRatio: value,
      crop: { x, y, width: w, height: h },
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
        watermark: state.watermark,
        ignoreTrim: state.ignoreTrim,
        audioTrackIndex: state.audioTrackIndex,
        audioTracks: audio.tracks.length
          ? getAudioRenderSettings(audio.tracks)
          : undefined,
      },
      {
        onSuccess: (result) =>
          toast.success("Video exported.", {
            id: "transcode",
            description: result.outputFile?.name ?? "Export complete",
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
    <aside className="flex flex-col gap-3">
      <Input
        ref={fileInputRef}
        className="sr-only"
        type="file"
        accept={ACCEPTED_VIDEO_INPUT_ATTR}
        onChange={(event) => selectReplacementFile(event.target.files?.[0])}
      />

      <Button
        className="w-full"
        variant="outline"
        onClick={() => fileInputRef.current?.click()}
      >
        Choose other video
      </Button>
      {(state.uploadStatus === "uploading" ||
        state.uploadStatus === "error") && <UploadProgress />}
      <Card className="p-4 rounded-lg">
        <Collapsible>
          <CollapsibleTrigger className="flex w-full items-center justify-between text-xs font-semibold tracking-normal">
            Info <ChevronDown className="size-4 text-kumo-subtle" />
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-3 pt-3">
            <div>
              <h2
                className="truncate text-sm font-medium"
                title={state.file?.name}
              >
                {filename}
              </h2>
              <p className="text-xs text-kumo-subtle">{extension} video</p>
            </div>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
              <div>
                <dt className="text-kumo-subtle">Length</dt>
                <dd>{formatTime(state.duration)}</dd>
              </div>
              <div>
                <dt className="text-kumo-subtle">Size</dt>
                <dd>
                  {state.file
                    ? `${(state.file.size / 1024 / 1024).toFixed(1)} MB`
                    : "-"}
                </dd>
              </div>
              <div>
                <dt className="text-kumo-subtle">Canvas</dt>
                <dd>
                  {state.sourceWidth} x {state.sourceHeight}
                </dd>
              </div>
              <div>
                <dt className="text-kumo-subtle">Ratio</dt>
                <dd>{state.sourceAspectRatio.toFixed(2)}:1</dd>
              </div>
              <div>
                <dt className="text-kumo-subtle">Frame rate</dt>
                <dd>
                  {state.sourceFrameRate
                    ? `${state.sourceFrameRate.toFixed(2)} fps`
                    : "-"}
                </dd>
              </div>
              <div>
                <dt className="text-kumo-subtle">Video codec</dt>
                <dd>{state.videoCodec ?? "-"}</dd>
              </div>
              <div>
                <dt className="text-kumo-subtle">Audio codec</dt>
                <dd>{state.audioCodec ?? "None"}</dd>
              </div>
              <div>
                <dt className="text-kumo-subtle">Bitrate</dt>
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
                  <pre className="max-h-[calc(100dvh-10rem)] overflow-auto rounded-md border border-kumo-line bg-kumo-recessed p-3 text-xs leading-5 whitespace-pre-wrap break-all">
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
      <Card className="p-4 rounded-lg">
        <Collapsible defaultOpen>
          <CollapsibleTrigger className="flex w-full items-center justify-between text-xs font-semibold tracking-normal">
            Crop <ChevronDown className="size-4 text-kumo-subtle" />
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-4 pt-3">
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
                <dt className="text-kumo-subtle">Start X</dt>
                <dd>
                  {Math.round((state.crop.x / 100) * state.sourceWidth)} px
                </dd>
              </div>
              <div>
                <dt className="text-kumo-subtle">Start Y</dt>
                <dd>
                  {Math.round((state.crop.y / 100) * state.sourceHeight)} px
                </dd>
              </div>
              <div>
                <dt className="text-kumo-subtle">End X</dt>
                <dd>
                  {Math.round(
                    ((state.crop.x + state.crop.width) / 100) *
                      state.sourceWidth,
                  )}{" "}
                  px
                </dd>
              </div>
              <div>
                <dt className="text-kumo-subtle">End Y</dt>
                <dd>
                  {Math.round(
                    ((state.crop.y + state.crop.height) / 100) *
                      state.sourceHeight,
                  )}{" "}
                  px
                </dd>
              </div>
              <div className="col-span-2">
                <dt className="text-kumo-subtle">Width × Height</dt>
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
              />

              <div className="flex items-center w-full justify-between gap-2">
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        size="icon"
                        variant="outline"
                        aria-label="Zoom out canvas"
                        disabled={state.canvasZoom <= 0.25}
                        onClick={() => adjustCanvasZoom(-0.1)}
                      />
                    }
                  >
                    <ZoomOut />
                  </TooltipTrigger>
                  <TooltipContent>Zoom out canvas</TooltipContent>
                </Tooltip>
                <output className="min-w-12 text-center text-xs tabular-nums text-kumo-subtle">
                  {Math.round(state.canvasZoom * 100)}%
                </output>
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        size="icon"
                        variant="outline"
                        aria-label="Zoom in canvas"
                        disabled={state.canvasZoom >= 4}
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
                  <span className="text-xs text-kumo-subtle tabular-nums">
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
      <Card className="p-4 rounded-lg">
        <Collapsible>
          <CollapsibleTrigger className="flex w-full items-center justify-between text-xs font-semibold tracking-normal">
            Export <ChevronDown className="size-4 text-kumo-subtle" />
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-4 pt-3">
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
                <SelectItem value="webm-tg">WebM Telegram (sticker)</SelectItem>
              </SelectContent>
            </Select>
            {state.exportFormat === "webm-tg" && (
              <p className="text-[11px] leading-4 text-kumo-subtle">
                Telegram sticker preset: 30fps, width 512px, VP9, no audio, up
                to 3s. Trim, crop, filename and quality apply.
              </p>
            )}
            <div className="space-y-2 pt-2">
              <Label>Filename</Label>
              <Input
                value={state.exportFilename || basename}
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
                  <span className="text-xs text-kumo-subtle tabular-nums">
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
            {state.exportFormat !== "webm-tg" && (
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
            {state.exportFormat !== "webm-tg" && (
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
            <div className="flex items-center justify-between">
              <Label htmlFor="export-ignore-trim">Ignore trim</Label>
              <Switch
                id="export-ignore-trim"
                checked={state.ignoreTrim}
                onCheckedChange={(ignoreTrim) => update({ ignoreTrim })}
              />
            </div>
            {state.exportFormat !== "webm-tg" && (
              <>
                <div className="flex items-center justify-between">
                  <Label htmlFor="export-watermark">Watermark</Label>
                  <Switch
                    id="export-watermark"
                    checked={state.watermark}
                    onCheckedChange={(watermark) => update({ watermark })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="export-audio-track">Audio track index</Label>
                  <Input
                    id="export-audio-track"
                    type="number"
                    min="0"
                    step="1"
                    value={state.audioTrackIndex}
                    onChange={(event) =>
                      update({
                        audioTrackIndex: Math.max(
                          0,
                          Number(event.target.value) || 0,
                        ),
                      })
                    }
                  />
                </div>
              </>
            )}
            {state.uploadStatus === "uploading" &&
              state.uploadStage === "transcode" && <UploadProgress />}
            {(state.transcodeStatus === "processing" ||
              state.transcodeStatus === "queued") && (
              <div className="space-y-1">
                {state.transcodeStatus === "queued" && (
                  <p className="text-xs text-kumo-subtle" aria-live="polite">
                    {state.transcodeQueuePosition != null
                      ? `Queued #${state.transcodeQueuePosition + 1} — waiting for a worker…`
                      : "Queued — waiting for a worker…"}
                  </p>
                )}
                <Progress
                  value={state.transcodeProgress}
                  aria-label="Export progress"
                />
              </div>
            )}
            {state.transcodeStatus === "cancelled" && (
              <p className="text-xs text-kumo-subtle" aria-live="polite">
                Export cancelled — job kept in Admin for inspection.
              </p>
            )}
            {state.transcodeStatus === "failed" && state.transcodeError && (
              <p className="text-xs text-red-600 wrap-break-word">
                {state.transcodeError}
              </p>
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
                ? state.transcodeStatus === "queued"
                  ? "Queued for export…"
                  : `Exporting ${Math.round(state.transcodeProgress)}%`
                : "Export video"}
            </Button>
          </CollapsibleContent>
        </Collapsible>
      </Card>
    </aside>
  );
}
