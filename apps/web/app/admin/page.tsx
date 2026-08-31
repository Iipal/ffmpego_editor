"use client";
import { ViewTransition } from "react";
import PageAdmin from "../pageAdmin";
import { DirectionalTransition } from "@/components/view-transition/DirectionalTransition";

export default function AdminPage() {
  return (
    <DirectionalTransition>
      <ViewTransition name="editor-content" share="morph" default="none">
        <div>
          <PageAdmin />
        </div>
      </ViewTransition>
    </DirectionalTransition>
  );
}
