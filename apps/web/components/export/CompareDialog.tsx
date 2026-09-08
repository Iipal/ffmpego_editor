"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  closeComparison,
  useCompareStore,
} from "@/store/compareSlice";

/** Global side-by-side source vs render comparison, opened on export success. */
export function CompareDialog() {
  const state = useCompareStore();
  return (
    <Dialog
      open={state.open}
      onOpenChange={(open) => {
        if (!open) closeComparison();
      }}
    >
      <DialogContent className="max-w-[calc(100%-2rem)] sm:max-w-7xl">
        <DialogHeader>
          <DialogTitle
            className="truncate text-base font-semibold"
            title={state.title}
          >
            {state.title}
          </DialogTitle>
          {state.meta ? <DialogDescription>{state.meta}</DialogDescription> : null}
        </DialogHeader>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <p className="text-xs font-semibold tracking-wide text-kumo-subtle uppercase">
              Source
            </p>
            {state.sourceUrl ? (
              <div className="flex h-[36vh] items-center justify-center overflow-hidden rounded-md bg-black md:h-[52vh]">
                <video
                  src={state.sourceUrl}
                  controls
                  playsInline
                  autoPlay
                  muted
                  loop
                  className="h-full w-full object-contain"
                />
              </div>
            ) : (
              <div className="flex h-[36vh] items-center justify-center rounded-md bg-black p-4 text-center md:h-[52vh]">
                <p className="text-xs text-kumo-subtle">
                  Source preview unavailable (load the file again to compare).
                </p>
              </div>
            )}
          </div>
          <div className="space-y-2">
            <p className="text-xs font-semibold tracking-wide text-kumo-subtle uppercase">
              Output
            </p>
            <div className="flex h-[36vh] items-center justify-center overflow-hidden rounded-md bg-black md:h-[52vh]">
              {state.outputUrl && state.outputKind === "video" ? (
                <video
                  src={state.outputUrl}
                  controls
                  playsInline
                  autoPlay
                  muted
                  loop
                  className="h-full w-full object-contain"
                />
              ) : null}
              {state.outputUrl && state.outputKind === "image" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={state.outputUrl}
                  alt="Render output"
                  className="h-full w-full object-contain"
                />
              ) : null}
              {state.outputUrl && state.outputKind === "audio" ? (
                <audio src={state.outputUrl} controls className="w-full px-4" />
              ) : null}
            </div>
          </div>
        </div>
        <div className="flex justify-end">
          <Button variant="outline" onClick={closeComparison}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
