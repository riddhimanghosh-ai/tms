"use client";

import { useTransition } from "react";
import { setEventStatus } from "../../actions";
import { Select } from "@/components/ui";
import { toast } from "@/components/toast";

export function StatusControl({
  eventId,
  status,
}: {
  eventId: string;
  status: string;
}) {
  const [pending, start] = useTransition();

  return (
    <Select
      aria-label="Event status"
      value={status}
      disabled={pending}
      onChange={(e) => {
        const next = e.target.value;
        start(async () => {
          await setEventStatus(eventId, next);
          toast(
            next === "published"
              ? "Live — your booking page is now selling"
              : `Status set to ${next}`,
            next === "published" ? "ok" : "info",
          );
        });
      }}
      className="h-10 w-auto"
    >
      <option value="draft">Draft — hidden</option>
      <option value="published">Published — selling</option>
      <option value="paused">Paused — sales off</option>
      <option value="closed">Closed</option>
    </Select>
  );
}
