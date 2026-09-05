"use client";
import PageEditorCut from "../../pageEditorCut";
import { DirectionalTransition } from "@/components/view-transition/DirectionalTransition";

export default function CutPage() {
  return (
    <DirectionalTransition>
      <div>
        <PageEditorCut />
      </div>
    </DirectionalTransition>
  );
}
