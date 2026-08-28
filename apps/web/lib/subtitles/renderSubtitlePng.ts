"use client";
import type { Subtitle } from "./subtitleTypes";

export interface RenderedSubtitlePng {
  blob: Blob;
  width: number;
  height: number;
}

const MAX_WIDTH = Math.round(1080 * 0.9); // 972

function wrapLine(line: string, ctx: CanvasRenderingContext2D, maxW: number): string[] {
  if (!line) return [""];
  if (ctx.measureText(line).width <= maxW) return [line];
  const words = line.split(" ");
  const out: string[] = [];
  let cur = "";
  for (const w of words) {
    const test = cur ? cur + " " + w : w;
    if (ctx.measureText(test).width <= maxW) {
      cur = test;
    } else {
      if (cur) out.push(cur);
      // If single word too long, break chars
      if (ctx.measureText(w).width > maxW) {
        let chunk = "";
        for (const ch of w) {
          const t2 = chunk + ch;
          if (ctx.measureText(t2).width > maxW) {
            if (chunk) out.push(chunk);
            chunk = ch;
          } else {
            chunk = t2;
          }
        }
        cur = chunk;
      } else {
        cur = w;
      }
    }
  }
  if (cur) out.push(cur);
  return out.length ? out : [""];
}

export async function renderSubtitlePng(subtitle: Subtitle): Promise<RenderedSubtitlePng> {
  const { text, style } = subtitle;
  const fontSize = Math.max(1, style.fontSize);
  const lineHeight = fontSize * 1.2;
  const padding = style.backgroundEnabled ? style.backgroundPadding : 0;
  const outline = style.outlineEnabled ? style.outlineThickness : 0;
  const shadowBlur = style.shadowEnabled ? style.shadowSize : 0;

  // Canvas setup
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");

  // Use first font family token for canvas, fallback to sans-serif
  const fontFamily = style.fontFamily || "Inter, sans-serif";
  // Ensure fonts are loaded if possible (best effort)
  try {
    // @ts-ignore
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
  } catch {}

  ctx.font = `${fontSize}px ${fontFamily}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";

  const rawLines = text.split("\n");
  const wrappedLines: string[] = [];
  for (const rl of rawLines) {
    const parts = wrapLine(rl, ctx, MAX_WIDTH);
    wrappedLines.push(...parts);
  }
  // Re-measure after wrap (font already set)
  let maxLineWidth = 0;
  for (const l of wrappedLines) {
    const w = ctx.measureText(l).width;
    if (w > maxLineWidth) maxLineWidth = w;
  }
  if (maxLineWidth === 0) maxLineWidth = ctx.measureText(" ").width;

  const contentW = Math.ceil(maxLineWidth);
  const contentH = Math.ceil(wrappedLines.length * lineHeight);

  // Add padding + outline + shadow extra to avoid clipping
  const extra = Math.ceil(Math.max(outline * 2, shadowBlur) + 4);
  const bgPadX = style.backgroundEnabled ? padding : 0;
  const bgPadY = style.backgroundEnabled ? padding : 0;

  const canvasW = Math.ceil(contentW + bgPadX * 2 + extra * 2);
  const canvasH = Math.ceil(contentH + bgPadY * 2 + extra * 2);

  canvas.width = Math.max(1, canvasW);
  canvas.height = Math.max(1, canvasH);

  // Need to reset font after resize (canvas reset)
  ctx.font = `${fontSize}px ${fontFamily}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";

  // Background
  if (style.backgroundEnabled) {
    ctx.fillStyle = style.backgroundColor;
    const r = style.backgroundBorderRadius;
    const x = 0, y = 0, w = canvas.width, h = canvas.height;
    // Rounded rect
    if (typeof ctx.roundRect === "function") {
      ctx.beginPath();
      // @ts-ignore
      ctx.roundRect(x, y, w, h, r);
      ctx.fill();
    } else {
      // manual
      const rr = Math.min(r, w / 2, h / 2);
      ctx.beginPath();
      ctx.moveTo(x + rr, y);
      ctx.lineTo(x + w - rr, y);
      ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
      ctx.lineTo(x + w, y + h - rr);
      ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
      ctx.lineTo(x + rr, y + h);
      ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
      ctx.lineTo(x, y + rr);
      ctx.quadraticCurveTo(x, y, x + rr, y);
      ctx.closePath();
      ctx.fill();
    }
  } else {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  // Prepare shadow state for text
  const cx = canvas.width / 2;
  // baseline offset: first line's baseline
  // lineHeight is distance between baselines when using alphabetic with middle? Let's use top anchor calculation
  // For centered, we want line y = topPad + extra + lineHeight/2 + i*lineHeight ??? but with alphabetic we need baseline.
  // Approx: yBaseline = extra + bgPadY + fontSize + i*lineHeight - (lineHeight - fontSize)/2
  // Simpler: use textBaseline = middle and y = center of line
  ctx.textBaseline = "middle";

  if (style.shadowEnabled && style.shadowSize > 0) {
    ctx.shadowColor = style.shadowColor;
    ctx.shadowBlur = style.shadowSize;
    ctx.shadowOffsetX = style.shadowOffsetX;
    ctx.shadowOffsetY = style.shadowOffsetY;
  } else {
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
  }

  ctx.lineJoin = "round";
  ctx.miterLimit = 2;

  for (let i = 0; i < wrappedLines.length; i++) {
    const line = wrappedLines[i];
    // y center for this line
    const y = extra + bgPadY + lineHeight * 0.5 + i * lineHeight;

    // Outline
    if (style.outlineEnabled && style.outlineThickness > 0) {
      ctx.strokeStyle = style.outlineColor;
      ctx.lineWidth = style.outlineThickness * 2;
      ctx.strokeText(line, cx, y);
    }
    // Fill
    ctx.fillStyle = style.color;
    ctx.fillText(line, cx, y);
  }

  // Reset shadow for export
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;

  const blob: Blob = await new Promise((resolve, reject) => {
    canvas.toBlob((b) => {
      if (b) resolve(b);
      else reject(new Error("Failed to create PNG"));
    }, "image/png");
  });

  return { blob, width: canvas.width, height: canvas.height };
}

export async function renderAllSubtitlesToPngs(
  subtitles: Subtitle[],
): Promise<Array<{ meta: { startTime: number; endTime: number; x: number; y: number; width: number; height: number }; blob: Blob }>> {
  const results = [];
  for (const s of subtitles) {
    const { blob, width, height } = await renderSubtitlePng(s);
    results.push({
      meta: { startTime: s.startTime, endTime: s.endTime, x: s.position.x, y: s.position.y, width, height },
      blob,
    });
  }
  return results;
}
