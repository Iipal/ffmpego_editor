"use client";
import PageEditorMobileBulk from "../../../pageEditorMobileBulk";
import { DirectionalTransition } from "@/components/view-transition/DirectionalTransition";

export default function MobileBulkPage() {
  return (
    <DirectionalTransition>
      <div>
        <PageEditorMobileBulk />
      </div>
    </DirectionalTransition>
  );
}
