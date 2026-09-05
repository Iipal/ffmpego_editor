"use client";
import PageAdmin from "../pageAdmin";
import { DirectionalTransition } from "@/components/view-transition/DirectionalTransition";

export default function AdminPage() {
  return (
    <DirectionalTransition>
      <div>
        <PageAdmin />
      </div>
    </DirectionalTransition>
  );
}
