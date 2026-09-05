import type { Cut } from "./types";

export function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function sortCuts(cuts: Cut[]): Cut[] {
  return [...cuts].sort((a, b) => a.start - b.start);
}

export function cutsOverlap(cuts: Cut[]): Cut[] {
  const sorted = sortCuts(cuts);
  const bad = new Set<string>();
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].start < sorted[i - 1].end - 0.001) {
      bad.add(sorted[i].id);
      bad.add(sorted[i - 1].id);
    }
  }
  return cuts.filter((c) => bad.has(c.id));
}

export function totalDuration(cuts: Cut[]): number {
  return cuts.reduce((a, c) => a + Math.max(0, c.end - c.start), 0);
}
