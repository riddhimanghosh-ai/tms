"use client";

import { useActionState, useTransition } from "react";
import { deleteEvent, updateEvent } from "@/app/admin/actions";
import { Button, Card, Field, Input, SectionTitle, Textarea } from "@/components/ui";
import type { Event } from "@/db/schema";

/** datetime-local wants a local-time string, not an ISO/UTC one. */
function toLocalInput(ts: number | null) {
  if (!ts) return "";
  const d = new Date(ts * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function SettingsForm({ event }: { event: Event }) {
  const [state, action, pending] = useActionState(updateEvent, undefined);
  const [deleting, startDelete] = useTransition();

  return (
    <div className="max-w-3xl space-y-6">
      <form action={action} className="space-y-6">
        <input type="hidden" name="eventId" value={event.id} />

        <Card className="space-y-4 p-5">
          <SectionTitle title="Event details" hint="Everything here shows on the public booking page." />
          <Field label="Event name">
            <Input name="title" defaultValue={event.title} required />
          </Field>
          <Field label="Tagline">
            <Input name="tagline" defaultValue={event.tagline ?? ""} />
          </Field>
          <Field label="Description">
            <Textarea name="description" defaultValue={event.description ?? ""} className="min-h-28" />
          </Field>
          <Field label="Cover image URL" hint="Any hosted image. Shown as the page banner.">
            <Input name="coverImageUrl" defaultValue={event.coverImageUrl ?? ""} placeholder="https://…" />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Venue">
              <Input name="venue" defaultValue={event.venue ?? ""} />
            </Field>
            <Field label="City">
              <Input name="city" defaultValue={event.city ?? ""} />
            </Field>
          </div>
          <Field label="Full address">
            <Input name="address" defaultValue={event.address ?? ""} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Starts">
              <Input name="startsAt" type="datetime-local" defaultValue={toLocalInput(event.startsAt)} required />
            </Field>
            <Field label="Ends">
              <Input name="endsAt" type="datetime-local" defaultValue={toLocalInput(event.endsAt)} />
            </Field>
            <Field label="Doors open">
              <Input name="doorsOpenAt" type="datetime-local" defaultValue={toLocalInput(event.doorsOpenAt)} />
            </Field>
          </div>
        </Card>

        <Card className="space-y-4 p-5">
          <SectionTitle
            title="Fees and limits"
            hint="Convenience fees are added on top of the ticket price at checkout."
          />
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Convenience fee (%)">
              <Input
                name="bookingFeePct"
                type="number"
                step="0.1"
                min={0}
                defaultValue={event.bookingFeeBps / 100}
              />
            </Field>
            <Field label="Flat fee per ticket (₹)">
              <Input
                name="bookingFeeFlat"
                type="number"
                min={0}
                defaultValue={event.bookingFeeFlatMinor / 100}
              />
            </Field>
            <Field label="Max tickets per order">
              <Input name="maxTicketsPerOrder" type="number" min={1} defaultValue={event.maxTicketsPerOrder} />
            </Field>
          </div>
          <Field label="Gate PIN" hint="Staff type this to open the scanner without a full login.">
            <Input name="gatePin" defaultValue={event.gatePin ?? ""} className="max-w-32 font-mono" />
          </Field>
          <Field label="Terms shown at checkout">
            <Textarea
              name="terms"
              defaultValue={event.terms ?? ""}
              placeholder="Entry only with a valid QR pass. No refunds. Right of admission reserved."
            />
          </Field>
        </Card>

        <div className="flex items-center gap-3">
          <Button disabled={pending}>{pending ? "Saving…" : "Save changes"}</Button>
          {state && "ok" in state && state.ok ? (
            <span className="text-sm text-emerald-400">Saved ✓</span>
          ) : null}
        </div>
      </form>

      <Card className="border-red-900/60 p-5">
        <SectionTitle
          title="Delete this event"
          hint="Removes the event, its tickets, orders and passes. This cannot be undone."
        />
        <Button
          variant="danger"
          disabled={deleting}
          onClick={() => {
            if (confirm(`Delete "${event.title}" and all of its orders?`)) {
              startDelete(() => void deleteEvent(event.id));
            }
          }}
        >
          {deleting ? "Deleting…" : "Delete event"}
        </Button>
      </Card>
    </div>
  );
}
