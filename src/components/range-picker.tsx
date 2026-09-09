"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { cn } from "./ui";

export const RANGES = [
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
  { value: "all", label: "All time" },
] as const;

/** Writes the range to the URL, so a view is shareable and survives reload. */
export function RangePicker({ current }: { current: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();

  return (
    <select
      aria-label="Date range"
      value={current}
      disabled={pending}
      onChange={(e) => {
        const next = new URLSearchParams(params);
        next.set("range", e.target.value);
        start(() => router.replace(`${pathname}?${next}`, { scroll: false }));
      }}
      className={cn(
        "rounded-lg border border-ink-700 bg-white px-3 py-2 text-sm font-medium shadow-sm outline-none transition",
        "focus:border-brand-500 focus:ring-2 focus:ring-brand-600/20",
        pending && "opacity-60",
      )}
    >
      {RANGES.map((r) => (
        <option key={r.value} value={r.value}>
          {r.label}
        </option>
      ))}
    </select>
  );
}

/** The window as a plain sentence, e.g. "1 Oct – 31 Oct 2026". */
export function RangeLabel({ days, nowSec }: { days: number | null; nowSec: number }) {
  if (days == null) return <span>All time</span>;
  const end = new Date(nowSec * 1000);
  const startDate = new Date((nowSec - days * 86400) * 1000);
  const fmt = (d: Date, withYear = false) =>
    d.toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      ...(withYear ? { year: "numeric" } : {}),
    });
  return (
    <span>
      {fmt(startDate)} – {fmt(end, true)}
    </span>
  );
}
