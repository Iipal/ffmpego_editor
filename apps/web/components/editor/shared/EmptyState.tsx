// Shared empty-state building blocks. Deduped from crop / cut / mobile / bulk
// empty states (identical header + uploader card + "Local only" footnote strip).

import { Card, CardContent } from "@/components/ui/card";
import { VideoUploader } from "@/components/editor/VideoUploader";

export function EmptyStateShell({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <h2 className="text-base font-semibold leading-none tracking-normal">
          {title}
        </h2>
        <p className="max-w-prose text-sm leading-5 text-kumo-subtle">
          {description}
        </p>
      </div>
      {children}
    </div>
  );
}

export function LocalOnlyBadge() {
  return (
    <span className="inline-flex items-center gap-1.5 font-mono text-[11px] tabular-nums">
      <span className="size-1.5 rounded-full bg-kumo-success" aria-hidden />
      Local only
    </span>
  );
}

export function FootnoteDivider() {
  return (
    <span aria-hidden className="text-kumo-hairline">
      ·
    </span>
  );
}

export function UploaderCard({
  formatNote = "MP4 · WebM · MOV · MKV up to 10 GB",
  showExportsNote = true,
}: {
  formatNote?: string;
  showExportsNote?: boolean;
}) {
  return (
    <Card className="p-6 sm:p-8">
      <CardContent className="p-0">
        <VideoUploader />
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-kumo-hairline pt-4 text-xs text-kumo-subtle">
          <LocalOnlyBadge />
          <FootnoteDivider />
          <span>{formatNote}</span>
          {showExportsNote && (
            <>
              <FootnoteDivider />
              <span className="tabular-nums">Exports to ~/ffmpego_edits</span>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function DashedPreviewHint({
  icon,
  label,
  hint = "· appears after upload",
  children,
}: {
  icon: React.ReactNode;
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-dashed border-kumo-line bg-kumo-recessed p-4">
      <div className="flex items-center gap-2 text-xs font-medium text-kumo-subtle">
        {icon}
        {label}
        <span className="font-mono text-[11px] tabular-nums text-kumo-subtle/70">
          {hint}
        </span>
      </div>
      <div className="mt-3">{children}</div>
    </div>
  );
}
