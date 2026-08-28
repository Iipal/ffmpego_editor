export interface SubtitleStyle {
  fontFamily: string;
  fontSize: number;
  color: string;
  outlineEnabled: boolean;
  outlineThickness: number;
  outlineColor: string;
  shadowEnabled: boolean;
  shadowSize: number;
  shadowOffsetX: number;
  shadowOffsetY: number;
  shadowColor: string;
  backgroundEnabled: boolean;
  backgroundColor: string;
  backgroundPadding: number;
  backgroundBorderRadius: number;
}

export interface Subtitle {
  id: string;
  text: string;
  startTime: number;
  endTime: number;
  track: number;
  position: {
    x: number;
    y: number;
  };
  style: SubtitleStyle;
}

export interface SubtitleTemplate {
  id: string;
  name: string;
  style: SubtitleStyle;
}
