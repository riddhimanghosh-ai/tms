"use client";

import { useMemo, useState } from "react";
import {
  CENTRE,
  VIEW,
  gridSeatPoint,
  layerColor,
  resolveStage,
  ringSeatPoint,
  stageGeometry,
  type RingConfig,
  type StageConfig,
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
  /** One hex per layer; blanks fall back to `color`. */
  layerColors?: string[];
  /** One short note per layer, shown in the legend and on hover. */
  layerNotes?: string[];
};

const PALETTE = {
  dark: {
    sold: "#5b2230",
    blocked: "#2c2839",
    selected: "#ffffff",
    guide: "#2c2839",
    stageFill: "#201d2b",
    stageStroke: "#3d3852",
    stageText: "#a49dbb",
    rowText: "#7c7594",
  },
  light: {
    sold: "#d9d5e0",
    blocked: "#b9b4c6",
    selected: "#0f172a",
    guide: "#e6e3ee",
    stageFill: "#eceaf3",
    stageStroke: "#d6d2e2",
    stageText: "#6b6679",
    rowText: "#9a95a8",
  },
} as const;

const DEFAULT_STAGE: StageConfig = { label: "STAGE", position: "auto", shape: "auto" };

/**
 * One renderer for every seat layout, used by the organiser's editor and the
 * buyer's picker alike. Positions come from `seat-layout`, so what an organiser
 * arranges is pixel-for-pixel what a buyer taps.
 */
