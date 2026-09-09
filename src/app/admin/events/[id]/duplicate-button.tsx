"use client";

import { useTransition } from "react";
import { duplicateEvent } from "../../actions";
import { Button } from "@/components/ui";
import { toast } from "@/components/toast";

export function DuplicateButton({ eventId, title }: { eventId: string; title: string }) {
  const [pending, start] = useTransition();

  return (
    <Button
      variant="secondary"
      disabled={pending}
      title="Copy this event's ticket types, seat layouts and codes into a new draft"
      onClick={() => {
        if (!confirm(`Create a draft copy of "${title}" with the same tickets and codes?`)) return;
        toast("Copying event…", "info");
        start(() => void duplicateEvent(eventId));
      }}
    >
      {pending ? "Copying…" : "Duplicate"}
    </Button>
  );
}
