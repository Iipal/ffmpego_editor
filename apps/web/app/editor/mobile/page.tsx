"use client";
import { ViewTransition } from "react";
import PageEditorMobile from "../../pageEditorMobile";
import { DirectionalTransition } from "@/components/view-transition/DirectionalTransition";

export default function MobilePage() {
  return (
    <DirectionalTransition>
      <ViewTransition name="editor-content" share="morph" default="none">
        <div>
          <PageEditorMobile />
        </div>
      </ViewTransition>
    </DirectionalTransition>
  );
}
