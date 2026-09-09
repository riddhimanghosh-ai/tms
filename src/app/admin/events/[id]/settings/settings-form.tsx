"use client";

import { useActionState, useState, useTransition } from "react";
import { deleteEvent, updateEvent } from "@/app/admin/actions";
import {
  Button,
  Card,
  Field,
  FormError,
  Input,
  SectionTitle,
  Select,
  Textarea,
  cn,
} from "@/components/ui";
import { DateTimeField, DurationField } from "@/components/date-time-field";
import { SeatMap } from "@/components/seat-map";
import { useActionToast } from "@/components/toast";
import {
  STAGE_LABEL_PRESETS,
  STAGE_POSITIONS,
  STAGE_SHAPES,
  type StagePosition,
  type StageShape,
} from "@/lib/seat-layout";
import type { Event } from "@/db/schema";

/** A small stand-in layout so the stage controls have something to sit inside. */
const PREVIEW_ZONE = {
  shape: "grid" as const,
  rows: 5,
  cols: 12,
  ringCount: 0,
  ringStartSeats: 0,
  ringSeatStep: 0,
  arcSpanDeg: 360,
  arcStartDeg: 0,
  innerHolePct: 30,
  color: "#3d3852",
};

const PREVIEW_SEATS = Array.from({ length: 60 }, (_, i) => ({
  id: `p${i}`,
  label: `P${i}`,
  rowLabel: String.fromCharCode(65 + Math.floor(i / 12)),
  seatNumber: (i % 12) + 1,
  ringIndex: 0,
  posInRing: 0,
  ringSize: 0,
  x: (i % 12) + 1,
  y: Math.floor(i / 12),
  state: "available" as const,
}));

export function SettingsForm({ event }: { event: Event }) {
  const [state, action, pending] = useActionState(updateEvent, undefined);
  useActionToast(state, { ok: "Settings saved" });
  const [deleting, startDelete] = useTransition();

  const [stageLabel, setStageLabel] = useState(event.stageLabel);
  const [stagePosition, setStagePosition] = useState<StagePosition>(
    event.stagePosition as StagePosition,
  );
  const [stageShape, setStageShape] = useState<StageShape>(event.stageShape as StageShape);

  return (
    <div className="max-w-3xl space-y-6">
      <form action={action} noValidate className="space-y-6">
        <input type="hidden" name="eventId" value={event.id} />

        <Card className="space-y-5 p-5">
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

          <div className="grid gap-5 sm:grid-cols-2">
            <DateTimeField
              name="startsAt"
              label="Starts"
              defaultValue={event.startsAt}
              required
              hint="Individual nights are managed on the Nights tab."
            />
            <DurationField name="endsAt" label="Ends" startName="startsAt" defaultValue={event.endsAt} />
          </div>
          <DateTimeField
            name="doorsOpenAt"
            label="Doors open"
            defaultValue={event.doorsOpenAt}
            defaultTime="18:00"
            quickDates={false}
            hint="Optional — shown on the landing page."
          />
        </Card>

        <Card className="space-y-4 p-5">
          <SectionTitle
            title="Stage & orientation"
            hint="What the focal point is called and where it sits on every seat map."
          />

          <input type="hidden" name="stageLabel" value={stageLabel} />
          <input type="hidden" name="stagePosition" value={stagePosition} />
          <input type="hidden" name="stageShape" value={stageShape} />

          <div className="grid gap-5 lg:grid-cols-[1fr_260px]">
            <div className="space-y-4">
              <Field label="What is it called?">
                <Input
                  value={stageLabel}
                  onChange={(e) => setStageLabel(e.target.value.toUpperCase().slice(0, 14))}
                  placeholder="STAGE"
                  className="max-w-48 font-mono tracking-widest"
                />
              </Field>
              <div className="flex flex-wrap gap-1.5">
                {STAGE_LABEL_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setStageLabel(preset)}
                    className={cn(
                      "rounded-full border px-2.5 py-1 text-xs transition",
                      stageLabel === preset
                        ? "border-brand-500 bg-brand-600/15 text-brand-400"
                        : "border-ink-700 text-ink-400 hover:border-ink-600 hover:text-ink-100",
                    )}
                  >
                    {preset}
                  </button>
                ))}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Where does it sit?">
                  <Select
                    value={stagePosition}
                    onChange={(e) => setStagePosition(e.target.value as StagePosition)}
                  >
                    {STAGE_POSITIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="How is it drawn?">
                  <Select
                    value={stageShape}
                    onChange={(e) => setStageShape(e.target.value as StageShape)}
                  >
                    {STAGE_SHAPES.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
              <p className="text-xs text-ink-400">
                &ldquo;Match the layout&rdquo; puts a circle at the centre of a ringed ground and a
                bar in front of straight rows.
              </p>
            </div>

            <div className="rounded-xl border border-ink-800 bg-ink-950/60 p-3">
              <p className="mb-1 text-xs uppercase tracking-wide text-ink-400">Preview</p>
              <SeatMap
                zone={PREVIEW_ZONE}
                seats={PREVIEW_SEATS}
                mode="edit"
                theme="dark"
                stage={{ label: stageLabel, position: stagePosition, shape: stageShape }}
                maxHeight={220}
              />
            </div>
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

        <FormError state={state} />

        <div className="sticky bottom-4 flex items-center gap-3 rounded-xl border border-ink-700 bg-ink-900/95 p-3 backdrop-blur">
          <Button disabled={pending}>{pending ? "Saving…" : "Save changes"}</Button>
          <span className="text-sm text-ink-400">
            Changes go live on your booking page immediately.
          </span>
        </div>
      </form>

      <Card className="border-red-900/60 p-5">
        <SectionTitle
          title="Delete this event"
          hint="Removes the event, its nights, tickets, orders and passes. This cannot be undone."
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
