"use client";

import { useSelector } from "@tanstack/react-store";
import { sourceStore } from "@/store/sourceSlice";
import { CropEmptyState } from "@/components/editor/crop/CropEmptyState";
import { CropEditorHeader } from "@/components/editor/crop/CropEditorHeader";
import { CropWorkspace } from "@/components/editor/crop/CropWorkspace";

const PageEditorCrop: React.FC = () => {
  // rerender-derived-state / rerender-dependencies: subscribe to narrow
  // fields only (not the whole sourceStore) to avoid re-render on
  // unrelated trim/playback changes.
  const file = useSelector(sourceStore, (s) => s.file);
  const mediaUrl = useSelector(sourceStore, (s) => s.mediaUrl);

  const hasVideo = !!file && !!mediaUrl;

  if (!hasVideo) {
    return <CropEmptyState />;
  }

  return (
    <div className="flex flex-col gap-3">
      <CropEditorHeader />
      <CropWorkspace />
    </div>
  );
};

export default PageEditorCrop;
