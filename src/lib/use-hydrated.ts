"use client";

import { useSyncExternalStore } from "react";

const subscribeNever = () => () => {};

/**
 * Returns a client-only value without an effect: the server snapshot is used
 * during SSR and hydration, then React re-renders with the client snapshot.
 * Avoids the setState-in-effect pattern (and its extra cascading render).
 */
export function useClientValue<T>(getClientValue: () => T, serverValue: T): T {
  return useSyncExternalStore(subscribeNever, getClientValue, () => serverValue);
}

/** True after hydration on the client, false during SSR and hydration. */
export function useHydrated(): boolean {
  return useClientValue(() => true, false);
}
