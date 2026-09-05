"use client";

import {
  EmptyStateShell,
  UploaderCard,
} from "../shared/EmptyState";

export function CutEmptyState() {
  return (
    <EmptyStateShell
      title="Cut editor"
      description="Cut multiple parts of the video and render them as one file. Full-size keeps the original resolution, or reframe to 9:16 with the Mobile zones."
    >
      <UploaderCard showExportsNote={false} />
    </EmptyStateShell>
  );
}
