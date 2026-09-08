"use client";

import { useId, useState } from "react";
import { formatMinor, formatMinorShort } from "@/lib/money";
import { cn } from "./ui";

/**
 * Categorical slots, dark-surface steps, validated against #131119:
 * lightness band, chroma floor, adjacent CVD ΔE 8.4, normal-vision ΔE 19.3,
 * contrast ≥ 3:1 — all pass. Assign in fixed order, never cycled.
 */
export const SERIES = [
  "#3987e5",
  "#d95926",
  "#199e70",
  "#c98500",
  "#d55181",
  "#008300",
  "#9085e9",
  "#e66767",
] as const;

export const STATUS = {
  good: "#0ca30c",
  warning: "#fab219",
  serious: "#ec835a",
  critical: "#d03b3b",
} as const;


/**
 * Charts are client components, so a formatter function can't be passed in
 * from a server page. Callers name a format instead.
 */
export type ValueFormat = "money" | "moneyShort" | "count" | "tickets" | "percent";

function fmt(format: ValueFormat, n: number) {
  switch (format) {
    case "money":
      return formatMinor(Math.round(n));
    case "moneyShort":
      return formatMinorShort(Math.round(n));
    case "tickets":
      return `${Math.round(n).toLocaleString("en-IN")} tickets`;
    case "percent":
      return `${n.toFixed(1)}%`;
    default:
      return Math.round(n).toLocaleString("en-IN");
  }
}

const GRID = "#2c2839";
const TEXT_MUTED = "#7c7594";

/* ------------------------------------------------------------ stat tiles */

export function StatTile({
  label,
  value,
  sub,
  delta,
  spark,
}: {
  label: string;
  value: string;
  sub?: string;
  /** Percent change vs the previous comparable window. */
  delta?: number | null;
  spark?: number[];
}) {
  const tone =
    delta == null ? null : delta > 0 ? "up" : delta < 0 ? "down" : "flat";
  return (
    <div className="rounded-[--radius-card] border border-ink-700/70 bg-ink-900/70 p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-ink-400">
        {label}
      </p>
      <div className="mt-2 flex items-end gap-2">
        <span className="tabular text-2xl font-semibold tracking-tight">
          {value}
        </span>
        {tone && delta != null ? (
          <span
            className={cn(
              "tabular mb-0.5 text-xs font-medium",
              tone === "up" && "text-emerald-400",
              tone === "down" && "text-red-400",
              tone === "flat" && "text-ink-400",
            )}
          >
            {tone === "up" ? "▲" : tone === "down" ? "▼" : "—"}{" "}
            {Math.abs(delta).toFixed(0)}%
          </span>
        ) : null}
      </div>
      {sub ? <p className="mt-1 text-xs text-ink-400">{sub}</p> : null}
      {spark && spark.length > 1 ? <Sparkline values={spark} /> : null}
    </div>
  );
}

