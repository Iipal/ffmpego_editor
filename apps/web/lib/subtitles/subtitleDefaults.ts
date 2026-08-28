import type { SubtitleStyle } from "./subtitleTypes";

export const DEFAULT_SUBTITLE_STYLE: SubtitleStyle = {
  fontFamily: "Inter, sans-serif",
  fontSize: 48,
  color: "#FFFFFF",
  outlineEnabled: true,
  outlineThickness: 2,
  outlineColor: "#000000",
  shadowEnabled: true,
  shadowSize: 4,
  shadowOffsetX: 2,
  shadowOffsetY: 2,
  shadowColor: "#000000",
  backgroundEnabled: false,
  backgroundColor: "rgba(0,0,0,0.6)",
  backgroundPadding: 8,
  backgroundBorderRadius: 6,
};

export const MIN_SUBTITLE_DURATION = 0.05;

export const FONT_FAMILY_OPTIONS: string[] = [
  "Inter, sans-serif",
  "Arial, sans-serif",
  "Helvetica, sans-serif",
  "Times New Roman, serif",
  "Georgia, serif",
  "Courier New, monospace",
  "Verdana, sans-serif",
];
