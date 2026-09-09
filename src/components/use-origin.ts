"use client";

import { useSyncExternalStore } from "react";

// The origin never changes for the life of the page, so there is nothing to
// subscribe to; the unsubscribe is a no-op.
const subscribe = () => () => {};
const clientOrigin = () => window.location.origin;
const serverOrigin = () => "";

/**
 * The page's own origin, empty until hydration completes.
 *
 * Reading `window.location.origin` during render makes the server and client
 * emit different HTML, which React reports as a hydration mismatch — and when
 * that throws, the page's interactivity never wires up. `useSyncExternalStore`
 * is the sanctioned way to read a browser value with a distinct server
 * snapshot, so the first render matches on both sides by construction.
 */
export function useOrigin() {
  return useSyncExternalStore(subscribe, clientOrigin, serverOrigin);
}
