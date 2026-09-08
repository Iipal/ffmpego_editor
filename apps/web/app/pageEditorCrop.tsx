"use client";

import { useSelector } from "@tanstack/react-store";
import { sourceStore } from "@/store/sourceSlice";
import { CropEmptyState } from "@/components/editor/crop/CropEmptyState";
import { CropEditorHeader } from "@/components/editor/crop/CropEditorHeader";
import { CropWorkspace } from "@/components/editor/crop/CropWorkspace";

const PageEditorCrop: React.FC = () => {
  const { file, mediaUrl } = useSelector(sourceStore);

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
