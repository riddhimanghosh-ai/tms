"use client";

import { useId, useMemo, useState } from "react";
import { formatMinor, formatMinorShort } from "@/lib/money";
import { cn } from "./ui";

/**
 * Categorical slots stepped for a white surface. Validated: lightness band,
 * chroma floor, adjacent CVD ΔE 9.1, normal-vision ΔE 19.6. Three slots sit
 * under 3:1 against white, so every chart here carries visible direct labels —
 * the relief the contrast warning requires. Assign in order, never cycled.
 */
export const SERIES = [
  "#2a78d6",
  "#eb6834",
  "#1baf7a",
  "#eda100",
  "#e87ba4",
  "#008300",
  "#4a3aa7",
  "#e34948",
] as const;

export const STATUS = {
  good: "#0ca30c",
  warning: "#fab219",
  serious: "#ec835a",
  critical: "#d03b3b",
} as const;

const GRID = "#ece9f3";
const TEXT_MUTED = "#8b8598";
const BRAND = "#e11d48";

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
  /** Percent change against the previous comparable window. */
  delta?: number | null;
  spark?: number[];
}) {
  const tone = delta == null ? null : delta > 0 ? "up" : delta < 0 ? "down" : "flat";

  return (
    <div className="rounded-[--radius-card] border border-ink-700 bg-white p-5 card-shadow">
      <p className="text-sm font-medium text-ink-400">{label}</p>
      <div className="mt-1.5 flex items-baseline gap-2">
        <span className="tabular text-[28px] font-semibold leading-none tracking-tight">
          {value}
        </span>
      </div>
      <div className="mt-2 flex items-center gap-2">
        {tone && delta != null ? (
          <span
            className={cn(
              "tabular inline-flex items-center gap-0.5 text-sm font-medium",
              tone === "up" && "text-emerald-600",
              tone === "down" && "text-rose-600",
              tone === "flat" && "text-ink-400",
            )}
          >
            {tone === "up" ? "↑" : tone === "down" ? "↓" : "→"}
            {Math.abs(delta).toFixed(0)}%
          </span>
        ) : null}
        {sub ? <span className="truncate text-sm text-ink-400">{sub}</span> : null}
      </div>
      {spark && spark.length > 1 ? <Sparkline values={spark} /> : null}
    </div>
  );
}