function Sparkline({ values }: { values: number[] }) {
  const w = 160;
  const h = 28;
  const max = Math.max(...values, 1);
  const step = w / (values.length - 1);
  const d = values
    .map((v, i) => `${i === 0 ? "M" : "L"}${(i * step).toFixed(1)},${(h - (v / max) * h).toFixed(1)}`)
    .join(" ");
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className="mt-3 h-7 w-full"
      preserveAspectRatio="none"
      aria-hidden
    >
      <path d={d} fill="none" stroke={SERIES[0]} strokeWidth={2} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/* ------------------------------------------------------- time series area */

export type TrendPoint = { label: string; value: number; secondary?: number };

/**
 * Single-series revenue/volume over time. One series, so no legend box —
 * the title names it. Crosshair + tooltip on hover.
 */
export function TrendChart({
  points,
  format = "moneyShort",
  height = 220,
  color = SERIES[0],
  valueLabel = "Value",
}: {
  points: TrendPoint[];
  format?: ValueFormat;
  height?: number;
  color?: string;
  valueLabel?: string;
}) {
  const gid = useId().replace(/[:]/g, "");
  const [hover, setHover] = useState<number | null>(null);

  const pad = { top: 12, right: 8, bottom: 24, left: 48 };
  const w = 720;
  const h = height;
  const innerW = w - pad.left - pad.right;
  const innerH = h - pad.top - pad.bottom;

  const max = Math.max(...points.map((p) => p.value), 1);
  const niceMax = niceCeil(max);
  const stepX = points.length > 1 ? innerW / (points.length - 1) : innerW;
  const x = (i: number) => pad.left + i * stepX;
  const y = (v: number) => pad.top + innerH - (v / niceMax) * innerH;

  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(p.value)}`).join(" ");
  const area = `${line} L${x(points.length - 1)},${pad.top + innerH} L${x(0)},${pad.top + innerH} Z`;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => niceMax * f);

  const labelEvery = Math.max(1, Math.ceil(points.length / 8));

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="w-full"
        role="img"
        aria-label={`${valueLabel} over time`}
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id={`fill-${gid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.28} />
            <stop offset="100%" stopColor={color} stopOpacity={0.02} />
          </linearGradient>
        </defs>

        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={pad.left}
              x2={w - pad.right}
              y1={y(t)}
              y2={y(t)}
              stroke={GRID}
              strokeWidth={1}
            />
            <text
              x={pad.left - 8}
              y={y(t) + 4}
              textAnchor="end"
              fontSize={11}
              fill={TEXT_MUTED}
              className="tabular"
            >
              {fmt(format, t)}
            </text>
          </g>
        ))}

        <path d={area} fill={`url(#fill-${gid})`} />
        <path d={line} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />

        {points.map((p, i) =>
          i % labelEvery === 0 ? (
            <text
              key={p.label}
              x={x(i)}
              y={h - 6}
              textAnchor="middle"
              fontSize={11}
              fill={TEXT_MUTED}
            >
              {p.label}
            </text>
          ) : null,
        )}

        {hover != null ? (
          <>
            <line
              x1={x(hover)}
              x2={x(hover)}
              y1={pad.top}
              y2={pad.top + innerH}
              stroke={TEXT_MUTED}
              strokeWidth={1}
              strokeDasharray="3 3"
            />
            <circle
              cx={x(hover)}
              cy={y(points[hover].value)}
              r={5}
              fill={color}
              stroke="#131119"
              strokeWidth={2}
            />
          </>
        ) : null}

        {/* Hit targets are far wider than the marks they select. */}
        {points.map((p, i) => (
          <rect
            key={`hit-${p.label}`}
            x={x(i) - stepX / 2}
            y={pad.top}
            width={stepX}
            height={innerH}
            fill="transparent"
            onMouseEnter={() => setHover(i)}
          />
        ))}
      </svg>

      {hover != null ? (
        <div
          className="pointer-events-none absolute top-2 rounded-lg border border-ink-700 bg-ink-850 px-3 py-2 text-xs shadow-xl"
          style={{
            left: `${((x(hover) - pad.left) / innerW) * 92 + 4}%`,
            transform: "translateX(-50%)",
          }}
        >
          <p className="text-ink-400">{points[hover].label}</p>
          <p className="tabular mt-0.5 font-semibold text-ink-50">
            {fmt(format, points[hover].value)}
          </p>
          {points[hover].secondary != null ? (
            <p className="tabular mt-0.5 text-ink-300">
              {points[hover].secondary} tickets
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------- horizontal bars */

export function BarList({
  items,
  format = "money",
}: {
  items: { label: string; value: number; sub?: string }[];
  format?: ValueFormat;
}) {
  const max = Math.max(...items.map((i) => i.value), 1);
  return (
    <ul className="space-y-2.5">
      {items.map((item, i) => (
        <li key={item.label} className="group">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="flex min-w-0 items-center gap-2">
              <span
                className="size-2.5 shrink-0 rounded-[3px]"
                style={{ background: SERIES[i % SERIES.length] }}
              />
              <span className="truncate text-ink-200">{item.label}</span>
            </span>
            <span className="tabular shrink-0 font-medium text-ink-50">
              {fmt(format, item.value)}
            </span>
          </div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-ink-800">
            <div
              className="h-full rounded-full transition-[width] duration-500"
              style={{
                width: `${Math.max(2, (item.value / max) * 100)}%`,
                background: SERIES[i % SERIES.length],
              }}
              title={`${item.label}: ${fmt(format, item.value)}`}
            />
          </div>
          {item.sub ? (
            <p className="mt-1 text-xs text-ink-400">{item.sub}</p>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------------------------------------- sell-through */

export function SellThrough({
  rows,
}: {
  rows: { label: string; sold: number; capacity: number; priceLabel: string }[];
}) {
  return (
    <div className="space-y-3">
      {rows.map((r) => {
        const pct = r.capacity ? (r.sold / r.capacity) * 100 : 0;
        // Near-sold-out is the signal an organiser acts on, so it earns a color.
        const tone =
          pct >= 95 ? STATUS.critical : pct >= 75 ? STATUS.warning : STATUS.good;
        return (
          <div key={r.label}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="truncate text-ink-200">{r.label}</span>
              <span className="tabular shrink-0 text-xs text-ink-400">
                {r.priceLabel} · {r.sold}/{r.capacity}
              </span>
            </div>
            <div className="mt-1.5 flex h-2.5 gap-0.5 overflow-hidden rounded-full bg-ink-800">
              <div
                className="h-full rounded-full"
                style={{ width: `${Math.min(100, pct)}%`, background: tone }}
              />
            </div>
            <p className="tabular mt-1 text-xs text-ink-400">
              {pct.toFixed(0)}% sold
              {pct >= 95 ? " · almost gone" : ""}
            </p>
          </div>
        );
      })}
    </div>
  );
}

function niceCeil(n: number) {
  if (n <= 0) return 1;
  const mag = 10 ** Math.floor(Math.log10(n));
  return Math.ceil(n / mag) * mag;
}
