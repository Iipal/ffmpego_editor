import { defineSlice } from "./slice";

/** Global side-by-side source/output comparison dialog state. */
export type CompareOutputKind = "video" | "audio" | "image";

interface CompareSlice {
  open: boolean;
  title: string;
  /** Object URL (or mediaUrl) for the source — not revoked by us. */
  sourceUrl: string | null;
  /** Blob object URL created for the render — revoked on close. */
  outputUrl: string | null;
  outputKind: CompareOutputKind;
  meta: string | null;
}

const initial: CompareSlice = {
  open: false,
  title: "Compare",
  sourceUrl: null,
  outputUrl: null,
  outputKind: "video",
  meta: null,
};

export const { store: compareStore, useStore: useCompareStore } =
  defineSlice<CompareSlice>(initial);

export function openComparison(input: {
  title: string;
  sourceUrl: string | null;
  outputUrl: string;
  outputKind: CompareOutputKind;
  meta?: string | null;
}): void {
  compareStore.setState((p) => {
    if (p.outputUrl) URL.revokeObjectURL(p.outputUrl);
    return {
      open: true,
      title: input.title,
      sourceUrl: input.sourceUrl,
      outputUrl: input.outputUrl,
      outputKind: input.outputKind,
      meta: input.meta ?? null,
    };
  });
}

export function closeComparison(): void {
  compareStore.setState((p) => {
    if (p.outputUrl) URL.revokeObjectURL(p.outputUrl);
    return { ...initial };
  });
}
