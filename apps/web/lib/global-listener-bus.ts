// Generic deduped global-listener bus: one window listener per event type fans
// out to N registered handlers (drag instances, list rows, …).
// Deduped from subtitles pointer-bus, mobile pointer sets, admin scroll/touch sets.

export type GlobalHandler<E = Event> = (e: E) => void;

export function createGlobalListenerBus<E extends Event>(
  options?: AddEventListenerOptions,
  ...eventNames: string[]
) {
  const handlers = new Set<GlobalHandler<E>>();
  let attached = false;

  function ensureAttached() {
    if (attached || typeof window === "undefined") return;
    attached = true;
    for (const name of eventNames) {
      window.addEventListener(
        name,
        (e) => {
          for (const h of handlers) h(e as E);
        },
        options,
      );
    }
  }

  return { handlers, ensureAttached };
}

// Pointer (move/up) bus shared by drag interactions across editor features.
// Same export names as the former per-feature copies so consumers are untouched.
const moveBus = createGlobalListenerBus<PointerEvent>(undefined, "pointermove");
const upBus = createGlobalListenerBus<PointerEvent>(undefined, "pointerup");

export const globalPointerMoveHandlers = moveBus.handlers;
export const globalPointerUpHandlers = upBus.handlers;

export function ensureGlobalPointerListeners() {
  moveBus.ensureAttached();
  upBus.ensureAttached();
}

export type PointerHandler = GlobalHandler<PointerEvent>;
