"use client";

import { useActionState, useState } from "react";
import { createEvent } from "../../actions";
import { ShapePreview } from "@/components/seat-map";
import { DateTimeField, DurationField } from "@/components/date-time-field";
import { useActionToast } from "@/components/toast";
import { Button, Card, Field, FormError, Input, cn } from "@/components/ui";
import type { ZoneShape } from "@/lib/seat-layout";

type Template = {
  value: string;
  shape: ZoneShape;
  title: string;
  body: string;
  bestFor: string;
  preview: {
    rows: number;
    cols: number;
    ringCount: number;
    ringStartSeats: number;
    ringSeatStep: number;
    arcSpanDeg: number;
    arcStartDeg: number;
    innerHolePct: number;
  };
};

const templates: Template[] = [
  {
    value: "open",
    shape: "rings",
    title: "Open ground",
    body: "No seat numbers. You set priced categories with a capacity each — VIP, Gold, General, Couple.",
    bestFor: "Garba grounds, fairs, club nights",
    preview: {
      rows: 0, cols: 0, ringCount: 7, ringStartSeats: 16, ringSeatStep: 10,
      arcSpanDeg: 360, arcStartDeg: 0, innerHolePct: 10,
    },
  },
  {
    value: "grid",
    shape: "grid",
    title: "Rows & blocks",
    body: "Straight numbered rows. Buyers pick an exact seat from a grid you lay out per block.",
    bestFor: "Auditoriums, halls, stands",
    preview: {
      rows: 7, cols: 12, ringCount: 0, ringStartSeats: 0, ringSeatStep: 0,
      arcSpanDeg: 360, arcStartDeg: 0, innerHolePct: 0,
    },
  },
  {
    value: "rings",
    shape: "rings",
    title: "Concentric rings",
    body: "Circles inside circles around a centre. Add as many layers as you need and price each ring differently.",
    bestFor: "In-the-round grounds, akhada, centre stage",
    preview: {
      rows: 0, cols: 0, ringCount: 6, ringStartSeats: 12, ringSeatStep: 6,
      arcSpanDeg: 360, arcStartDeg: 0, innerHolePct: 32,
    },
  },
  {
    value: "arc",
    shape: "arc",
    title: "Curved arc",
    body: "Layers that fan around a stage instead of closing into a circle. Set how wide the sweep opens.",
    bestFor: "Amphitheatres, open-air stages",
    preview: {
      rows: 0, cols: 0, ringCount: 6, ringStartSeats: 14, ringSeatStep: 7,
      arcSpanDeg: 200, arcStartDeg: 260, innerHolePct: 30,
    },
  },
];

export default function NewEventPage() {
  const [state, action, pending] = useActionState(createEvent, undefined);
  useActionToast(state, { ok: "Event created" });
  const [layout, setLayout] = useState("open");

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-xl font-semibold tracking-tight">Create an event</h1>
      <p className="mt-1 text-sm text-ink-400">
        The essentials only. Pricing, codes and the rest come next.
      </p>

      <form action={action} noValidate className="mt-6 space-y-8">
        <section>
          <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-ink-400">
            1 · The basics
          </h2>
          <Card className="space-y-4 p-5">
            <Field label="Event name">
              <Input name="title" placeholder="Navratri Nights 2026" required autoFocus />
            </Field>
            <Field label="One-line tagline" hint="Sits under the title on your booking page.">
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
            <div className="grid gap-5 sm:grid-cols-2">
              <DateTimeField name="startsAt" label="Starts" required />
              <DurationField
                name="endsAt"
                label="Ends"
                startName="startsAt"
                hint="Optional. Add the other nights afterwards on the Nights tab."
              />
            </div>
          </Card>
        </section>

        <section>
          <h2 className="mb-1 text-xs font-medium uppercase tracking-wide text-ink-400">
            2 · How is the venue laid out?
          </h2>
          <p className="mb-3 text-sm text-ink-400">
            This sets up your first block. You can change the shape, add more blocks, or mix
            shapes in one event afterwards.
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            {templates.map((t) => {
              const active = layout === t.value;
              return (
                <label
                  key={t.value}
                  className={cn(
                    "group relative cursor-pointer rounded-[--radius-card] border p-4 transition",
                    active
                      ? "border-brand-500 bg-brand-600/10"
                      : "border-ink-700 bg-ink-900/60 hover:border-ink-600",
                  )}
                >
                  <input
                    type="radio"
                    name="venueLayout"
                    value={t.value}
                    checked={active}
                    onChange={() => setLayout(t.value)}
                    className="sr-only"
                  />

                  <div className="flex items-start gap-4">
                    <span
                      className={cn(
                        "shrink-0 rounded-xl p-1.5 transition",
                        active ? "bg-brand-600/15" : "bg-ink-950/60",
                      )}
                    >
                      <ShapePreview
                        shape={t.shape}
                        size={74}
                        color={active ? "#fb6f8f" : "#4a4460"}
                        config={{ ...t.preview, shape: t.shape, color: "#fff" }}
                      />
                    </span>
                    <span className="min-w-0">
                      <span className="flex items-center gap-2 font-medium">
                        {t.title}
                        {active ? (
                          <span className="grid size-4 place-items-center rounded-full bg-brand-600 text-[10px] text-white">
                            ✓
                          </span>
                        ) : null}
                      </span>
                      <span className="mt-1 block text-sm leading-relaxed text-ink-400">
                        {t.body}
                      </span>
                      <span className="mt-2 block text-xs text-ink-500">{t.bestFor}</span>
                    </span>
                  </div>
                </label>
              );
            })}
          </div>

          <p className="mt-3 rounded-lg border border-ink-800 bg-ink-900/60 px-3 py-2 text-sm text-ink-400">
            {layout === "open"
              ? "Buyers will choose a category and a quantity. Nobody picks a seat."
              : "Buyers will tap an exact seat on a map you control, seat by seat."}
          </p>
        </section>

        <FormError state={state} />

        <div className="flex items-center gap-3">
          <Button size="lg" disabled={pending}>
            {pending ? "Creating…" : "Create and set up tickets"}
          </Button>
          <span className="text-sm text-ink-500">
            Starts as a draft — nothing goes live until you publish.
          </span>
        </div>
      </form>
    </div>
  );
}
