export interface PixelCrop {
  cw: number;
  ch: number;
  cx: number;
  cy: number;
}

export interface CropPercentages {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function cropPercentToPixels(
  crop: CropPercentages,
  sourceWidth: number,
  sourceHeight: number,
): PixelCrop {
  const cw = Math.max(1, Math.min(sourceWidth, Math.round((crop.width / 100) * sourceWidth)));
  const ch = Math.max(1, Math.min(sourceHeight, Math.round((crop.height / 100) * sourceHeight)));
  return {
    cw,
    ch,
    cx: Math.max(0, Math.min(sourceWidth - cw, Math.round((crop.x / 100) * sourceWidth))),
    cy: Math.max(0, Math.min(sourceHeight - ch, Math.round((crop.y / 100) * sourceHeight))),
  };
}

export function zoneToPixels(
  zone: CropPercentages,
  sourceWidth: number,
  sourceHeight: number,
  normalized = true,
): PixelCrop {
  return cropPercentToPixels(
    normalized
      ? { x: zone.x * 100, y: zone.y * 100, width: zone.width * 100, height: zone.height * 100 }
      : zone,
    sourceWidth,
    sourceHeight,
  );
}

export function buildSetptsFilter(speed: number): string {
  return `setpts=${(1 / speed).toFixed(6)}*PTS`;
}

export function buildAtempoFilter(speed: number): string {
  if (speed > 0 && speed < 0.5) {
    const factors: string[] = [];
    let remaining = speed;
    while (remaining < 0.5) {
      factors.push("atempo=0.5");
      remaining *= 2;
    }
    factors.push(`atempo=${remaining.toFixed(6)}`);
    return factors.join(",");
  }
  return `atempo=${speed.toFixed(6)}`;
}
