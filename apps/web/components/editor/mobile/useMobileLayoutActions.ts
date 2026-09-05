"use client";

import { useCallback } from "react";
import {
  clamp,
  createDefaultLayout,
  enforceZoneAspect,
  loadPrefForMode,
  zoneAspect,
  MAX_SPLIT,
  MIN_SPLIT,
} from "@/lib/mobile-layout";
import type { CropZone } from "@/lib/mobile-layout";
import type { MobileEditorApi } from "./useMobileEditor";

export function useMobileLayoutActions(
  ed: MobileEditorApi,
  startTransition: (fn: () => void) => void,
) {
  const handleMove = useCallback(
    (id: string, nx: number, ny: number) => {
      startTransition(() => {
        ed.commit((prev) => {
          const zones: CropZone[] = [];
          for (const z of prev.zones) {
            if (z.id !== id || z.locked) {
              zones.push(z);
              continue;
            }
            let x = clamp(nx, 0, 1 - z.width);
            let y = clamp(ny, 0, 1 - z.height);
            if (Math.abs(x - (0.5 - z.width / 2)) < 0.015)
              x = 0.5 - z.width / 2;
            if (Math.abs(y - (0.5 - z.height / 2)) < 0.015)
              y = 0.5 - z.height / 2;
            zones.push({ ...z, x, y });
          }
          return { ...prev, zones };
        });
      });
    },
    [ed, startTransition],
  );

  const handleResize = useCallback(
    (id: string, next: CropZone) => {
      startTransition(() => {
        ed.commit((prev) => {
          const zones = prev.zones.map((z) =>
            z.id === id && !z.locked
              ? enforceZoneAspect(next, prev.mode, prev.splitRatio)
              : z,
          );
          return { ...prev, zones };
        });
      });
    },
    [ed, startTransition],
  );

  const handleZoom = useCallback(
    (id: string, factor: number) => {
      startTransition(() => {
        ed.commit((prev) => {
          const zones = prev.zones.map((z) => {
            if (z.id !== id || z.locked) return z;
            const zoom = clamp(typeof factor === "number" ? factor : 1, 0.5, 3);
            const baseW =
              prev.mode === "full" ? 0.316 : id === "zone-1" ? 0.32 : 0.42;
            const asp = zoneAspect(
              prev.mode,
              prev.splitRatio,
              id as "zone-1" | "zone-2",
            );
            const sourceAR = 16 / 9;
            const w = clamp(baseW / zoom, 0.08, 0.95);
            const h = clamp((w / asp) * sourceAR, 0.08, 0.95);
            const x = clamp(z.x + (z.width - w) / 2, 0, 1 - w);
            const y = clamp(z.y + (z.height - h) / 2, 0, 1 - h);
            return { ...z, x, y, width: w, height: h, zoom };
          });
          return { ...prev, zones };
        });
      });
    },
    [ed, startTransition],
  );

  const handleSplit = useCallback(
    (v: number) =>
      startTransition(() => {
        ed.commit((p) => {
          const split = clamp(v, MIN_SPLIT, MAX_SPLIT);
          let zones = p.zones.map((z) => enforceZoneAspect(z, p.mode, split));
          zones = zones.map((z) => ({
            ...z,
            x: clamp(z.x, 0, 1 - z.width),
            y: clamp(z.y, 0, 1 - z.height),
          }));
          return { ...p, splitRatio: split, zones };
        });
      }),
    [ed, startTransition],
  );

  const resetZone = useCallback(
    (id: string) =>
      ed.commit((p) => {
        const def = createDefaultLayout(p.mode, p.splitRatio);
        const dz = def.zones.find((z) => z.id === id);
        if (!dz) return p;
        return { ...p, zones: p.zones.map((z) => (z.id === id ? dz : z)) };
      }),
    [ed],
  );

  const handleToggleLock = useCallback(
    (id: string) =>
      ed.commit((p) => ({
        ...p,
        zones: p.zones.map((zz) =>
          zz.id === id ? { ...zz, locked: !zz.locked } : zz,
        ),
      })),
    [ed],
  );

  const handleRoleChange = useCallback(
    (id: string, role: CropZone["role"]) =>
      ed.commit((p) => ({
        ...p,
        zones: p.zones.map((zz) => (zz.id === id ? { ...zz, role } : zz)),
      })),
    [ed],
  );

  const handleModeChange = useCallback(
    (v: string | null) => {
      if (!v) return;
      const mode = v as "full" | "stacked";
      const saved = loadPrefForMode(mode);
      if (saved) ed.setLayout(saved);
      else ed.setLayout(createDefaultLayout(mode, ed.layout.splitRatio));
    },
    [ed],
  );

  return {
    handleMove,
    handleResize,
    handleZoom,
    handleSplit,
    resetZone,
    handleToggleLock,
    handleRoleChange,
    handleModeChange,
  };
}
