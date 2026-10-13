"use client";

import { useSyncExternalStore } from "react";

function subscribe(onChange: () => void): () => void {
  const timer = setInterval(onChange, 30_000);
  return () => clearInterval(timer);
}

/**
 * The current minute as a number, or null while rendering on the server.
 * Opening-hours labels depend on "now", so they are only filled in on the visitor's device.
 */
export function useBusinessMinute(): number | null {
  return useSyncExternalStore(
    subscribe,
    () => Math.floor(Date.now() / 60_000),
    () => null,
  );
}
