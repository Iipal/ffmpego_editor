export default function Loading() {
  return (
    <div
      className="flex flex-col gap-6"
      aria-busy="true"
      aria-label="Loading editor"
    >
      <div className="h-10 rounded-lg bg-kumo-recessed animate-pulse border border-kumo-hairline" />
      <div className="aspect-video rounded-lg bg-kumo-recessed animate-pulse border border-kumo-hairline" />
      <div className="h-32 rounded-lg bg-kumo-recessed animate-pulse border border-kumo-hairline" />
    </div>
  );
}
