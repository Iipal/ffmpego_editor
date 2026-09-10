// Generic deduped global-listener bus: one window listener per event type fans
// out to N registered handlers (drag instances, list rows, …).
// Deduped from subtitles pointer-bus, mobile pointer sets, admin scroll/touch sets.

/** Single event callback registered on a `GlobalListenerBus`. */
export type GlobalHandler<E = Event> = (e: E) => void;

/**
 * Singleton service owning one deduped window listener per event type: N
 * registered handlers share a single `addEventListener` so drag instances,
 * list rows, and editor surfaces never stack duplicate global listeners.
 * All mutable state (handler set, attached flag) lives here, never in
 * consumers — they only `add`/`delete` through `handlers` and call
 * `ensureAttached` once before dragging.
 */
export class GlobalListenerBus<E extends Event> {
  /** Registered handlers fanned out to on every window event. */
  private readonly handlerSet = new Set<GlobalHandler<E>>();
  /** True once the window listeners have been attached (once per app load). */
  private attached = false;
  /** Window listener options (e.g. passive scroll) shared by every event. */
  private readonly options: AddEventListenerOptions | undefined;
  /** Window event names listened to (e.g. `pointermove`). */
  private readonly eventNames: string[];

  constructor(options?: AddEventListenerOptions, ...eventNames: string[]) {
    this.options = options;
    this.eventNames = eventNames;
  }

  // ------------------------------------------------------------------ public

  /**
   * Live handler set — consumers `add` on drag start and `delete` on
   * release; the bus fans every window event out to its current members.
   */
  get handlers(): Set<GlobalHandler<E>> {
    return this.handlerSet;
  }

  /**
   * Attach the window listeners (no-op when already attached or during SSR).
   * Called once before a drag session starts; safe to call repeatedly.
   */
  ensureAttached(): void {
    if (this.attached || typeof window === "undefined") return;
    this.attached = true;
    for (const name of this.eventNames) {
      window.addEventListener(name, this.dispatch, this.options);
    }
  }

  // ----------------------------------------------------------------- private

  /**
   * Stable window callback (one per bus, shared by every event name):
   * forwards the event to each currently registered handler.
   */
  private readonly dispatch = (e: Event): void => {
    for (const h of this.handlerSet) h(e as E);
  };
}

// Pointer (move/up) buses shared by drag interactions across editor features.
// Same export names as the former per-feature copies so consumers are untouched.
const moveBus = new GlobalListenerBus<PointerEvent>(undefined, "pointermove");
const upBus = new GlobalListenerBus<PointerEvent>(undefined, "pointerup");

export const globalPointerMoveHandlers = moveBus.handlers;
export const globalPointerUpHandlers = upBus.handlers;

export function ensureGlobalPointerListeners() {
  moveBus.ensureAttached();
  upBus.ensureAttached();
}

export type PointerHandler = GlobalHandler<PointerEvent>;
