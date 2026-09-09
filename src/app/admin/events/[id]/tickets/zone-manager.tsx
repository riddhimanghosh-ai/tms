"use client";

import { useActionState, useState, useTransition } from "react";
import { deleteZone, saveZone, setSeatsBlocked, toggleSeatBlock } from "@/app/admin/actions";
import {
  FormError,
  Badge,
  Button,
  Card,
  Field,
  Input,
  SectionTitle,
  Textarea,
  cn,
} from "@/components/ui";
import { SeatLegend, SeatMap, ShapePreview, type MapSeat } from "@/components/seat-map";
import { LayerEditor } from "./layer-editor";
import {
  SHAPES,
  ringRowLabel,
  ringSizes,
  type RingConfig,
  type StageConfig,
  type ZoneShape,
} from "@/lib/seat-layout";
import { formatMinor } from "@/lib/money";
import { toast, useActionToast } from "@/components/toast";

type ZoneRow = RingConfig & {
  id: string;
  eventId: string;
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
  allDates: number;
  layerColors: string[];
  layerNotes: string[];
  sortOrder: number;
  sold: number;
};

type SeatRow = MapSeat & { zoneId: string };

const swatches = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#9085e9"];

/**
 * A number input that can be genuinely empty while being edited. Coercing to 0
 * on every keystroke is what produces "02" and "013" when someone types over a
 * value, so the raw string is what the input shows.
 */
function useNumberField(initial: number) {
  const [raw, setRaw] = useState(String(initial));
  const value = Number(raw);
  return [
    { raw, value: Number.isFinite(value) ? value : 0 },
    (next: string) => setRaw(next.replace(/^0+(?=\d)/, "")),
  ] as const;
}

