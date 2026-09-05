import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Stable default for optional callbacks. (Single copy; was in admin/mobile/subtitles.)
export const NOOP = () => {};
