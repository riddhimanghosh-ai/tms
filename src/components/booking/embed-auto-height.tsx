"use client";

import { useEffect } from "react";

/**
 * Reports the document height to the host page so embed.js can size the
 * iframe without an inner scrollbar.
 */
export function EmbedAutoHeight() {
  useEffect(() => {
    if (window.parent === window) return;

    const post = () =>
      window.parent.postMessage(
        { type: "gathara:height", height: document.documentElement.scrollHeight },
        "*",
      );

    post();
    const observer = new ResizeObserver(post);
    observer.observe(document.documentElement);
    return () => observer.disconnect();
  }, []);

  return null;
}
