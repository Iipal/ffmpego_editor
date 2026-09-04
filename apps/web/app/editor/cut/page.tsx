"use client";
import { ViewTransition } from "react";
import PageEditorCut from "../../pageEditorCut";
import { DirectionalTransition } from "@/components/view-transition/DirectionalTransition";

export default function CutPage() {
  return (
    <DirectionalTransition>
      <ViewTransition name="editor-content" share="morph" default="none">
        <div>
          <PageEditorCut />
        </div>
      </ViewTransition>
    </DirectionalTransition>
  );
}