export function SeatMap({
  zone,
  seats,
  selected = [],
  onToggle,
  mode,
  theme = "dark",
  stage = DEFAULT_STAGE,
  maxHeight = 460,
}: {
  zone: MapZone;
  seats: MapSeat[];
  selected?: string[];
  onToggle?: (seatId: string) => void;
  /** edit: click blocks/unblocks. select: click picks a seat to buy. */
  mode: "edit" | "select";
  theme?: "dark" | "light";
  stage?: StageConfig;
  maxHeight?: number;
}) {
  const c = PALETTE[theme];
  const [hover, setHover] = useState<MapSeat | null>(null);
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const isRing = zone.shape !== "grid";
  const colors = zone.layerColors ?? [];
  const notes = zone.layerNotes ?? [];

  const placed = useMemo(
    () =>
      seats.map((seat) => {
        const point = isRing
          ? ringSeatPoint(zone, seat.ringIndex, seat.posInRing, seat.ringSize || 1)
          : gridSeatPoint(zone.rows, zone.cols, seat.y, seat.x - 1);
        return { seat, point, layer: isRing ? seat.ringIndex : seat.y };
      }),
    [seats, zone, isRing],
  );

  const guides = useMemo(() => {
    if (!isRing) return [];
    const byRing = new Map<number, number>();
    for (const { seat } of placed) byRing.set(seat.ringIndex, seat.ringSize || 1);
    return [...byRing.entries()]
      .sort(([a], [b]) => a - b)
      .map(([ringIndex, size]) => {
        const p = ringSeatPoint(zone, ringIndex, 0, size);
        return { ringIndex, radius: Math.round(Math.hypot(p.x - CENTRE, p.y - CENTRE) * 100) / 100 };
      });
  }, [placed, zone, isRing]);

  const innerRadius = guides[0]?.radius ?? 150;
  const resolvedStage = resolveStage(stage, zone.shape as ZoneShape);
  const stageGeo = stageGeometry(resolvedStage, innerRadius);

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
  const hoverNote = hover ? notes[isRing ? hover.ringIndex : hover.y] : null;

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
        {isRing
          ? guides.map((g) => (
              <circle
                key={g.ringIndex}
                cx={CENTRE}
                cy={CENTRE}
                r={g.radius}
                fill="none"
                stroke={c.guide}
                strokeWidth={1}
              />
            ))
          : rowLabels.map((r) => (
              <text key={r.label} x={16} y={r.y + 6} fontSize={18} fill={c.rowText}>
                {r.label}
              </text>
            ))}

        {stageGeo ? (
          <g>
            {stageGeo.kind === "circle" ? (
              <circle
                cx={stageGeo.cx}
                cy={stageGeo.cy}
                r={stageGeo.r}
                fill={c.stageFill}
                stroke={c.stageStroke}
              />
            ) : stageGeo.kind === "curve" ? (
              <path
                d={stageGeo.path}
                fill={c.stageFill}
                stroke={c.stageStroke}
                strokeWidth={2}
              />
            ) : (
              <rect
                x={stageGeo.x}
                y={stageGeo.y}
                width={stageGeo.width}
                height={stageGeo.height}
                rx={stageGeo.height / 2}
                fill={c.stageFill}
                stroke={c.stageStroke}
              />
            )}
            <text
              x={stageGeo.labelX}
              y={stageGeo.labelY}
              textAnchor="middle"
              fontSize={stageGeo.kind === "circle" ? 28 : 20}
              fill={c.stageText}
              style={{ letterSpacing: 4 }}
              transform={
                stageGeo.rotate
                  ? `rotate(${stageGeo.rotate} ${stageGeo.labelX} ${stageGeo.labelY})`
                  : undefined
              }
            >
              {resolvedStage.label}
            </text>
          </g>
        ) : null}

        {placed.map(({ seat, point, layer }) => {
          const picked = selectedSet.has(seat.id);
          const locked = mode === "select" ? seat.state !== "available" : seat.state === "sold";
          const own = layerColor(colors, zone.color, layer);
          const fill = picked
            ? c.selected
            : seat.state === "sold"
              ? c.sold
              : seat.state === "blocked"
                ? c.blocked
                : own;

          return (
            <g key={seat.id}>
              <circle
                cx={point.x}
                cy={point.y}
                r={point.r}
                fill={fill}
                stroke={picked ? own : "none"}
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
          className={`pointer-events-none absolute left-1/2 top-2 max-w-[85%] -translate-x-1/2 rounded-lg px-2.5 py-1.5 text-xs ${
            theme === "dark"
              ? "border border-ink-700 bg-ink-850 text-ink-100"
              : "border border-slate-200 bg-white text-slate-800 shadow-sm"
          }`}
        >
          <span className="font-medium">{hover.label}</span>
          <span className="opacity-70">
            {" "}
            · {selectedSet.has(hover.id) ? "selected" : hover.state}
          </span>
          {hoverNote ? <span className="block opacity-70">{hoverNote}</span> : null}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Legend. With per-layer colours it lists each layer and its note, because a
 * single "Available" swatch would no longer describe the map.
 */
export function SeatLegend({
  color,
  theme = "dark",
  showSelected,
  layers,
}: {
  color: string;
  theme?: "dark" | "light";
  showSelected?: boolean;
  layers?: { label: string; color: string; note?: string; count?: number }[];
}) {
  const c = PALETTE[theme];
  const muted = theme === "dark" ? "text-ink-400" : "text-slate-500";
  const strong = theme === "dark" ? "text-ink-200" : "text-slate-700";

  const states = [
    ...(showSelected ? [{ color: c.selected, label: "Your pick" }] : []),
    { color: c.sold, label: showSelected ? "Taken" : "Sold" },
    { color: c.blocked, label: "Blocked" },
  ];

  if (layers?.length) {
    return (
      <div className="space-y-2">
        <ul className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
          {layers.map((l) => (
            <li key={l.label} className="flex items-start gap-2 text-xs">
              <span
                className="mt-1 size-2.5 shrink-0 rounded-full"
                style={{ background: l.color }}
              />
              <span className="min-w-0">
                <span className={strong}>{l.label}</span>
                {l.count != null ? <span className={muted}> · {l.count} seats</span> : null}
                {l.note ? <span className={`block ${muted}`}>{l.note}</span> : null}
              </span>
            </li>
          ))}
        </ul>
        <ul className={`flex flex-wrap gap-4 border-t pt-2 text-xs ${muted} ${theme === "dark" ? "border-ink-700" : "border-slate-100"}`}>
          {states.map((s) => (
            <li key={s.label} className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-full" style={{ background: s.color }} />
              {s.label}
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <ul className={`flex flex-wrap gap-4 text-xs ${muted}`}>
      {[{ color, label: "Available" }, ...states].map((i) => (
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
        for (let cIdx = 0; cIdx < cols; cIdx++) out.push(gridSeatPoint(rows, cols, r, cIdx));
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
