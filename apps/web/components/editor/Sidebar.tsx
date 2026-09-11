"use client";

import { PanelRightClose, PanelRightOpen } from "lucide-react";
import { useSelector } from "@tanstack/react-store";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ChevronDown } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { sourceStore } from "@/store/sourceSlice";
import { cutStore, setCutState } from "@/store/cutSlice";
import { UploadProgress } from "@/components/editor/UploadProgress";
import { VisualFiltersPanel } from "@/components/editor/VisualFiltersPanel";
import { SidebarCropCard } from "@/components/editor/crop/SidebarCropCard";
import { SidebarExportCard } from "@/components/editor/crop/SidebarExportCard";
import { SidebarInfoCard } from "@/components/editor/crop/SidebarInfoCard";
import { SidebarSpeedCard } from "@/components/editor/crop/SidebarSpeedCard";

export function SidebarToggle() {
  const isSidebarOpen = useSelector(cutStore, (state) => state.isSidebarOpen);
  const label = isSidebarOpen ? "Hide sidebar" : "Show sidebar";

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            size="icon-xs"
            variant="ghost"
            aria-label={label}
            onClick={() =>
              setCutState((previous) => ({
                ...previous,
                isSidebarOpen: !previous.isSidebarOpen,
              }))
            }
          />
        }
      >
        {isSidebarOpen ? <PanelRightClose /> : <PanelRightOpen />}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

/**
 * Crop sidebar composer. Each card below subscribes only to the store
 * slice(s) it renders — canvas/crop drags no longer re-render the export
 * form (the old `{...source,...crop,...cut}` merge did).
 */
export function Sidebar() {
  const uploadStatus = useSelector(sourceStore, (s) => s.uploadStatus);

  return (
    <aside className="flex flex-col gap-3">
      {(uploadStatus === "uploading" || uploadStatus === "error") && (
        <UploadProgress />
      )}
      <SidebarInfoCard />
      <SidebarCropCard />
      <SidebarSpeedCard />
      <Card className="p-4 rounded-lg">
        <Collapsible>
          <CollapsibleTrigger className="flex w-full items-center justify-between text-xs font-semibold tracking-normal">
            Filters <ChevronDown className="size-4 text-kumo-subtle" />
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-4 pt-3">
            <VisualFiltersPanel />
          </CollapsibleContent>
        </Collapsible>
      </Card>
      <SidebarExportCard />
    </aside>
  );
}
