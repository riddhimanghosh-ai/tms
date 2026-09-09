"use client";

import { useEffect, useState } from "react";

/**
 * The page's own origin, read after mount.
 *
 * Reading `window.location.origin` during render makes the server and client
 * produce different HTML, and React reports that as a hydration mismatch —
 * which, when it throws, leaves the page's interactivity unwired. Returning an
 * empty string on the first pass keeps both renders identical.
 */
export function useOrigin() {
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);
  return origin;
}
