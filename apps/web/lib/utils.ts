export { cn } from "@repo/ui";

// Stable default for optional callbacks. (Single copy; was in admin/mobile/subtitles.)
export const NOOP = () => {};

// First value of a slider `onValueChange` payload (base-ui always passes an
// array; the scalar branch is defensive). Single copy; was copy-pasted in
// every slider handler.
export function readSliderValue(v: number | readonly number[]): number {
  return typeof v === "number" ? v : (v[0] ?? 0);
}
