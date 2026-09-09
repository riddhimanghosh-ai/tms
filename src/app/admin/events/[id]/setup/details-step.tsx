"use client";

import { useActionState } from "react";
import { updateEvent } from "@/app/admin/actions";
import { Button, Card, Field, FormError, Input, Textarea } from "@/components/ui";
import { DateTimeField } from "@/components/date-time-field";
import { HighlightsEditor } from "@/components/highlights-editor";
import { useActionToast } from "@/components/toast";
import { parseHighlights } from "@/lib/highlights";
import type { Event } from "@/db/schema";

export function DetailsStep({ event }: { event: Event }) {
  const [state, action, pending] = useActionState(updateEvent, undefined);
  useActionToast(state, { ok: "Details saved" });

  return (
    <form action={action} noValidate className="space-y-5">
      <input type="hidden" name="eventId" value={event.id} />
      <input type="hidden" name="highlightsSection" value="1" />
      <input type="hidden" name="listingSection" value="1" />

      <Card className="space-y-4 p-5">
        <Field label="Event name">
          <Input name="title" defaultValue={event.title} required />
        </Field>
        <Field label="Tagline" hint="One line under the title. This is the hook.">
          <Input
            name="tagline"
            defaultValue={event.tagline ?? ""}
            placeholder="9 nights. Live dhol. Ahmedabad's biggest ground."
          />
        </Field>
        <Field label="About this event">
          <Textarea
            name="description"
            defaultValue={event.description ?? ""}
            className="min-h-32"
            placeholder="What happens, who's playing, what's included, dress code…"
          />
        </Field>
        <Field label="Cover image URL" hint="Any hosted image. It becomes the page banner.">
          <Input name="coverImageUrl" defaultValue={event.coverImageUrl ?? ""} placeholder="https://…" />
        </Field>
      </Card>

      <Card className="space-y-4 p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Venue">
            <Input name="venue" defaultValue={event.venue ?? ""} placeholder="Sardar Patel Ground" />
          </Field>
          <Field label="City">
            <Input name="city" defaultValue={event.city ?? ""} placeholder="Ahmedabad" />
          </Field>
        </div>
        <Field label="Full address" hint="Used for the Maps link on the landing page.">
          <Input name="address" defaultValue={event.address ?? ""} />
        </Field>
        <DateTimeField name="startsAt" label="Starts" defaultValue={event.startsAt} required />
      </Card>

      <Card className="space-y-3 p-5">
        <div>
          <p className="text-sm font-medium">Highlights</p>
          <p className="mt-0.5 text-sm text-ink-400">
            The icon row buyers see before they read anything — Live Music, Food Stalls,
            Special Artists.
          </p>
        </div>
        <HighlightsEditor initial={parseHighlights(event.highlights)} />
      </Card>

      <Card className="p-5">
        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            name="listPublicly"
            defaultChecked={event.listPublicly === 1}
            className="mt-0.5 size-4 accent-[--color-brand-600]"
          />
          <span>
            <span className="font-medium">List on the Rasana marketplace</span>
            <span className="mt-1 block text-sm text-ink-400">
              Off, the event keeps its own landing page and embed — it just won&apos;t show up
              for people browsing. Use that for private or invite-only nights.
            </span>
          </span>
        </label>
      </Card>

      <FormError state={state} />

      <Button disabled={pending}>{pending ? "Saving…" : "Save details"}</Button>
    </form>
  );
}
