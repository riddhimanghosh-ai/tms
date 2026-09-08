"use client";

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
    if (selected.includes(seatId)) {
      onChange(selected.filter((s) => s !== seatId));
    } else if (selected.length < max) {
      onChange([...selected, seatId]);
    }
  };

  return (
    <div className="space-y-5">
      <div className="rounded-xl bg-slate-900 py-2 text-center text-xs font-medium uppercase tracking-[0.2em] text-white">
        Stage
      </div>

      {zones.map((zone) => {
        const seats = seatsByZone.get(zone.id) ?? [];
        if (!seats.length) return null;

        const rows = new Map<string, PublicSeat[]>();
        for (const s of seats) {
          if (!rows.has(s.rowLabel)) rows.set(s.rowLabel, []);
          rows.get(s.rowLabel)!.push(s);
        }

        return (
          <div key={zone.id}>
            <div className="mb-2 flex items-baseline justify-between gap-3">
              <p className="flex items-center gap-2 text-sm font-medium text-slate-900">
                <span className="size-2.5 rounded-[3px]" style={{ background: zone.color }} />
                {zone.name}
              </p>
              <p className="text-sm text-slate-600">
                {formatMinor(zone.priceMinor)}
                <span className="ml-2 text-xs text-slate-400">{zone.available} free</span>
              </p>
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="inline-flex min-w-full flex-col items-center gap-1">
                {[...rows.entries()]
                  .sort(([a], [b]) => a.localeCompare(b))
                  .map(([rowLabel, rowSeats]) => (
                    <div key={rowLabel} className="flex items-center gap-1">
                      <span className="w-4 shrink-0 text-center text-[10px] text-slate-400">
                        {rowLabel}
                      </span>
                      {rowSeats
                        .sort((a, b) => a.seatNumber - b.seatNumber)
                        .map((s) => {
                          const picked = selected.includes(s.id);
                          return (
                            <button
                              key={s.id}
                              type="button"
                              title={s.taken ? `${s.label} — taken` : s.label}
                              aria-label={`Seat ${s.label}${s.taken ? ", unavailable" : ""}`}
                              aria-pressed={picked}
                              disabled={s.taken}
                              onClick={() => toggle(s.id)}
                              className="size-6 rounded-[4px] text-[9px] font-medium transition disabled:cursor-not-allowed"
                              style={{
                                background: s.taken
                                  ? "#d5d3dd"
                                  : picked
                                    ? "#0f172a"
                                    : zone.color,
                                color: s.taken ? "#8d8a99" : "#fff",
                                opacity: s.taken ? 0.6 : 1,
                              }}
                            >
                              {picked ? "✓" : ""}
                            </button>
                          );
                        })}
                    </div>
                  ))}
              </div>
            </div>
          </div>
        );
      })}

      <div className="flex flex-wrap gap-4 text-xs text-slate-500">
        <Legend color="#94a3b8" label="Available" />
        <Legend color="#0f172a" label="Your pick" />
        <Legend color="#d5d3dd" label="Taken" />
      </div>

      {selected.length > 0 ? (
        <p className="text-sm text-slate-700">
          <span className="font-medium">Selected:</span>{" "}
          {selected
            .map((id) => [...seatsByZone.values()].flat().find((s) => s.id === id)?.label)
            .filter(Boolean)
            .join(", ")}
        </p>
      ) : (
        <p className="text-sm text-slate-500">Tap the seats you want.</p>
      )}
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="size-3 rounded-[3px]" style={{ background: color }} />
      {label}
    </span>
  );
}
