"use client";
import PageEditorCrop from "../../pageEditorCrop";
import { DirectionalTransition } from "@/components/view-transition/DirectionalTransition";

export default function CropPage() {
  return (
    <DirectionalTransition>
      <div>
        <PageEditorCrop />
      </div>
    </DirectionalTransition>
  );
}
