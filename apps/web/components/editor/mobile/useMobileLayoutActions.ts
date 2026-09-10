"use client";

import { useCallback } from "react";
import { MobileLayoutService, mobileLayoutService } from "@/lib/mobile-layout";
import type { CropZone } from "@/lib/mobile-layout";
import type { MobileEditorApi } from "./useMobileEditor";

export function useMobileLayoutActions(
  ed: MobileEditorApi,
  startTransition: (fn: () => void) => void,
) {
  const { commit, setLayout } = ed;
  const layoutSplitRatio = ed.layout.splitRatio;
  const handleMove = useCallback(
    (id: string, nx: number, ny: number) => {
      startTransition(() => {
        commit((prev) => {
          const zones: CropZone[] = [];
          for (const z of prev.zones) {
            if (z.id !== id || z.locked) {
              zones.push(z);
              continue;
            }
            let x = mobileLayoutService.clamp(nx, 0, 1 - z.width);
            let y = mobileLayoutService.clamp(ny, 0, 1 - z.height);
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
    [commit, startTransition],
  );

  const handleResize = useCallback(
    (id: string, next: CropZone) => {
      startTransition(() => {
        commit((prev) => {
          const zones = prev.zones.map((z) =>
            z.id === id && !z.locked
              ? mobileLayoutService.enforceZoneAspect(
                  next,
                  prev.mode,
                  prev.splitRatio,
                )
              : z,
          );
          return { ...prev, zones };
        });
      });
    },
    [commit, startTransition],
  );

  const handleZoom = useCallback(
    (id: string, factor: number) => {
      startTransition(() => {
        commit((prev) => {
          const zones = prev.zones.map((z) => {
            if (z.id !== id || z.locked) return z;
            const zoom = mobileLayoutService.clamp(
              typeof factor === "number" ? factor : 1,
              0.5,
              3,
            );
            const baseW =
              prev.mode === "full" ? 0.316 : id === "zone-1" ? 0.32 : 0.42;
            const asp = mobileLayoutService.zoneAspect(
              prev.mode,
              prev.splitRatio,
              id as "zone-1" | "zone-2",
            );
            const sourceAR = 16 / 9;
            const w = mobileLayoutService.clamp(baseW / zoom, 0.08, 0.95);
            const h = mobileLayoutService.clamp(
              (w / asp) * sourceAR,
              0.08,
              0.95,
            );
            const x = mobileLayoutService.clamp(
              z.x + (z.width - w) / 2,
              0,
              1 - w,
            );
            const y = mobileLayoutService.clamp(
              z.y + (z.height - h) / 2,
              0,
              1 - h,
            );
            return { ...z, x, y, width: w, height: h, zoom };
          });
          return { ...prev, zones };
        });
      });
    },
    [commit, startTransition],
  );

  const handleSplit = useCallback(
    (v: number) =>
      startTransition(() => {
        commit((p) => {
          const split = mobileLayoutService.clamp(
            v,
            MobileLayoutService.MIN_SPLIT,
            MobileLayoutService.MAX_SPLIT,
          );
          let zones = p.zones.map((z) =>
            mobileLayoutService.enforceZoneAspect(z, p.mode, split),
          );
          zones = zones.map((z) => ({
            ...z,
            x: mobileLayoutService.clamp(z.x, 0, 1 - z.width),
            y: mobileLayoutService.clamp(z.y, 0, 1 - z.height),
          }));
          return { ...p, splitRatio: split, zones };
        });
      }),
    [commit, startTransition],
  );

  const resetZone = useCallback(
    (id: string) =>
      commit((p) => {
        const def = mobileLayoutService.createDefaultLayout(
          p.mode,
          p.splitRatio,
        );
        const dz = def.zones.find((z) => z.id === id);
        if (!dz) return p;
        return { ...p, zones: p.zones.map((z) => (z.id === id ? dz : z)) };
      }),
    [commit],
  );

  const handleToggleLock = useCallback(
    (id: string) =>
      commit((p) => ({
        ...p,
        zones: p.zones.map((zz) =>
          zz.id === id ? { ...zz, locked: !zz.locked } : zz,
        ),
      })),
    [commit],
  );

  const handleRoleChange = useCallback(
    (id: string, role: CropZone["role"]) =>
      commit((p) => ({
        ...p,
        zones: p.zones.map((zz) => (zz.id === id ? { ...zz, role } : zz)),
      })),
    [commit],
  );

  const handleModeChange = useCallback(
    (v: string | null) => {
      if (!v) return;
      const mode = v as "full" | "stacked";
      const saved = mobileLayoutService.loadPrefForMode(mode);
      if (saved) setLayout(saved);
      else
        setLayout(
          mobileLayoutService.createDefaultLayout(mode, layoutSplitRatio),
        );
    },
    [setLayout, layoutSplitRatio],
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
