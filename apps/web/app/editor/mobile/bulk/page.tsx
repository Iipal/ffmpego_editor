"use client";
import { ViewTransition } from "react";
import PageEditorMobileBulk from "../../../pageEditorMobileBulk";
import { DirectionalTransition } from "@/components/view-transition/DirectionalTransition";

export default function MobileBulkPage() {
  return (
    <DirectionalTransition>
      <ViewTransition name="editor-content" share="morph" default="none">
        <div>
          <PageEditorMobileBulk />
        </div>
      </ViewTransition>
    </DirectionalTransition>
  );
}
