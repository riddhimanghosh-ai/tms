"use client";

import { useState } from "react";
import { Input, cn } from "@/components/ui";
import { ringRowLabel } from "@/lib/seat-layout";

const SWATCHES = [
  "#3987e5",
  "#d95926",
  "#199e70",
  "#c98500",
  "#d55181",
  "#9085e9",
  "#e66767",
  "#008300",
];

/**
 * Colour and describe each layer. A ringed ground usually prices its inner
 * rings differently, and buyers need to know *why* one ring costs more —
 * so the note travels with the colour onto the seat map's legend.
 */
export function LayerEditor({
  count,
  shape,
  rowStart,
  baseColor,
  colors,
  notes,
  onChange,
}: {
  count: number;
  shape: "grid" | "rings" | "arc";
  rowStart: string;
  baseColor: string;
  colors: string[];
  notes: string[];
  onChange: (next: { colors: string[]; notes: string[] }) => void;
}) {
  const [open, setOpen] = useState(false);
  const visible = Math.min(count, 40);
  const described = colors.some(Boolean) || notes.some(Boolean);

  const label = (i: number) =>
    shape === "grid"
      ? `Row ${String.fromCharCode((rowStart || "A").charCodeAt(0) + i)}`
      : ringRowLabel(i);

  const setAt = (list: string[], i: number, value: string) => {
    const next = [...list];
    while (next.length <= i) next.push("");
    next[i] = value;
    return next;
  };

  if (visible <= 0) return null;

  return (
    <div className="rounded-xl border border-ink-700 bg-ink-850 p-3">
      {/* Hidden fields keep the server contract stable whether or not it's open. */}
      {Array.from({ length: visible }, (_, i) => (
        <div key={`hidden-${i}`}>
          <input type="hidden" name="layerColor" value={colors[i] ?? ""} />
          <input type="hidden" name="layerNote" value={notes[i] ?? ""} />
        </div>
      ))}

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 text-left"
      >
        <span className="text-sm font-medium">
          {shape === "grid" ? "Rows" : "Layers"} — colours &amp; descriptions
        </span>
        <span className="text-xs text-ink-400">
          {described ? `${colors.filter(Boolean).length + notes.filter(Boolean).length} set` : "optional"}
        </span>
        <span className="ml-auto flex items-center gap-1">
          {Array.from({ length: Math.min(visible, 8) }, (_, i) => (
            <span
              key={i}
              className="size-2.5 rounded-full"
              style={{ background: colors[i] || baseColor }}
            />
          ))}
          <span className="ml-1 text-xs text-ink-400">{open ? "▲" : "▼"}</span>
        </span>
      </button>

      {open ? (
        <div className="mt-3 space-y-2">
          <p className="text-xs text-ink-400">
            Leave a colour blank to use the block colour. Descriptions show on the map legend
            and when a buyer hovers a seat.
          </p>
          <ul className="max-h-72 space-y-2 overflow-y-auto pr-1">
            {Array.from({ length: visible }, (_, i) => (
              <li key={i} className="flex flex-wrap items-center gap-2">
                <span className="w-16 shrink-0 text-xs text-ink-400">{label(i)}</span>
                <div className="flex gap-1">
                  {SWATCHES.map((sw) => (
                    <button
                      key={sw}
                      type="button"
                      aria-label={`${label(i)} colour ${sw}`}
                      onClick={() =>
                        onChange({
                          colors: setAt(colors, i, colors[i] === sw ? "" : sw),
                          notes,
                        })
                      }
                      className={cn(
                        "size-5 rounded-full border-2 transition",
                        colors[i] === sw ? "border-ink-50" : "border-transparent",
                      )}
                      style={{ background: sw }}
                    />
                  ))}
                </div>
                <Input
                  value={notes[i] ?? ""}
                  onChange={(e) => onChange({ colors, notes: setAt(notes, i, e.target.value) })}
                  placeholder={
                    shape === "grid" ? "Best view, extra legroom…" : "Closest to the dhol…"
                  }
                  className="h-8 min-w-40 flex-1 text-sm"
                />
              </li>
            ))}
          </ul>
          {described ? (
            <button
              type="button"
              onClick={() => onChange({ colors: [], notes: [] })}
              className="text-xs text-ink-500 underline hover:text-ink-200"
            >
              Clear all layer colours and notes
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
