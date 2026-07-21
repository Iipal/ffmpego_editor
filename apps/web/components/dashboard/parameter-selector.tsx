"use client";

import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { FFmpegParameters } from "@/store/ffmpeg-store";

interface ParameterSelectorProps {
  parameters: FFmpegParameters;
  onParamsChange: (params: FFmpegParameters) => void;
}

const formats = ["mp4", "avi", "mkv", "mov", "webm"];
const qualities: Array<FFmpegParameters["quality"]> = [
  "lossless",
  "high",
  "medium",
  "low",
];
const formatItems = formats.map((format) => ({
  label: format.toUpperCase(),
  value: format,
}));
const qualityItems = qualities.map((quality) => ({
  label: quality.charAt(0).toUpperCase() + quality.slice(1),
  value: quality,
}));

export function ParameterSelector({
  parameters,
  onParamsChange,
}: ParameterSelectorProps) {
  return (
    <Card className="p-6">
      <h3 className="text-lg font-semibold mb-4">Processing Parameters</h3>

      <div className="space-y-4">
        {/* Format Selection */}
        <div>
          <Label htmlFor="format" className="block mb-2">
            Output Format
          </Label>
          <Select
            items={formatItems}
            value={parameters.format}
            onValueChange={(format) => {
              if (format) {
                onParamsChange({ ...parameters, format });
              }
            }}
          >
            <SelectTrigger id="format" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {formatItems.map((format) => (
                  <SelectItem key={format.value} value={format.value}>
                    {format.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>

        {/* Quality Selection */}
        <div>
          <Label htmlFor="quality" className="block mb-2">
            Quality
          </Label>
          <Select
            items={qualityItems}
            value={parameters.quality}
            onValueChange={(quality) => {
              if (quality) {
                onParamsChange({
                  ...parameters,
                  quality: quality as FFmpegParameters["quality"],
                });
              }
            }}
          >
            <SelectTrigger id="quality" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {qualityItems.map((quality) => (
                  <SelectItem key={quality.value} value={quality.value}>
                    {quality.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>

        {/* Trim Options */}
        <div className="border-t pt-2">
          <Label htmlFor="startTime" className="block mb-2">
            Trim (optional)
          </Label>
          <div className="flex gap-4">
            <Input
              id="startTime"
              type="number"
              placeholder="Start (seconds)"
              value={parameters.startTime ?? ""}
              onChange={(e) =>
                onParamsChange({
                  ...parameters,
                  startTime: Number(e.target.value) || undefined,
                })
              }
            />
            <Input
              id="endTime"
              type="number"
              placeholder="End (seconds)"
              value={parameters.endTime ?? ""}
              onChange={(e) =>
                onParamsChange({
                  ...parameters,
                  endTime: Number(e.target.value) || undefined,
                })
              }
            />
          </div>
        </div>
      </div>
    </Card>
  );
}
