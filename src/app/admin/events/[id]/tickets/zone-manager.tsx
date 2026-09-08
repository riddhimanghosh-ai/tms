"use client";

import { useActionState, useState, useTransition } from "react";
import { deleteZone, saveZone, toggleSeatBlock } from "@/app/admin/actions";
import {
  Badge,
  Button,
  Card,
  Field,
  Input,
  SectionTitle,
  Textarea,
  cn,
} from "@/components/ui";
import { formatMinor } from "@/lib/money";

type ZoneRow = {
  id: string;
  name: string;
  description: string | null;
  priceMinor: number;
  compareAtMinor: number | null;
  capacity: number;
  capacityResolved: number;
  admitsCount: number;
  minPerOrder: number;
  maxPerOrder: number;
  color: string;
  rows: number;
  cols: number;
  active: number;
  sortOrder: number;
  sold: number;
};

type SeatRow = {
  id: string;
  zoneId: string;
  label: string;
  rowLabel: string;
  seatNumber: number;
  status: string;
};

const swatches = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#9085e9"];

export function ZoneManager({
  event,
  zones,
  seats,
}: {
  event: { id: string; layoutType: string; currency: string };
  zones: ZoneRow[];
  seats: SeatRow[];
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const seated = event.layoutType === "seated";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold tracking-tight">
            {seated ? "Seating blocks" : "Ticket categories"}
          </h2>
          <p className="mt-0.5 text-sm text-ink-400">
            {seated
              ? "Lay out each block as a grid of rows and seats. Buyers pick their exact seat."
              : "Open ground — each category is a price and a capacity. No seat numbers."}
          </p>
        </div>
        <Button size="sm" onClick={() => setEditing("new")}>
          Add {seated ? "block" : "category"}
        </Button>
      </div>

      {editing ? (
        <ZoneForm
          event={event}
          zone={editing === "new" ? null : zones.find((z) => z.id === editing)!}
          onDone={() => setEditing(null)}
          seated={seated}
          nextSort={zones.length}
        />
      ) : null}

      <div className="grid gap-3">
        {zones.map((z) => (
          <Card key={z.id} className="p-4">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex min-w-0 gap-3">
                <span
                  className="mt-1 size-3 shrink-0 rounded-[4px]"
                  style={{ background: z.color }}
                />
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 font-medium">
                    {z.name}
                    {!z.active ? <Badge tone="amber">paused</Badge> : null}
                    {z.admitsCount > 1 ? (
                      <Badge tone="brand">admits {z.admitsCount}</Badge>
                    ) : null}
                  </p>
                  {z.description ? (
                    <p className="mt-0.5 text-sm text-ink-400">{z.description}</p>
                  ) : null}
                  <p className="tabular mt-1 text-sm">
                    <span className="font-medium">{formatMinor(z.priceMinor)}</span>
                    {z.compareAtMinor ? (
                      <span className="ml-2 text-ink-500 line-through">
                        {formatMinor(z.compareAtMinor)}
                      </span>
                    ) : null}
                    <span className="ml-3 text-ink-400">
                      {z.sold} / {z.capacityResolved} sold
                    </span>
                  </p>
                </div>
              </div>

              <div className="flex gap-2">
                <Button size="sm" variant="secondary" onClick={() => setEditing(z.id)}>
                  Edit
                </Button>
                <DeleteZoneButton zoneId={z.id} disabled={z.sold > 0} />
              </div>
            </div>

            {seated ? (
              <SeatGrid
                zone={z}
                seats={seats.filter((s) => s.zoneId === z.id)}
              />
            ) : (
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-ink-800">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.min(100, z.capacityResolved ? (z.sold / z.capacityResolved) * 100 : 0)}%`,
                    background: z.color,
                  }}
                />
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}

function DeleteZoneButton({ zoneId, disabled }: { zoneId: string; disabled: boolean }) {
  const [pending, start] = useTransition();
  return (
    <Button
      size="sm"
      variant="danger"
      disabled={disabled || pending}
      title={disabled ? "Has sales — can't be deleted" : undefined}
      onClick={() => start(() => void deleteZone(zoneId))}
    >
      Delete
    </Button>
  );
}

function ZoneForm({
  event,
  zone,
  seated,
  nextSort,
  onDone,
}: {
  event: { id: string };
  zone: ZoneRow | null;
  seated: boolean;
  nextSort: number;
  onDone: () => void;
}) {
  const [state, action, pending] = useActionState(saveZone, undefined);
  const [color, setColor] = useState(zone?.color ?? swatches[nextSort % swatches.length]);

  if (state && "ok" in state && state.ok) {
    // The action revalidated the list; close on the next tick.
    queueMicrotask(onDone);
  }

  return (
    <Card className="border-brand-600/40 bg-brand-600/[0.04] p-5">
      <SectionTitle title={zone ? `Edit ${zone.name}` : seated ? "New seating block" : "New ticket category"} />
      <form action={action} className="space-y-4">
        <input type="hidden" name="eventId" value={event.id} />
        <input type="hidden" name="zoneId" value={zone?.id ?? ""} />
        <input type="hidden" name="color" value={color} />
        <input type="hidden" name="sortOrder" value={zone?.sortOrder ?? nextSort} />

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name">
            <Input
              name="name"
              defaultValue={zone?.name}
              placeholder={seated ? "Platinum" : "VIP Couple Entry"}
              required
            />
          </Field>
          <Field label="Price (₹)">
            <Input
              name="price"
              type="number"
              min={0}
              step="1"
              defaultValue={zone ? zone.priceMinor / 100 : 500}
              required
            />
          </Field>
        </div>

        <Field label="Description" hint="Shown to buyers under the category name.">
          <Textarea
            name="description"
            defaultValue={zone?.description ?? ""}
            placeholder="Front arena access for two, includes dinner coupons."
            className="min-h-16"
          />
        </Field>

        {seated ? (
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Rows">
              <Input name="rows" type="number" min={0} max={40} defaultValue={zone?.rows ?? 5} />
            </Field>
            <Field label="Seats per row">
              <Input name="cols" type="number" min={0} max={60} defaultValue={zone?.cols ?? 12} />
            </Field>
            <Field label="First row letter">
              <Input name="rowStart" maxLength={1} defaultValue="A" />
            </Field>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Capacity">
              <Input name="capacity" type="number" min={0} defaultValue={zone?.capacity ?? 200} />
            </Field>
            <Field label="Admits per ticket" hint="2 for a couple pass.">
              <Input name="admitsCount" type="number" min={1} defaultValue={zone?.admitsCount ?? 1} />
            </Field>
            <Field label="Was price (₹)" hint="Optional, shown struck through.">
              <Input
                name="compareAt"
                type="number"
                min={0}
                defaultValue={zone?.compareAtMinor ? zone.compareAtMinor / 100 : ""}
              />
            </Field>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Min per order">
            <Input name="minPerOrder" type="number" min={1} defaultValue={zone?.minPerOrder ?? 1} />
          </Field>
          <Field label="Max per order">
            <Input name="maxPerOrder" type="number" min={1} defaultValue={zone?.maxPerOrder ?? 10} />
          </Field>
          <Field label="Stop selling at" hint="Optional cut-off.">
            <Input name="salesEndAt" type="datetime-local" />
          </Field>
        </div>

        <div>
          <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-ink-400">
            Colour
          </span>
          <div className="flex gap-2">
            {swatches.map((s) => (
              <button
                key={s}
                type="button"
                aria-label={`Colour ${s}`}
                onClick={() => setColor(s)}
                className={cn(
                  "size-7 rounded-lg border-2 transition",
                  color === s ? "border-ink-50" : "border-transparent",
                )}
                style={{ background: s }}
              />
            ))}
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="active"
            defaultChecked={zone ? !!zone.active : true}
            className="size-4 accent-[--color-brand-600]"
          />
          Available for sale
        </label>

        {state && "error" in state && state.error ? (
          <p className="rounded-lg border border-red-900 bg-red-950 px-3 py-2 text-sm text-red-200">
            {state.error}
          </p>
        ) : null}

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

function SeatGrid({ zone, seats }: { zone: ZoneRow; seats: SeatRow[] }) {
  const [pending, start] = useTransition();
  const rows = new Map<string, SeatRow[]>();
  for (const s of seats) {
    if (!rows.has(s.rowLabel)) rows.set(s.rowLabel, []);
    rows.get(s.rowLabel)!.push(s);
  }

  if (!seats.length)
    return <p className="mt-3 text-sm text-ink-400">No seats yet — set rows and seats per row.</p>;

  return (
    <div className="mt-4">
      <p className="mb-2 text-xs text-ink-400">
        Click a seat to block or unblock it (broken chair, camera position, house seats).
      </p>
      <div className="overflow-x-auto rounded-lg border border-ink-800 bg-ink-950/50 p-3">
        <div className="inline-flex min-w-full flex-col gap-1">
          {[...rows.entries()]
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([rowLabel, rowSeats]) => (
              <div key={rowLabel} className="flex items-center gap-1">
                <span className="w-5 shrink-0 text-center text-[10px] text-ink-500">
                  {rowLabel}
                </span>
                {rowSeats
                  .sort((a, b) => a.seatNumber - b.seatNumber)
                  .map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      disabled={s.status === "sold" || pending}
                      title={`${s.label} — ${s.status}`}
                      onClick={() => start(() => void toggleSeatBlock(s.id))}
                      className={cn(
                        "size-5 rounded-[3px] text-[8px] transition",
                        s.status === "sold" && "cursor-not-allowed opacity-100",
                        s.status === "blocked" && "bg-ink-700 text-ink-500",
                        s.status === "available" && "hover:opacity-80",
                      )}
                      style={
                        s.status === "sold"
                          ? { background: "#d03b3b" }
                          : s.status === "available"
                            ? { background: zone.color }
                            : undefined
                      }
                    />
                  ))}
              </div>
            ))}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-4 text-xs text-ink-400">
        <Legend color={zone.color} label="Available" />
        <Legend color="#d03b3b" label="Sold" />
        <Legend color="#2c2839" label="Blocked" />
      </div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="size-2.5 rounded-[3px]" style={{ background: color }} />
      {label}
    </span>
  );
}
