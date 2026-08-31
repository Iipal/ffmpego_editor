"use client";
import { ViewTransition } from "react";
import PageEditorCrop from "../../pageEditorCrop";
import { DirectionalTransition } from "@/components/view-transition/DirectionalTransition";

export default function CropPage() {
  return (
    <DirectionalTransition>
      <ViewTransition name="editor-content" share="morph" default="none">
        <div>
          <PageEditorCrop />
        </div>
      </ViewTransition>
    </DirectionalTransition>
  );
}
