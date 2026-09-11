"use client";

import { useState } from "react";
import { SeatLegend, SeatMap, type MapSeat } from "@/components/seat-map";
import { formatMinor } from "@/lib/money";
import { ringRowLabel, type StageConfig } from "@/lib/seat-layout";
import { cn } from "@/components/ui";
import type { PublicSeat, PublicZone } from "./booking-widget";

/**
 * One block's map at a time, with tabs across the top.
 *
 * Stacking every block's map means scrolling past a thousand seats you aren't
 * buying. Tabs also give the landing page something to deep-link into: "Book"
 * on the Gold tier opens Gold's map directly.
 */
export function SeatPicker({
  zones,
  seatsByZone,
  selected,
  max,
  stage,
  initialZoneId,
  onChange,
}: {
  zones: PublicZone[];
  seatsByZone: Map<string, PublicSeat[]>;
  selected: string[];
  max: number;
  stage: StageConfig;
  initialZoneId?: string | null;
  /** Takes an updater so rapid taps queue instead of overwriting each other. */
  onChange: (next: string[] | ((prev: string[]) => string[])) => void;
}) {
  const withSeats = zones.filter((z) => (seatsByZone.get(z.id)?.length ?? 0) > 0);
  const preferred =
    withSeats.find((z) => z.id === initialZoneId && !z.soldOut) ??
    withSeats.find((z) => !z.soldOut) ??
    withSeats[0];

  // The open block is derived, with an override once the buyer picks a tab.
  // Deriving it means a deep link or a night change is reflected immediately
  // instead of needing an effect to copy props into state.
  const [chosenId, setChosenId] = useState<string | null>(null);
  const zone = withSeats.find((z) => z.id === chosenId) ?? preferred;
  if (!zone) return <p className="text-sm text-slate-500">No seats configured yet.</p>;

  // Reads the previous selection rather than this render's `selected`: tapping
  // two seats in quick succession fires both handlers before React re-renders.
  const toggle = (seatId: string) => {
    onChange((prev) =>
      prev.includes(seatId)
        ? prev.filter((s) => s !== seatId)
        : prev.length < max
          ? [...prev, seatId]
          : prev,
    );
  };

  const allSeats = [...seatsByZone.values()].flat();
  const picked = selected
    .map((id) => allSeats.find((s) => s.id === id))
    .filter(Boolean) as PublicSeat[];

  const seats = seatsByZone.get(zone.id) ?? [];
  const mapSeats: MapSeat[] = seats.map((s) => ({
    id: s.id,
    label: s.label,
    rowLabel: s.rowLabel,
    seatNumber: s.seatNumber,
    ringIndex: s.ringIndex,
    posInRing: s.posInRing,
    ringSize: s.ringSize,
    x: s.x,
    y: s.y,
    state: s.taken ? "sold" : "available",
  }));

  // Only layers the organiser actually described earn a legend row.
  const layerCount = zone.shape === "grid" ? zone.rows : zone.ringCount;
  const described = zone.layerNotes.some(Boolean) || zone.layerColors.some(Boolean);
  const layers = described
    ? Array.from({ length: layerCount }, (_, i) => ({
        label: zone.shape === "grid" ? `Row ${String.fromCharCode(65 + i)}` : ringRowLabel(i),
        color: zone.layerColors[i] || zone.color,
        note: zone.layerNotes[i] || undefined,
        count: seats.filter((s) => (zone.shape === "grid" ? s.y : s.ringIndex) === i).length,
      })).filter((l) => l.count > 0)
    : undefined;

  return (
    <div className="space-y-4">
      {withSeats.length > 1 ? (
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
            Which block?
          </p>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {withSeats.map((z) => {
              const active = z.id === zone.id;
              const chosenHere = picked.filter((s) => s.zoneId === z.id).length;
              return (
                <button
                  key={z.id}
                  type="button"
                  aria-pressed={active}
                  disabled={z.soldOut}
                  onClick={() => setChosenId(z.id)}
                  className={cn(
                    "min-w-[132px] shrink-0 rounded-xl border px-3 py-2.5 text-left transition",
                    active
                      ? "border-slate-900 bg-slate-900 text-white"
                      : z.soldOut
                        ? "cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400"
                        : "border-slate-200 bg-white text-slate-800 hover:border-slate-400",
                  )}
                >
                  <span className="flex items-center gap-2">
                    <span className="size-2.5 shrink-0 rounded-full" style={{ background: z.color }} />
                    <span className="truncate text-sm font-medium">{z.name}</span>
                  </span>
                  <span className="mt-1 block text-sm font-semibold">
                    {formatMinor(z.priceMinor)}
                  </span>
                  <span className={cn("block text-xs", active ? "text-white/70" : "text-slate-500")}>
                    {z.soldOut
                      ? "Sold out"
                      : chosenHere
                        ? `${chosenHere} selected`
                        : `${z.available} free`}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      <div>
        <div className="mb-2 flex items-baseline justify-between gap-3">
          <p className="flex items-center gap-2 text-sm font-medium text-slate-900">
            <span className="size-2.5 rounded-full" style={{ background: zone.color }} />
            {zone.name}
          </p>
          <p className="text-sm text-slate-600">
            {formatMinor(zone.priceMinor)}
            <span className="ml-2 text-xs text-slate-400">{zone.available} free</span>
          </p>
        </div>

        <div className="relative rounded-xl border border-slate-200 bg-slate-50 p-2">
          <SeatMap
            zone={zone}
            seats={mapSeats}
            selected={selected}
            onToggle={toggle}
            mode="select"
            theme="light"
            stage={stage}
            maxHeight={460}
            zoomable
          />
        </div>
        <p className="mt-1.5 text-center text-xs text-slate-400">
          Pinch or use + to zoom in, then drag to move around the map.
        </p>

        <div className="mt-2">
          <SeatLegend color={zone.color} theme="light" showSelected layers={layers} />
        </div>
      </div>

      {picked.length > 0 ? (
        <div className="rounded-xl bg-slate-50 p-3 text-sm">
          <p className="font-medium text-slate-900">
            {picked.length} seat{picked.length > 1 ? "s" : ""} selected
          </p>
          <ul className="mt-1.5 flex flex-wrap gap-1.5">
            {picked.map((s) => {
              const z = zones.find((x) => x.id === s.zoneId);
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => onChange((prev) => prev.filter((id) => id !== s.id))}
                    className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 bg-white px-2.5 py-1 text-xs hover:border-slate-500"
                    title="Remove this seat"
                  >
                    <span className="size-2 rounded-full" style={{ background: z?.color }} />
                    {s.label}
                    <span className="text-slate-400">×</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        <p className="text-sm text-slate-500">Tap the seats you want — up to {max}.</p>
      )}
    </div>
  );
}
