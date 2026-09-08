"use client";

import { useActionState, useState } from "react";
import { createEvent } from "../../actions";
import { Button, Card, Field, Input, cn } from "@/components/ui";

const layouts = [
  {
    value: "open",
    title: "Open ground",
    body: "No seat numbers. You define priced categories — VIP, Gold, General, Couple — each with a capacity.",
    note: "Most Garba grounds, fairs, club nights.",
  },
  {
    value: "seated",
    title: "Reserved seating",
    body: "Buyers pick an exact seat from a grid you lay out, row by row, per block.",
    note: "Auditoriums, concerts, ticketed shows.",
  },
];

export default function NewEventPage() {
  const [state, action, pending] = useActionState(createEvent, undefined);
  const [layout, setLayout] = useState("open");

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-xl font-semibold tracking-tight">Create an event</h1>
      <p className="mt-1 text-sm text-ink-400">
        The essentials only — you can fill in the rest afterwards.
      </p>

      <form action={action} className="mt-6 space-y-6">
        <Card className="space-y-4 p-5">
          <Field label="Event name">
            <Input name="title" placeholder="Navratri Nights 2026" required autoFocus />
          </Field>
          <Field label="One-line tagline" hint="Shows under the title on your booking page.">
            <Input name="tagline" placeholder="9 nights. Live dhol. Ahmedabad's biggest ground." />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Venue">
              <Input name="venue" placeholder="Sardar Patel Ground" />
            </Field>
            <Field label="City">
              <Input name="city" placeholder="Ahmedabad" />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Starts">
              <Input name="startsAt" type="datetime-local" required />
            </Field>
            <Field label="Ends" hint="Optional — for multi-night events.">
              <Input name="endsAt" type="datetime-local" />
            </Field>
          </div>
        </Card>

        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-400">
            How are people admitted?
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {layouts.map((l) => (
              <label
                key={l.value}
                className={cn(
                  "cursor-pointer rounded-[--radius-card] border p-4 transition",
                  layout === l.value
                    ? "border-brand-500 bg-brand-600/10"
                    : "border-ink-700 bg-ink-900/60 hover:border-ink-600",
                )}
              >
                <input
                  type="radio"
                  name="layoutType"
                  value={l.value}
                  checked={layout === l.value}
                  onChange={() => setLayout(l.value)}
                  className="sr-only"
                />
                <p className="font-medium">{l.title}</p>
                <p className="mt-1 text-sm text-ink-400">{l.body}</p>
                <p className="mt-2 text-xs text-ink-500">{l.note}</p>
              </label>
            ))}
          </div>
        </div>

        {state && "error" in state && state.error ? (
          <p className="rounded-lg border border-red-900 bg-red-950 px-3 py-2 text-sm text-red-200">
            {state.error}
          </p>
        ) : null}

        <Button size="lg" disabled={pending}>
          {pending ? "Creating…" : "Create and add tickets"}
        </Button>
      </form>
    </div>
  );
}
