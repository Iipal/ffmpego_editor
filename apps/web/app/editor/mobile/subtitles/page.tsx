"use client";
import { ViewTransition } from "react";
import PageEditorSubtitles from "../../../pageEditorSubtitles";
import { DirectionalTransition } from "@/components/view-transition/DirectionalTransition";

export default function SubtitlesPage() {
  return (
    <DirectionalTransition>
      <ViewTransition name="editor-content" share="morph" default="none">
        <div>
          <PageEditorSubtitles />
        </div>
      </ViewTransition>
    </DirectionalTransition>
  );
}
