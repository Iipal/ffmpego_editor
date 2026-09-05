"use client";
import PageEditorSubtitles from "../../../pageEditorSubtitles";
import { DirectionalTransition } from "@/components/view-transition/DirectionalTransition";

export default function SubtitlesPage() {
  return (
    <DirectionalTransition>
      <div>
        <PageEditorSubtitles />
      </div>
    </DirectionalTransition>
  );
}
