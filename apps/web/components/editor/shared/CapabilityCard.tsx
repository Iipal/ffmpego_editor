// Shared capability card for editor empty states.
// (Single copy; was identical in crop + mobile.)

export function CapabilityCard({
  icon: Icon,
  title,
  desc,
  meta,
}: {
  icon: React.ElementType;
  title: string;
  desc: string;
  meta: string;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-kumo-hairline bg-kumo-recessed p-4">
      <div className="flex items-center gap-2">
        <span className="inline-flex size-7 items-center justify-center rounded-md border border-kumo-line bg-kumo-base text-kumo-subtle">
          <Icon className="size-3.5" aria-hidden />
        </span>
        <h3 className="text-sm font-medium leading-none">{title}</h3>
      </div>
      <p className="text-xs leading-5 text-kumo-subtle">{desc}</p>
      <span className="font-mono text-[11px] leading-none text-kumo-subtle/80 tabular-nums">
        {meta}
      </span>
    </div>
  );
}
