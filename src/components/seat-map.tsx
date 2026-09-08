"use client";

import { useMemo, useState } from "react";
import {
  VIEW,
  gridSeatPoint,
  ringSeatPoint,
  type RingConfig,
  type ZoneShape,
} from "@/lib/seat-layout";

export type SeatState = "available" | "blocked" | "sold";

export type MapSeat = {
  id: string;
  label: string;
  rowLabel: string;
  seatNumber: number;
  ringIndex: number;
  posInRing: number;
  ringSize: number;
  x: number;
  y: number;
  state: SeatState;
};

export type MapZone = RingConfig & {
  rows: number;
  cols: number;
  color: string;
};

const PALETTE = {
  dark: {
    sold: "#5b2230",
    blocked: "#2c2839",
    selected: "#ffffff",
    guide: "#2c2839",
    centreFill: "#191722",
    centreText: "#7c7594",
    rowText: "#7c7594",
  },
  light: {
    sold: "#d9d5e0",
    blocked: "#b9b4c6",
    selected: "#0f172a",
    guide: "#e6e3ee",
    centreFill: "#f1eff6",
    centreText: "#8b8699",
    rowText: "#9a95a8",
  },
} as const;

/**
 * One renderer for every seat layout, used by both the organiser's editor and
 * the buyer's picker. Positions come from `seat-layout`, so what an organiser
 * arranges is pixel-for-pixel what a buyer taps.
 */
