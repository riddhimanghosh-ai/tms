"use client";

import { SeatLegend, SeatMap, type MapSeat } from "@/components/seat-map";
import { formatMinor } from "@/lib/money";
import type { PublicSeat, PublicZone } from "./booking-widget";

export function SeatPicker({
  zones,
  seatsByZone,
  selected,
  max,
  onChange,
}: {
  zones: PublicZone[];
  seatsByZone: Map<string, PublicSeat[]>;
  selected: string[];
  max: number;
  onChange: (next: string[]) => void;
}) {
  const toggle = (seatId: string) => {
    if (selected.includes(seatId)) onChange(selected.filter((s) => s !== seatId));
    else if (selected.length < max) onChange([...selected, seatId]);
  };

  const allSeats = [...seatsByZone.values()].flat();
  const pickedLabels = selected
    .map((id) => allSeats.find((s) => s.id === id)?.label)
    .filter(Boolean);

  return (
    <div className="space-y-6">
      {zones.map((zone) => {
        const seats = seatsByZone.get(zone.id) ?? [];
        if (!seats.length) return null;

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

        return (
          <div key={zone.id}>
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

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-2">
              <SeatMap
                zone={zone}
                seats={mapSeats}
                selected={selected}
                onToggle={toggle}
                mode="select"
                theme="light"
                maxHeight={380}
              />
            </div>
          </div>
        );
      })}

      <SeatLegend color={zones[0]?.color ?? "#3987e5"} theme="light" showSelected />

      {pickedLabels.length > 0 ? (
        <p className="text-sm text-slate-700">
          <span className="font-medium">Selected:</span> {pickedLabels.join(", ")}
        </p>
      ) : (
        <p className="text-sm text-slate-500">
          Tap the seats you want — up to {max}.
        </p>
      )}
    </div>
  );
}
