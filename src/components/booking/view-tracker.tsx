"use client";

import { useEffect, useRef } from "react";
import { trackView } from "@/app/e/actions";

/** Counts one landing-page view per mount, so conversion rate has a denominator. */
export function ViewTracker({
  eventId,
  source,
  referral,
}: {
  eventId: string;
  source: string;
  referral: string | null;
}) {
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    void trackView(eventId, source, referral);
  }, [eventId, source, referral]);
  return null;
}