export function ZoneManager({
  event,
  zones,
  seats,
  stage,
  nightCount,
}: {
  event: { id: string; layoutType: string; currency: string };
  zones: ZoneRow[];
  seats: SeatRow[];
  stage: StageConfig;
  nightCount: number;
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
              ? "Each block has its own shape — straight rows, concentric rings, or a curved arc."
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
          stage={stage}
          nightCount={nightCount}
          nextSort={zones.length}
        />
      ) : null}

      <div className="grid gap-3">
        {zones.map((z) => (
          <Card key={z.id} className="p-4">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex min-w-0 gap-3">
                <span
                  className="mt-1 size-3 shrink-0 rounded-full"
                  style={{ background: z.color }}
                />
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 font-medium">
                    {z.name}
                    {!z.active ? <Badge tone="amber">paused</Badge> : null}
                    {z.admitsCount > 1 ? <Badge tone="brand">admits {z.admitsCount}</Badge> : null}
                    {seated ? (
                      <Badge>{SHAPES.find((s) => s.value === z.shape)?.title ?? z.shape}</Badge>
                    ) : null}
                    {nightCount > 1 && z.allDates ? (
                      <Badge tone="amber">all {nightCount} nights</Badge>
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
              <ZoneSeatMap zone={z} seats={seats.filter((s) => s.zoneId === z.id)} stage={stage} />
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

function ZoneSeatMap({
  zone,
  seats,
  stage,
}: {
  zone: ZoneRow;
  seats: SeatRow[];
  stage: StageConfig;
}) {
  const [pending, start] = useTransition();

  const layerCount = zone.shape === "grid" ? zone.rows : zone.ringCount;
  const layers = Array.from({ length: layerCount }, (_, i) => {
    const inLayer = seats.filter((s) => (zone.shape === "grid" ? s.y : s.ringIndex) === i);
    return {
      index: i,
      label: zone.shape === "grid" ? `Row ${inLayer[0]?.rowLabel ?? i + 1}` : ringRowLabel(i),
      color: zone.layerColors[i] || zone.color,
      note: zone.layerNotes[i] || undefined,
      count: inLayer.length,
      seatIds: inLayer.filter((s) => s.state !== "sold").map((s) => s.id),
      allBlocked: inLayer.length > 0 && inLayer.every((s) => s.state !== "available"),
    };
  }).filter((l) => l.count > 0);

  return (
    <div className="mt-4">
      <p className="mb-2 text-xs text-ink-400">
        Click a seat to block or unblock it — broken chair, camera position, house seats.
        Use the layer buttons below to do a whole row or ring at once.
      </p>
      <div
        className={cn(
          "rounded-xl border border-ink-700 bg-ink-850 p-3 transition",
          pending && "opacity-60",
        )}
      >
        <SeatMap
          zone={zone}
          seats={seats}
          mode="edit"
          theme="dark"
          stage={stage}
          onToggle={(seatId) => start(() => void toggleSeatBlock(seatId))}
        />
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {layers.map((l) => (
          <button
            key={l.index}
            type="button"
            disabled={pending || !l.seatIds.length}
            onClick={() =>
              start(async () => {
                const res = await setSeatsBlocked(zone.eventId, l.seatIds, !l.allBlocked);
                toast(
                  `${l.allBlocked ? "Unblocked" : "Blocked"} ${res.changed} seat${res.changed === 1 ? "" : "s"} in ${l.label}`,
                  "ok",
                );
              })
            }
            className={cn(
              "rounded-full border px-2.5 py-1 text-xs transition disabled:opacity-40",
              l.allBlocked
                ? "border-ink-600 bg-ink-800 text-ink-300"
                : "border-ink-700 text-ink-400 hover:border-ink-600 hover:text-ink-100",
            )}
            title={`${l.allBlocked ? "Unblock" : "Block"} all of ${l.label}`}
          >
            <span
              className="mr-1.5 inline-block size-2 rounded-full align-middle"
              style={{ background: l.color }}
            />
            {l.label}
          </button>
        ))}
      </div>

      <div className="mt-3">
        <SeatLegend
          color={zone.color}
          theme="dark"
          layers={
            zone.layerNotes.some(Boolean) || zone.layerColors.some(Boolean) ? layers : undefined
          }
        />
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
  stage,
  nightCount,
  nextSort,
  onDone,
}: {
  event: { id: string };
  zone: ZoneRow | null;
  seated: boolean;
  stage: StageConfig;
  nightCount: number;
  nextSort: number;
  onDone: () => void;
}) {
  const [state, action, pending] = useActionState(saveZone, undefined);
  useActionToast(state, { ok: "Ticket type saved" });
  const [color, setColor] = useState(zone?.color ?? swatches[nextSort % swatches.length]);
  const [shape, setShape] = useState<ZoneShape>((zone?.shape as ZoneShape) ?? "grid");
  const [rowStart, setRowStart] = useState("A");
  const [layers, setLayers] = useState({
    colors: zone?.layerColors ?? [],
    notes: zone?.layerNotes ?? [],
  });

  // Live geometry so the organiser sees the layout while typing numbers.
  // Kept as strings so a field can be empty mid-edit instead of snapping to 0
  // and leaving a leading zero behind the next keystroke.
  const [rows, setRows] = useNumberField(zone?.rows || 6);
  const [cols, setCols] = useNumberField(zone?.cols || 14);
  const [ringCount, setRingCount] = useNumberField(zone?.ringCount || 5);
  const [ringStartSeats, setRingStartSeats] = useNumberField(zone?.ringStartSeats || 12);
  const [ringSeatStep, setRingSeatStep] = useNumberField(zone?.ringSeatStep ?? 6);
  const [arcSpanDeg, setArcSpanDeg] = useState(zone?.arcSpanDeg ?? 360);
  const [arcStartDeg, setArcStartDeg] = useState(zone?.arcStartDeg ?? 0);
  const [innerHolePct, setInnerHolePct] = useState(zone?.innerHolePct ?? 35);

  if (state && "ok" in state && state.ok) queueMicrotask(onDone);

  const cfg: RingConfig = {
    shape,
    ringCount: ringCount.value,
    ringStartSeats: ringStartSeats.value,
    ringSeatStep: ringSeatStep.value,
    arcSpanDeg: shape === "rings" ? 360 : arcSpanDeg,
    arcStartDeg,
    innerHolePct,
  };
  const sizes = ringSizes(cfg);
  const seatTotal =
    shape === "grid" ? rows.value * cols.value : sizes.reduce((n, s) => n + s, 0);

  // A preview needs seat rows; build them from the live config, not the database.
  const previewSeats: MapSeat[] =
    shape === "grid"
      ? Array.from({ length: Math.min(rows.value * cols.value, 1200) }, (_, i) => {
          const r = Math.floor(i / Math.max(1, cols.value));
          const c = i % Math.max(1, cols.value);
          return {
            id: `p${i}`,
            label: `${String.fromCharCode(65 + r)}${c + 1}`,
            rowLabel: String.fromCharCode(65 + r),
            seatNumber: c + 1,
            ringIndex: 0,
            posInRing: 0,
            ringSize: 0,
            x: c + 1,
            y: r,
            state: "available" as const,
          };
        })
      : sizes.flatMap((size, ringIndex) =>
          Array.from({ length: size }, (_, pos) => ({
            id: `p${ringIndex}-${pos}`,
            label: `R${ringIndex + 1}-${pos + 1}`,
            rowLabel: `R${ringIndex + 1}`,
            seatNumber: pos + 1,
            ringIndex,
            posInRing: pos,
            ringSize: size,
            x: pos,
            y: ringIndex,
            state: "available" as const,
          })),
        );

  return (
    <Card className="border-brand-200 bg-brand-50 p-5">
      <SectionTitle
        title={zone ? `Edit ${zone.name}` : seated ? "New seating block" : "New ticket category"}
      />
      <form action={action} className="space-y-5">
        <input type="hidden" name="eventId" value={event.id} />
        <input type="hidden" name="zoneId" value={zone?.id ?? ""} />
        <input type="hidden" name="color" value={color} />
        <input type="hidden" name="shape" value={shape} />
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

        <Field label="Description" hint="Shown to buyers under the name.">
          <Textarea
            name="description"
            defaultValue={zone?.description ?? ""}
            placeholder="Front arena access for two, includes dinner coupons."
            className="min-h-16"
          />
        </Field>

        {seated ? (
          <div className="space-y-4">
            <div>
              <span className="mb-2 block text-xs font-medium uppercase tracking-wide text-ink-400">
                Layout shape
              </span>
              <div className="grid gap-3 sm:grid-cols-3">
                {SHAPES.map((s) => (
                  <button
                    key={s.value}
                    type="button"
                    onClick={() => setShape(s.value)}
                    className={cn(
                      "flex gap-3 rounded-xl border p-3 text-left transition",
                      shape === s.value
                        ? "border-brand-500 bg-brand-50"
                        : "border-ink-700 bg-ink-900/60 hover:border-ink-600",
                    )}
                  >
                    <span className="shrink-0 rounded-lg bg-ink-800 p-1">
                      <ShapePreview
                        shape={s.value}
                        color={color}
                        size={52}
                        config={{
                          shape: s.value,
                          rows: 6,
                          cols: 10,
                          ringCount: 4,
                          ringStartSeats: 10,
                          ringSeatStep: 6,
                          arcSpanDeg: s.value === "arc" ? 200 : 360,
                          arcStartDeg: s.value === "arc" ? 250 : 0,
                          innerHolePct: 35,
                          color,
                        }}
                      />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">{s.title}</span>
                      <span className="mt-0.5 block text-xs text-ink-400">{s.bestFor}</span>
                    </span>
                  </button>
                ))}
              </div>
              <p className="mt-2 text-xs text-ink-400">
                {SHAPES.find((s) => s.value === shape)?.body}
              </p>
            </div>

            <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
              <div className="space-y-4">
                {shape === "grid" ? (
                  <div className="grid gap-4 sm:grid-cols-3">
                    <Field label="Rows">
                      <Input
                        name="rows"
                        type="number"
                        min={1}
                        max={60}
                        value={rows.raw}
                        onChange={(e) => setRows(e.target.value)}
                      />
                    </Field>
                    <Field label="Seats per row">
                      <Input
                        name="cols"
                        type="number"
                        min={1}
                        max={80}
                        value={cols.raw}
                        onChange={(e) => setCols(e.target.value)}
                      />
                    </Field>
                    <Field label="First row letter">
                      <Input
                        name="rowStart"
                        maxLength={1}
                        value={rowStart}
                        onChange={(e) => setRowStart(e.target.value.toUpperCase() || "A")}
                      />
                    </Field>
                  </div>
                ) : (
                  <>
                    <input type="hidden" name="rows" value={0} />
                    <input type="hidden" name="cols" value={0} />
                    <div className="grid gap-4 sm:grid-cols-3">
                      <Field label="Layers" hint="Rings from the centre out.">
                        <Input
                          name="ringCount"
                          type="number"
                          min={1}
                          max={40}
                          value={ringCount.raw}
                          onChange={(e) => setRingCount(e.target.value)}
                        />
                      </Field>
                      <Field label="Seats in layer 1">
                        <Input
                          name="ringStartSeats"
                          type="number"
                          min={1}
                          max={200}
                          value={ringStartSeats.raw}
                          onChange={(e) => setRingStartSeats(e.target.value)}
                        />
                      </Field>
                      <Field label="Added per layer" hint="Outer layers hold more.">
                        <Input
                          name="ringSeatStep"
                          type="number"
                          min={0}
                          max={60}
                          value={ringSeatStep.raw}
                          onChange={(e) => setRingSeatStep(e.target.value)}
                        />
                      </Field>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-3">
                      <Field label={`Empty centre — ${innerHolePct}%`}>
                        <input
                          name="innerHolePct"
                          type="range"
                          min={0}
                          max={80}
                          value={innerHolePct}
                          onChange={(e) => setInnerHolePct(Number(e.target.value))}
                          className="w-full accent-[--color-brand-600]"
                        />
                      </Field>
                      {shape === "arc" ? (
                        <>
                          <Field label={`Sweep — ${arcSpanDeg}°`}>
                            <input
                              name="arcSpanDeg"
                              type="range"
                              min={30}
                              max={350}
                              value={arcSpanDeg}
                              onChange={(e) => setArcSpanDeg(Number(e.target.value))}
                              className="w-full accent-[--color-brand-600]"
                            />
                          </Field>
                          <Field label={`Facing — ${arcStartDeg}°`}>
                            <input
                              name="arcStartDeg"
                              type="range"
                              min={0}
                              max={359}
                              value={arcStartDeg}
                              onChange={(e) => setArcStartDeg(Number(e.target.value))}
                              className="w-full accent-[--color-brand-600]"
                            />
                          </Field>
                        </>
                      ) : (
                        <>
                          <input type="hidden" name="arcSpanDeg" value={360} />
                          <input type="hidden" name="arcStartDeg" value={0} />
                        </>
                      )}
                    </div>

                    <p className="text-xs text-ink-400">
                      Layers hold {sizes.slice(0, 8).join(", ")}
                      {sizes.length > 8 ? "…" : ""} seats.
                    </p>
                  </>
                )}

                <LayerEditor
                  count={shape === "grid" ? rows.value : ringCount.value}
                  shape={shape}
                  rowStart={rowStart}
                  baseColor={color}
                  colors={layers.colors}
                  notes={layers.notes}
                  onChange={setLayers}
                />

                <p className="text-sm">
                  <span className="font-medium">{seatTotal.toLocaleString("en-IN")}</span>{" "}
                  <span className="text-ink-400">seats in this block</span>
                  {zone && zone.sold > 0 ? (
                    <span className="ml-2 text-amber-600">
                      · {zone.sold} already sold and will be kept
                    </span>
                  ) : null}
                </p>
              </div>

              <div className="rounded-xl border border-ink-700 bg-ink-850 p-3">
                <p className="mb-1 text-xs uppercase tracking-wide text-ink-400">Live preview</p>
                <SeatMap
                  zone={{
                    ...cfg,
                    rows: rows.value,
                    cols: cols.value,
                    color,
                    layerColors: layers.colors,
                    layerNotes: layers.notes,
                  }}
                  seats={previewSeats}
                  mode="edit"
                  theme="dark"
                  stage={stage}
                  maxHeight={280}
                />
              </div>
            </div>
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

        {nightCount > 1 ? (
          <label className="flex items-start gap-2 rounded-xl border border-ink-700 bg-ink-850 p-3 text-sm">
            <input
              type="checkbox"
              name="allDates"
              defaultChecked={!!zone?.allDates}
              className="mt-0.5 size-4 accent-[--color-brand-600]"
            />
            <span>
              <span className="font-medium">Season pass — covers all {nightCount} nights</span>
              <span className="mt-0.5 block text-ink-400">
                Sold once from a single pool rather than per night. Leave off for a normal
                night-by-night ticket.
              </span>
            </span>
          </label>
        ) : null}

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
                  "size-7 rounded-full border-2 transition",
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
