"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { NAV_ITEMS } from "@/components/view-transition/AppNav";
import {
  clearTrim,
  seekBy,
  setTrimInToPlayhead,
  setTrimOutToPlayhead,
  stepFrame,
  toggleMute,
  togglePlay,
} from "@/lib/playback-bus";
import { paletteStore, setPaletteOpen, togglePalette } from "./paletteStore";

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    target.isContentEditable ||
    target.closest?.('[role="textbox"], [data-slot="command-input"]') !== null
  );
}

function isInteractiveTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return target.closest?.('button, a, [role="button"], [role="tab"]') !== null;
}

/** Ordered nav hrefs mirror AppNav so `1..6` match sidebar order. */
const NAV_ORDER = NAV_ITEMS.map((item) => item.href);

/**
 * Global keyboard shortcuts. Single-key transport keys are ignored while
 * typing or when modifiers are held; ⌘K/Ctrl+K always toggles the palette.
 */
export function useGlobalShortcuts() {
  const router = useRouter();

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // ⌘K / Ctrl+K — toggle palette from anywhere (incl. inputs).
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        togglePalette();
        return;
      }
      // Leave other modified keys alone (browser/app chords).
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      // Palette open → cmdk owns the keyboard.
      if (paletteStore.state.open) return;

      const target = e.target;
      const typing = isTypingTarget(target);
      const key = e.key;

      // `?` opens the palette even from inputs (discoverability).
      if (key === "?" && !typing) {
        e.preventDefault();
        setPaletteOpen(true);
        return;
      }
      if (typing) return;

      // Number-row navigation 1..6.
      if (key >= "1" && key <= String(NAV_ORDER.length)) {
        const href = NAV_ORDER[Number(key) - 1];
        if (href) {
          e.preventDefault();
          router.push(href);
        }
        return;
      }

      // Space on buttons/links keeps its native click behavior.
      if ((key === " " || key === "Enter") && isInteractiveTarget(target)) {
        return;
      }

      switch (key) {
        case " ":
        case "k":
        case "K":
          e.preventDefault();
          togglePlay();
          break;
        case "j":
        case "J":
          seekBy(e.shiftKey ? -30 : -10);
          break;
        case "l":
        case "L":
          seekBy(e.shiftKey ? 30 : 10);
          break;
        case "ArrowLeft":
          e.preventDefault();
          if (e.shiftKey) stepFrame(-1);
          else seekBy(-5);
          break;
        case "ArrowRight":
          e.preventDefault();
          if (e.shiftKey) stepFrame(1);
          else seekBy(5);
          break;
        case ",":
          stepFrame(-1);
          break;
        case ".":
          stepFrame(1);
          break;
        case "i":
        case "I":
          setTrimInToPlayhead();
          break;
        case "o":
        case "O":
          setTrimOutToPlayhead();
          break;
        case "x":
        case "X":
          clearTrim();
          break;
        case "m":
        case "M":
          toggleMute();
          break;
        default:
          return;
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [router]);
}
