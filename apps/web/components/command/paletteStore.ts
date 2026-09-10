"use client";

import { createStore } from "@tanstack/store";
import { useSelector } from "@tanstack/react-store";

interface PaletteState {
  open: boolean;
}

export const paletteStore = createStore<PaletteState>({ open: false });

export function usePaletteOpen() {
  return useSelector(paletteStore, (state) => state.open);
}

export function setPaletteOpen(open: boolean) {
  const current = paletteStore.state.open;
  if (current === open) return;
  paletteStore.setState((previous) => ({ ...previous, open }));
}

export function togglePalette() {
  paletteStore.setState((previous) => ({ ...previous, open: !previous.open }));
}
