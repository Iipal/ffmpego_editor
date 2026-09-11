import { defineSlice } from "./slice";

export interface CropSlice {
  crop: { x: number; y: number; width: number; height: number };
  aspectRatio: "custom" | "1:1" | "16:9" | "21:9";
  isCropMode: boolean;
  canvasZoom: number;
  canvasOffset: { x: number; y: number };
}

export const initialCropSlice: CropSlice = {
  crop: { x: 0, y: 0, width: 100, height: 100 },
  aspectRatio: "custom",
  isCropMode: false,
  canvasZoom: 1,
  canvasOffset: { x: 0, y: 0 },
};

export const {
  store: cropStore,
  useStore: useCropStore,
  setState: setCropState,
} = defineSlice<CropSlice>(initialCropSlice);
