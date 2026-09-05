import { Card } from "@/components/ui/card";
import { VideoUploader } from "@/components/editor/VideoUploader";

// rendering-hoist-jsx: static elements created once
export const NoVideoPlaceholderCard = (
  <Card className="p-6">
    <h2 className="text-base font-semibold">Subtitles Editor</h2>
    <p className="text-sm text-kumo-subtle mt-1">
      Create, edit and style subtitles over your 9:16 mobile preview. Uses the
      same crop layout as Mobile editor.
    </p>
    <div className="mt-6">
      <VideoUploader />
    </div>
  </Card>
);

export const NoVideoPreviewSkeleton = (
  <Card className="p-4 opacity-60">
    <div className="grid md:grid-cols-2 gap-4">
      <div className="aspect-video rounded-lg bg-kumo-recessed flex items-center justify-center text-xs">
        Video preview
      </div>
      <div className="aspect-9/16 w-40 mx-auto rounded-lg bg-kumo-recessed flex items-center justify-center text-xs">
        9:16 Preview
      </div>
    </div>
  </Card>
);

export const EmptySubtitleListPlaceholder = (
  <p className="text-xs text-kumo-subtle text-center py-6 border border-dashed rounded-lg">
    No subtitles yet
  </p>
);

export const NoSelectionCard = (
  <Card className="p-6 text-center">
    <p className="text-xs text-kumo-subtle">
      Select a subtitle to edit its style, position and timing. Changes appear
      live in the preview.
    </p>
  </Card>
);
