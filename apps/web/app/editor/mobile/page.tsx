"use client";
import PageEditorMobile from "../../pageEditorMobile";
import { DirectionalTransition } from "@/components/view-transition/DirectionalTransition";

export default function MobilePage() {
  return (
    <DirectionalTransition>
      <div>
        <PageEditorMobile />
      </div>
    </DirectionalTransition>
  );
}
