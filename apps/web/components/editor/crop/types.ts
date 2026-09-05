export type CropAspect = "custom" | "1:1" | "16:9" | "21:9";

export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type PersistedCrop = {
  crop: CropRect;
  aspectRatio: CropAspect;
  isCropMode: boolean;
};

export interface CropPixelReadout {
  x: number;
  y: number;
  w: number;
  h: number;
  x2: number;
  y2: number;
}
