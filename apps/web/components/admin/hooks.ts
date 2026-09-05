"use client";

import { useEffect, useRef } from "react";

// useLatest + effect-event-deps helpers — advanced-use-latest, advanced-event-handler-refs
export function useLatest<T>(value: T) {
  const ref = useRef(value);
  useEffect(() => {
    ref.current = value;
  }, [value]);
  return ref;
}
