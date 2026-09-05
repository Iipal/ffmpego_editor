"use client";

import { useVideoState } from "@/store/useVideoStore";
import { CropEmptyState } from "@/components/editor/crop/CropEmptyState";
import { CropEditorHeader } from "@/components/editor/crop/CropEditorHeader";
import { CropWorkspace } from "@/components/editor/crop/CropWorkspace";

const PageEditorCrop: React.FC = () => {
  const { file, mediaUrl } = useVideoState() as unknown as {
    file: File | null;
    mediaUrl: string | null;
  };

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
