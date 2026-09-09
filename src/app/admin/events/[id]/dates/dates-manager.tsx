"use client";

import { useActionState, useState, useTransition } from "react";
import {
  addEventDate,
  addNightRun,
  deleteEventDate,
  setEventDateActive,
  updateEventDate,
} from "@/app/admin/actions";
import { FormError,
  Badge, Button, Card, EmptyState, Field, Input, SectionTitle } from "@/components/ui";
import { DateTimeField } from "@/components/date-time-field";
import { toast, useActionToast } from "@/components/toast";
import { formatMinor } from "@/lib/money";

type Night = {
  id: string;
  startsAt: number;
  endsAt: number | null;
  label: string | null;
  note: string | null;
  active: number;
  sold: number;
  grossMinor: number;
};

export function DatesManager({
  eventId,
  eventStartsAt,
  nights,
}: {
  eventId: string;
  eventStartsAt: number;
  nights: Night[];
}) {
  const [adding, setAdding] = useState<"single" | "run" | null>(null);
  const [editing, setEditing] = useState<string | null>(null);

  const totalSold = nights.reduce((n, x) => n + x.sold, 0);
  const totalGross = nights.reduce((n, x) => n + x.grossMinor, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold tracking-tight">Nights</h2>
          <p className="mt-0.5 max-w-2xl text-sm text-ink-400">
            Each night sells its own inventory — the same seat can be booked on Night 1 and
            Night 2. Buyers only see a night picker when there is more than one.
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" onClick={() => setAdding("run")}>
            Add a run of nights
          </Button>
          <Button size="sm" onClick={() => setAdding("single")}>
            Add one night
          </Button>
        </div>
      </div>

      {nights.length > 1 ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <Stat label="Nights on sale" value={nights.filter((n) => n.active).length.toString()} />
          <Stat label="Passes sold" value={totalSold.toLocaleString("en-IN")} />
          <Stat label="Gross across nights" value={formatMinor(totalGross)} />
        </div>
      ) : null}

      {adding === "run" ? <RunForm eventId={eventId} startsAt={eventStartsAt} onDone={() => setAdding(null)} /> : null}
      {adding === "single" ? <SingleForm eventId={eventId} onDone={() => setAdding(null)} /> : null}

      {nights.length === 0 ? (
        <EmptyState
          title="No nights yet"
          body="Add the dates this event runs. A one-off show needs a single night; a Navratri run takes nine."
        />
      ) : (
        <ul className="grid gap-3">
          {nights.map((n, i) => (
            <li key={n.id}>
              {editing === n.id ? (
                <EditForm night={n} eventId={eventId} onDone={() => setEditing(null)} />
              ) : (
                <Card className="flex flex-wrap items-center justify-between gap-4 p-4">
                  <div className="flex min-w-0 items-center gap-4">
                    <div className="w-14 shrink-0 rounded-lg border border-ink-700 bg-ink-850 py-1.5 text-center">
                      <span className="block text-[10px] uppercase tracking-wide text-ink-400">
                        {new Date(n.startsAt * 1000).toLocaleDateString("en-IN", { month: "short" })}
                      </span>
                      <span className="block text-lg font-semibold leading-tight">
                        {new Date(n.startsAt * 1000).getDate()}
                      </span>
                    </div>
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2 font-medium">
                        {n.label ?? `Night ${i + 1}`}
                        {!n.active ? <Badge tone="amber">not selling</Badge> : null}
                      </p>
                      <p className="text-sm text-ink-400">
                        {new Date(n.startsAt * 1000).toLocaleString("en-IN", {
                          weekday: "long",
                          day: "numeric",
                          month: "long",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                      {n.note ? <p className="mt-0.5 text-sm text-ink-500">{n.note}</p> : null}
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="tabular text-sm font-medium">{formatMinor(n.grossMinor)}</p>
                      <p className="tabular text-xs text-ink-400">
                        {n.sold.toLocaleString("en-IN")} passes
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <ActiveToggle night={n} eventId={eventId} />
                      <Button size="sm" variant="secondary" onClick={() => setEditing(n.id)}>
                        Edit
                      </Button>
                      <DeleteNight night={n} eventId={eventId} />
                    </div>
                  </div>
                </Card>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-ink-400">{label}</p>
      <p className="tabular mt-1.5 text-xl font-semibold">{value}</p>
    </Card>
  );
}

function ActiveToggle({ night, eventId }: { night: Night; eventId: string }) {
  const [pending, start] = useTransition();
  return (
    <Button
      size="sm"
      variant="ghost"
      disabled={pending}
      onClick={() =>
        start(async () => {
          await setEventDateActive(night.id, eventId, !night.active);
          toast(night.active ? "Night paused" : "Night back on sale", "info");
        })
      }
    >
      {night.active ? "Pause" : "Resume"}
    </Button>
  );
}

function DeleteNight({ night, eventId }: { night: Night; eventId: string }) {
  const [pending, start] = useTransition();
  return (
    <Button
      size="sm"
      variant="danger"
      disabled={pending || night.sold > 0}
      title={night.sold > 0 ? "Passes sold — pause it instead" : undefined}
      onClick={() =>
        start(async () => {
          try {
            await deleteEventDate(night.id, eventId);
            toast("Night removed", "ok");
          } catch (err) {
            toast(err instanceof Error ? err.message : "Could not remove it", "error");
          }
        })
      }
    >
      Delete
    </Button>
  );
}

function RunForm({
  eventId,
  startsAt,
  onDone,
}: {
  eventId: string;
  startsAt: number;
  onDone: () => void;
}) {
  const [state, action, pending] = useActionState(addNightRun, undefined);
  useActionToast(state, { ok: "Nights added" });
  if (state && "ok" in state && state.ok) queueMicrotask(onDone);

  return (
    <Card className="border-brand-200 bg-brand-50 p-5">
      <SectionTitle
        title="Add a run of nights"
        hint="Creates consecutive nights at the same time each day — nine taps become one."
      />
      <form action={action} className="space-y-4">
        <input type="hidden" name="eventId" value={eventId} />
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="sm:col-span-2">
            <DateTimeField name="startsAt" label="First night" defaultValue={startsAt} required />
          </div>
          <Field label="How many nights">
            <Input name="count" type="number" min={1} max={60} defaultValue={9} />
          </Field>
        </div>
        <Field label="Name them" hint="Each gets a number: Night 1, Night 2…">
          <Input name="prefix" defaultValue="Night" className="max-w-48" />
        </Field>
        <FormError state={state} />
        <div className="flex gap-2">
          <Button disabled={pending}>{pending ? "Adding…" : "Add nights"}</Button>
          <Button type="button" variant="ghost" onClick={onDone}>
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  );
}

function SingleForm({ eventId, onDone }: { eventId: string; onDone: () => void }) {
  const [state, action, pending] = useActionState(addEventDate, undefined);
  useActionToast(state, { ok: "Night added" });
  if (state && "ok" in state && state.ok) queueMicrotask(onDone);

  return (
    <Card className="border-brand-200 bg-brand-50 p-5">
      <SectionTitle title="Add a night" />
      <form action={action} className="space-y-4">
        <input type="hidden" name="eventId" value={eventId} />
        <DateTimeField name="startsAt" label="Starts" required />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" hint="Optional — shown on the night picker.">
            <Input name="label" placeholder="Finale night" />
          </Field>
          <Field label="Note" hint="Optional — a line buyers see when they pick it.">
            <Input name="note" placeholder="Live orchestra, gates open 6 pm" />
          </Field>
        </div>
        <FormError state={state} />
        <div className="flex gap-2">
          <Button disabled={pending}>{pending ? "Adding…" : "Add night"}</Button>
          <Button type="button" variant="ghost" onClick={onDone}>
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  );
}

function EditForm({
  night,
  eventId,
  onDone,
}: {
  night: Night;
  eventId: string;
  onDone: () => void;
}) {
  const [state, action, pending] = useActionState(updateEventDate, undefined);
  useActionToast(state, { ok: "Night updated" });
  if (state && "ok" in state && state.ok) queueMicrotask(onDone);

  return (
    <Card className="border-brand-200 bg-brand-50 p-5">
      <SectionTitle title={night.label ?? "Edit night"} />
      <form action={action} className="space-y-4">
        <input type="hidden" name="eventId" value={eventId} />
        <input type="hidden" name="dateId" value={night.id} />
        <DateTimeField name="startsAt" label="Starts" defaultValue={night.startsAt} required />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name">
            <Input name="label" defaultValue={night.label ?? ""} placeholder="Finale night" />
          </Field>
          <Field label="Note">
            <Input name="note" defaultValue={night.note ?? ""} />
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="active"
            defaultChecked={!!night.active}
            className="size-4 accent-[--color-brand-600]"
          />
          Selling this night
        </label>
        <FormError state={state} />
        <div className="flex gap-2">
          <Button disabled={pending}>{pending ? "Saving…" : "Save"}</Button>
          <Button type="button" variant="ghost" onClick={onDone}>
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  );
}