export function SeatMap({
  zone,
  seats,
  selected = [],
  onToggle,
  mode,
  theme = "dark",
  centreLabel,
  maxHeight = 460,
}: {
  zone: MapZone;
  seats: MapSeat[];
  selected?: string[];
  onToggle?: (seatId: string) => void;
  /** edit: click blocks/unblocks. select: click picks a seat to buy. */
  mode: "edit" | "select";
  theme?: "dark" | "light";
  centreLabel?: string;
  maxHeight?: number;
}) {
  const c = PALETTE[theme];
  const [hover, setHover] = useState<MapSeat | null>(null);
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const isRing = zone.shape !== "grid";

  const placed = useMemo(
    () =>
      seats.map((seat) => {
        const point = isRing
          ? ringSeatPoint(zone, seat.ringIndex, seat.posInRing, seat.ringSize || 1)
          : gridSeatPoint(zone.rows, zone.cols, seat.y, seat.x - 1);
        return { seat, point };
      }),
    [seats, zone, isRing],
  );

  // Ring guides sit under the seats and make the layers legible when crowded.
  const guides = useMemo(() => {
    if (!isRing) return [];
    const byRing = new Map<number, number>();
    for (const { seat } of placed) byRing.set(seat.ringIndex, seat.ringSize || 1);
    return [...byRing.entries()]
      .sort(([a], [b]) => a - b)
      .map(([ringIndex, size]) => {
        const p = ringSeatPoint(zone, ringIndex, 0, size);
        const dx = p.x - VIEW / 2;
        const dy = p.y - VIEW / 2;
        return { ringIndex, radius: Math.hypot(dx, dy) };
      });
  }, [placed, zone, isRing]);

  const rowLabels = useMemo(() => {
    if (isRing) return [];
    const seen = new Map<number, { y: number; label: string }>();
    for (const { seat, point } of placed) {
      if (!seen.has(seat.y)) seen.set(seat.y, { y: point.y, label: seat.rowLabel });
    }
    return [...seen.values()];
  }, [placed, isRing]);

  if (!seats.length) {
    return (
      <p className={theme === "dark" ? "text-sm text-ink-400" : "text-sm text-slate-500"}>
        No seats yet — set this block&apos;s size to generate them.
      </p>
    );
  }

  const interactive = Boolean(onToggle);

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${VIEW} ${VIEW}`}
        className="w-full"
        style={{ maxHeight }}
        role="group"
        aria-label={`Seat map, ${seats.length} seats`}
        onMouseLeave={() => setHover(null)}
      >
        {isRing ? (
          <>
            {guides.map((g) => (
              <circle
                key={g.ringIndex}
                cx={VIEW / 2}
                cy={VIEW / 2}
                r={g.radius}
                fill="none"
                stroke={c.guide}
                strokeWidth={1}
              />
            ))}
            <circle
              cx={VIEW / 2}
              cy={VIEW / 2}
              r={Math.max(28, (guides[0]?.radius ?? 120) * 0.62)}
              fill={c.centreFill}
              stroke={c.guide}
            />
            <text
              x={VIEW / 2}
              y={VIEW / 2 + 6}
              textAnchor="middle"
              fontSize={30}
              fill={c.centreText}
              style={{ letterSpacing: 3 }}
            >
              {centreLabel ?? (zone.shape === "arc" ? "STAGE" : "CENTRE")}
            </text>
          </>
        ) : (
          <>
            <rect x={140} y={4} width={VIEW - 280} height={30} rx={15} fill={c.centreFill} />
            <text
              x={VIEW / 2}
              y={25}
              textAnchor="middle"
              fontSize={20}
              fill={c.centreText}
              style={{ letterSpacing: 4 }}
            >
              {centreLabel ?? "STAGE"}
            </text>
            {rowLabels.map((r) => (
              <text
                key={r.label}
                x={16}
                y={r.y + 6}
                fontSize={18}
                fill={c.rowText}
              >
                {r.label}
              </text>
            ))}
          </>
        )}

        {placed.map(({ seat, point }) => {
          const picked = selectedSet.has(seat.id);
          const locked = mode === "select" ? seat.state !== "available" : seat.state === "sold";
          const fill = picked
            ? c.selected
            : seat.state === "sold"
              ? c.sold
              : seat.state === "blocked"
                ? c.blocked
                : zone.color;

          return (
            <g key={seat.id}>
              <circle
                cx={point.x}
                cy={point.y}
                r={point.r}
                fill={fill}
                stroke={picked ? zone.color : "none"}
                strokeWidth={picked ? 3 : 0}
                opacity={locked && !picked ? 0.55 : 1}
              />
              {/* A generous invisible target — ring seats get small fast. */}
              <circle
                cx={point.x}
                cy={point.y}
                r={Math.max(point.r + 4, 11)}
                fill="transparent"
                style={{ cursor: interactive && !locked ? "pointer" : "default" }}
                onMouseEnter={() => setHover(seat)}
                onClick={() => {
                  if (!interactive || locked) return;
                  onToggle?.(seat.id);
                }}
              >
                <title>{`${seat.label} — ${picked ? "selected" : seat.state}`}</title>
              </circle>
            </g>
          );
        })}
      </svg>

      {hover ? (
        <div
          className={`pointer-events-none absolute left-1/2 top-2 -translate-x-1/2 rounded-lg px-2.5 py-1 text-xs ${
            theme === "dark"
              ? "border border-ink-700 bg-ink-850 text-ink-100"
              : "border border-slate-200 bg-white text-slate-800 shadow-sm"
          }`}
        >
          <span className="font-medium">{hover.label}</span>
          <span className="opacity-70"> · {selectedSet.has(hover.id) ? "selected" : hover.state}</span>
        </div>
      ) : null}
    </div>
  );
}

export function SeatLegend({
  color,
  theme = "dark",
  showSelected,
}: {
  color: string;
  theme?: "dark" | "light";
  showSelected?: boolean;
}) {
  const c = PALETTE[theme];
  const items = [
    { color, label: "Available" },
    ...(showSelected ? [{ color: c.selected, label: "Your pick" }] : []),
    { color: c.sold, label: showSelected ? "Taken" : "Sold" },
    { color: c.blocked, label: "Blocked" },
  ];
  return (
    <ul
      className={`flex flex-wrap gap-4 text-xs ${theme === "dark" ? "text-ink-400" : "text-slate-500"}`}
    >
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full" style={{ background: i.color }} />
          {i.label}
        </li>
      ))}
    </ul>
  );
}

/** Live thumbnail of a layout the organiser is still configuring. */
export function ShapePreview({
  shape,
  config,
  color,
  size = 110,
}: {
  shape: ZoneShape;
  config: MapZone;
  color: string;
  size?: number;
}) {
  const dots = useMemo(() => {
    if (shape === "grid") {
      const rows = Math.min(config.rows, 12);
      const cols = Math.min(config.cols, 18);
      const out: { x: number; y: number; r: number }[] = [];
      for (let r = 0; r < rows; r++)
        for (let c = 0; c < cols; c++) out.push(gridSeatPoint(rows, cols, r, c));
      return out;
    }
    const out: { x: number; y: number; r: number }[] = [];
    const count = Math.max(1, Math.min(config.ringCount, 14));
    for (let ring = 0; ring < count; ring++) {
      const seats = Math.min(config.ringStartSeats + config.ringSeatStep * ring, 90);
      for (let pos = 0; pos < seats; pos++)
        out.push(ringSeatPoint({ ...config, ringCount: count }, ring, pos, seats));
    }
    return out;
  }, [shape, config]);

  return (
    <svg viewBox={`0 0 ${VIEW} ${VIEW}`} width={size} height={size} aria-hidden>
      {dots.map((d, i) => (
        <circle key={i} cx={d.x} cy={d.y} r={Math.max(6, d.r)} fill={color} opacity={0.9} />
      ))}
    </svg>
  );
}