function Sparkline({ values }: { values: number[] }) {
  const w = 160;
  const h = 26;
  const max = Math.max(...values, 1);
  const step = w / (values.length - 1);
  const d = values
    .map((v, i) => `${i === 0 ? "M" : "L"}${(i * step).toFixed(1)},${(h - (v / max) * h).toFixed(1)}`)
    .join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="mt-3 h-6 w-full" preserveAspectRatio="none" aria-hidden>
      <path d={d} fill="none" stroke={BRAND} strokeWidth={2} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/* ------------------------------------------------------- time series area */

export type TrendPoint = { label: string; value: number; secondary?: number };

/** Single series over time, so no legend box — the title names it. */
export function TrendChart({
  points,
  format = "moneyShort",
  height = 240,
  color = BRAND,
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

  const pad = { top: 14, right: 10, bottom: 26, left: 52 };
  const w = 760;
  const h = height;
  const innerW = w - pad.left - pad.right;
  const innerH = h - pad.top - pad.bottom;

  const niceMax = niceCeil(Math.max(...points.map((p) => p.value), 1));
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
            <stop offset="0%" stopColor={color} stopOpacity={0.22} />
            <stop offset="100%" stopColor={color} stopOpacity={0.01} />
          </linearGradient>
        </defs>

        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.left} x2={w - pad.right} y1={y(t)} y2={y(t)} stroke={GRID} strokeWidth={1} />
            <text
              x={pad.left - 10}
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
        <path d={line} fill="none" stroke={color} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />

        {points.map((p, i) =>
          i % labelEvery === 0 ? (
            <circle key={`dot-${p.label}`} cx={x(i)} cy={y(p.value)} r={3.5} fill="#fff" stroke={color} strokeWidth={2} />
          ) : null,
        )}

        {points.map((p, i) =>
          i % labelEvery === 0 ? (
            <text key={p.label} x={x(i)} y={h - 6} textAnchor="middle" fontSize={11} fill={TEXT_MUTED}>
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
            <circle cx={x(hover)} cy={y(points[hover].value)} r={5.5} fill={color} stroke="#fff" strokeWidth={2.5} />
          </>
        ) : null}

        {/* Hit targets far wider than the marks they select. */}
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
          className="pointer-events-none absolute top-2 rounded-xl border border-ink-700 bg-white px-3 py-2 text-xs card-shadow"
          style={{
            left: `${((x(hover) - pad.left) / innerW) * 92 + 4}%`,
            transform: "translateX(-50%)",
          }}
        >
          <p className="text-ink-400">{points[hover].label}</p>
          <p className="tabular mt-0.5 font-semibold">{fmt(format, points[hover].value)}</p>
          {points[hover].secondary != null ? (
            <p className="tabular mt-0.5 text-ink-300">{points[hover].secondary} tickets</p>
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
  showShare = false,
}: {
  items: { label: string; value: number; sub?: string }[];
  format?: ValueFormat;
  /** Adds each row's share of the total as a right-aligned percentage. */
  showShare?: boolean;
}) {
  const max = Math.max(...items.map((i) => i.value), 1);
  const total = items.reduce((n, i) => n + i.value, 0) || 1;

  return (
    <ul className="space-y-3.5">
      {items.map((item, i) => (
        <li key={item.label}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate font-medium text-ink-200">{item.label}</span>
            <span className="tabular shrink-0 font-semibold">
              {showShare ? `${((item.value / total) * 100).toFixed(0)}%` : fmt(format, item.value)}
            </span>
          </div>
          <div className="mt-2 flex items-center gap-3">
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-ink-800">
              <div
                className="h-full rounded-full transition-[width] duration-500"
                style={{
                  width: `${Math.max(2, (item.value / max) * 100)}%`,
                  background: SERIES[i % SERIES.length],
                }}
                title={`${item.label}: ${fmt(format, item.value)}`}
              />
            </div>
            {showShare ? (
              <span className="tabular shrink-0 text-xs text-ink-400">{fmt(format, item.value)}</span>
            ) : null}
          </div>
          {item.sub ? <p className="mt-1 text-xs text-ink-400">{item.sub}</p> : null}
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------------------------------------------ donut */

/**
 * Composition of a whole — sales by source. Every slice is direct-labelled in
 * the legend with its share, which is also the relief for the light palette's
 * sub-3:1 contrast slots.
 */
export function DonutChart({
  items,
  format = "money",
  centreLabel,
}: {
  items: { label: string; value: number }[];
  format?: ValueFormat;
  centreLabel?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const total = items.reduce((n, i) => n + i.value, 0);

  const arcs = useMemo(() => {
    if (total <= 0) return [];
    const r = 68;
    const cx = 90;
    const cy = 90;
    let angle = -90;
    return items.map((item, i) => {
      const share = item.value / total;
      const sweep = share * 360;
      // A 2px surface gap between slices keeps adjacent fills separable.
      const gap = share > 0.02 ? 1.6 : 0;
      const a0 = angle + gap;
      const a1 = angle + sweep - gap;
      angle += sweep;
      const rad = (a: number) => (a * Math.PI) / 180;
      const large = sweep > 180 ? 1 : 0;
      const path = [
        `M ${cx + r * Math.cos(rad(a0))} ${cy + r * Math.sin(rad(a0))}`,
        `A ${r} ${r} 0 ${large} 1 ${cx + r * Math.cos(rad(a1))} ${cy + r * Math.sin(rad(a1))}`,
      ].join(" ");
      return { path, share, color: SERIES[i % SERIES.length], item };
    });
  }, [items, total]);

  if (total <= 0) return <p className="text-sm text-ink-400">Nothing sold yet.</p>;

  return (
    <div className="flex flex-wrap items-center gap-6">
      <svg viewBox="0 0 180 180" className="size-[168px] shrink-0" role="img" aria-label="Share by source">
        {arcs.map((a, i) => (
          <path
            key={a.item.label}
            d={a.path}
            fill="none"
            stroke={a.color}
            strokeWidth={hover === i ? 30 : 24}
            strokeLinecap="butt"
            className="transition-[stroke-width]"
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
          />
        ))}
        <text x={90} y={86} textAnchor="middle" fontSize={22} fontWeight={600} fill="#171325" className="tabular">
          {hover != null ? `${(arcs[hover].share * 100).toFixed(0)}%` : items.length}
        </text>
        <text x={90} y={104} textAnchor="middle" fontSize={11} fill={TEXT_MUTED}>
          {hover != null ? arcs[hover].item.label : (centreLabel ?? "sources")}
        </text>
      </svg>

      <ul className="min-w-40 flex-1 space-y-2.5">
        {arcs.map((a, i) => (
          <li
            key={a.item.label}
            className="flex items-center gap-2.5 text-sm"
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
          >
            <span className="size-2.5 shrink-0 rounded-full" style={{ background: a.color }} />
            <span className="min-w-0 flex-1 truncate text-ink-200">{a.item.label}</span>
            <span className="tabular shrink-0 font-semibold">{(a.share * 100).toFixed(0)}%</span>
            <span className="tabular w-20 shrink-0 text-right text-xs text-ink-400">
              {fmt(format, a.item.value)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------- sell-through */

export function SellThrough({
  rows,
}: {
  rows: { label: string; sold: number; capacity: number; priceLabel: string }[];
}) {
  return (
    <div className="space-y-3.5">
      {rows.map((r) => {
        const pct = r.capacity ? (r.sold / r.capacity) * 100 : 0;
        // Near-sold-out is the signal an organiser acts on, so it earns a colour.
        const tone = pct >= 95 ? STATUS.critical : pct >= 75 ? STATUS.warning : STATUS.good;
        return (
          <div key={r.label}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="truncate font-medium text-ink-200">{r.label}</span>
              <span className="tabular shrink-0 text-xs text-ink-400">
                {r.priceLabel} · {r.sold}/{r.capacity}
              </span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-ink-800">
              <div className="h-full rounded-full" style={{ width: `${Math.min(100, pct)}%`, background: tone }} />
            </div>
            <p className="tabular mt-1 text-xs text-ink-400">
              {pct.toFixed(0)}% sold{pct >= 95 ? " · almost gone" : ""}
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
