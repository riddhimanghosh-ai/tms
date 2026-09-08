import type { PublicZone } from "./booking-widget";

export type UrgencySignal = { tone: "hot" | "warm" | "info"; text: string };

/**
 * Scarcity worth showing, derived from real inventory. Nothing here is
 * invented — if the numbers aren't tight, the strip simply says less.
 */
export function urgencySignals(args: {
  zones: PublicZone[];
  ticketsSold: number;
  startsAt: number;
  nowSec: number;
}): UrgencySignal[] {
  const { zones, ticketsSold, startsAt, nowSec } = args;
  const out: UrgencySignal[] = [];

  const live = zones.filter((z) => !z.soldOut);
  const tightest = live.slice().sort((a, b) => a.available - b.available)[0];
  if (tightest && tightest.available <= 40) {
    out.push({
      tone: tightest.available <= 15 ? "hot" : "warm",
      text: `Only ${tightest.available} ${tightest.name} left`,
    });
  }

  const soldOut = zones.filter((z) => z.soldOut);
  if (soldOut.length) {
    out.push({
      tone: "hot",
      text:
        soldOut.length === 1
          ? `${soldOut[0].name} is sold out`
          : `${soldOut.length} categories sold out`,
    });
  }

  if (ticketsSold >= 50) {
    out.push({ tone: "info", text: `${ticketsSold.toLocaleString("en-IN")} passes already booked` });
  }

  const daysLeft = Math.ceil((startsAt - nowSec) / 86400);
  if (daysLeft > 0 && daysLeft <= 7) {
    out.push({
      tone: daysLeft <= 2 ? "hot" : "warm",
      text: daysLeft === 1 ? "Booking closes tomorrow" : `Only ${daysLeft} days to book`,
    });
  }

  return out.slice(0, 3);
}

const tones = {
  hot: "border-rose-200 bg-rose-50 text-rose-700",
  warm: "border-amber-200 bg-amber-50 text-amber-800",
  info: "border-slate-200 bg-slate-50 text-slate-600",
} as const;

export function UrgencyStrip({ signals }: { signals: UrgencySignal[] }) {
  if (!signals.length) return null;
  return (
    <ul className="flex flex-wrap gap-2">
      {signals.map((s) => (
        <li
          key={s.text}
          className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium ${tones[s.tone]}`}
        >
          {s.tone === "hot" ? "🔥" : s.tone === "warm" ? "⏳" : "✓"} {s.text}
        </li>
      ))}
    </ul>
  );
}
