// Re-export of the shared pointer bus (lib/global-listener-bus).
// Kept so existing `from "./pointer-bus"` imports keep working.

export {
  ensureGlobalPointerListeners,
  globalPointerMoveHandlers,
  globalPointerUpHandlers,
  type PointerHandler,
} from "@/lib/global-listener-bus";
