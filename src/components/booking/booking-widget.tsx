"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { liveAvailability, priceCart, startCheckout } from "@/app/e/actions";
import { formatMinor } from "@/lib/money";
import type { CartLine } from "@/lib/pricing";
import type { RingConfig, StageConfig } from "@/lib/seat-layout";
import { NightPicker, type PublicNight } from "./night-picker";
import { SeatPicker } from "./seat-picker";

export type PublicZone = RingConfig & {
  id: string;
  name: string;
  description: string | null;
  priceMinor: number;
  compareAtMinor: number | null;
  admitsCount: number;
  minPerOrder: number;
  maxPerOrder: number;
  color: string;
  /** A season pass — one ticket covers every night. */
  allDates: boolean;
  rows: number;
  cols: number;
  layerColors: string[];
  layerNotes: string[];
  available: number;
  soldOut: boolean;
};

export type PublicSeat = {
  id: string;
  zoneId: string;
  label: string;
  rowLabel: string;
  seatNumber: number;
  ringIndex: number;
  posInRing: number;
  ringSize: number;
  x: number;
  y: number;
  taken: boolean;
};

type Quote = Awaited<ReturnType<typeof priceCart>>;

export function BookingWidget({
  event,
  zones,
  seats,
  nights,
  initialNightId,
  brandColor,
  initialCode,
  channel,
  supportPhone,
  stage,
}: {
  event: {
    id: string;
    title: string;
    layoutType: string;
    maxTicketsPerOrder: number;
    status: string;
    terms: string | null;
  };
  zones: PublicZone[];
  seats: PublicSeat[];
  nights: PublicNight[];
  initialNightId: string | null;
  brandColor: string;
  initialCode?: string | null;
  channel: string;
  supportPhone?: string | null;
  stage: StageConfig;
}) {
  const seated = event.layoutType === "seated";
  const multiNight = nights.length > 1;

  const [nightId, setNightId] = useState<string | null>(initialNightId);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [selectedSeats, setSelectedSeats] = useState<string[]>([]);
  const [code, setCode] = useState(initialCode ?? "");
  const [appliedCode, setAppliedCode] = useState<string | null>(initialCode ?? null);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [step, setStep] = useState<"select" | "details">("select");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [submitting, setSubmitting] = useState(false);
  const router = useRouter();

  /** Availability for the night in view, refreshed when the night changes. */
  const [liveZones, setLiveZones] = useState<Record<string, number> | null>(null);
  const [takenSeats, setTakenSeats] = useState<Set<string> | null>(null);
  const [loadingNight, startNightLoad] = useTransition();

  const effectiveZones = useMemo(
    () =>
      zones.map((z) => {
        const available = liveZones ? (liveZones[z.id] ?? 0) : z.available;
        return { ...z, available, soldOut: available <= 0 };
      }),
    [zones, liveZones],
  );

  const effectiveSeats = useMemo(
    () =>
      takenSeats ? seats.map((s) => ({ ...s, taken: takenSeats.has(s.id) })) : seats,
    [seats, takenSeats],
  );

  const seatsByZone = useMemo(() => {
    const map = new Map<string, PublicSeat[]>();
    for (const s of effectiveSeats) {
      if (!map.has(s.zoneId)) map.set(s.zoneId, []);
      map.get(s.zoneId)!.push(s);
    }
    return map;
  }, [effectiveSeats]);

  function chooseNight(id: string) {
    if (id === nightId) return;
    setNightId(id);
    // A cart is scoped to one night; switching starts a clean one.
    setQty({});
    setSelectedSeats([]);
    startNightLoad(async () => {
      const next = await liveAvailability(event.id, id);
      setLiveZones(next.zones);
      setTakenSeats(new Set(next.takenSeatIds));
    });
  }

  const lines = useMemo(() => {
    if (!seated) {
      return Object.entries(qty)
        .filter(([, n]) => n > 0)
        .map(([zoneId, n]) => ({ zoneId, qty: n }));
    }
    const counts = new Map<string, number>();
    for (const seatId of selectedSeats) {
      const seat = effectiveSeats.find((s) => s.id === seatId);
      if (seat) counts.set(seat.zoneId, (counts.get(seat.zoneId) ?? 0) + 1);
    }
    return [...counts].map(([zoneId, n]) => ({ zoneId, qty: n }));
  }, [qty, seated, effectiveSeats, selectedSeats]);

  const ticketCount = lines.reduce((n, l) => n + l.qty, 0);
  const cartKey = JSON.stringify(lines);

  useEffect(() => {
    if (ticketCount === 0) return;
    startTransition(async () => {
      const parsed = JSON.parse(cartKey) as CartLine[];
      const q = await priceCart(event.id, parsed, appliedCode);
      setQuote(q);
      if (q.codeError) setAppliedCode(null);
    });
  }, [event.id, appliedCode, ticketCount, cartKey]);

  const shownQuote = ticketCount === 0 ? null : quote;
  const onSale = event.status === "published";
  const atLimit = ticketCount >= event.maxTicketsPerOrder;
  const chosenNight = nights.find((n) => n.id === nightId) ?? null;

  if (!onSale) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center">
        <p className="text-lg font-semibold text-slate-900">Tickets aren&apos;t on sale yet</p>
        <p className="mt-1 text-sm text-slate-500">Check back soon — booking opens shortly.</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-5 py-4">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-slate-900">
            {step === "select"
              ? multiNight
                ? "Choose your night and passes"
                : "Choose your passes"
              : "Your details"}
          </p>
          {step === "details" ? (
            <button
              onClick={() => setStep("select")}
              className="ml-auto rounded-lg px-2 py-1 text-xs text-slate-500 hover:bg-slate-100 hover:text-slate-900"
            >
              ← Change passes
            </button>
          ) : null}
        </div>
        {step === "select" ? (
          <p className="mt-0.5 text-xs text-slate-500">
            Up to {event.maxTicketsPerOrder} tickets per booking.
          </p>
        ) : chosenNight ? (
          <p className="mt-0.5 text-xs text-slate-500">{chosenNight.label}</p>
        ) : null}
      </div>

      {step === "select" ? (
        <div className="space-y-5 p-5">
          {multiNight ? (
            <NightPicker
              nights={nights}
              selectedId={nightId}
              onSelect={chooseNight}
              loading={loadingNight}
              brandColor={brandColor}
            />
          ) : null}

          <div className={loadingNight ? "pointer-events-none opacity-50" : undefined}>
            {seated ? (
              <SeatPicker
                zones={effectiveZones}
                seatsByZone={seatsByZone}
                selected={selectedSeats}
                max={event.maxTicketsPerOrder}
                stage={stage}
                onChange={setSelectedSeats}
              />
            ) : (
              <ul className="space-y-3">
                {effectiveZones.map((z) => {
                  const n = qty[z.id] ?? 0;
                  const maxHere = Math.min(
                    z.maxPerOrder,
                    z.available,
                    event.maxTicketsPerOrder - ticketCount + n,
                  );
                  return (
                    <li
                      key={z.id}
                      className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 p-4"
                    >
                      <span
                        className="h-10 w-1 shrink-0 rounded-full"
                        style={{ background: z.color }}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="flex flex-wrap items-center gap-2 font-medium text-slate-900">
                          {z.name}
                          {z.admitsCount > 1 ? (
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                              admits {z.admitsCount}
                            </span>
                          ) : null}
                          {multiNight && z.allDates ? (
                            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                              all {nights.length} nights
                            </span>
                          ) : null}
                        </p>
                        {z.description ? (
                          <p className="mt-0.5 text-sm text-slate-500">{z.description}</p>
                        ) : null}
                        <p className="mt-1 text-sm">
                          <span className="font-semibold text-slate-900">
                            {formatMinor(z.priceMinor)}
                          </span>
                          {z.compareAtMinor ? (
                            <span className="ml-2 text-slate-400 line-through">
                              {formatMinor(z.compareAtMinor)}
                            </span>
                          ) : null}
                          {!z.soldOut && z.available <= 25 ? (
                            <span className="ml-2 text-amber-600">only {z.available} left</span>
                          ) : null}
                        </p>
                      </div>

                      {z.soldOut ? (
                        <span className="rounded-lg bg-slate-100 px-3 py-1.5 text-sm text-slate-500">
                          Sold out
                        </span>
                      ) : (
                        <div className="flex items-center gap-1 rounded-lg border border-slate-200">
                          <button
                            type="button"
                            aria-label={`Remove one ${z.name}`}
                            disabled={n === 0}
                            onClick={() => setQty({ ...qty, [z.id]: Math.max(0, n - 1) })}
                            className="grid size-9 place-items-center rounded-l-lg text-lg text-slate-600 hover:bg-slate-50 disabled:opacity-30"
                          >
                            −
                          </button>
                          <span className="w-8 text-center text-sm font-medium tabular-nums text-slate-900">
                            {n}
                          </span>
                          <button
                            type="button"
                            aria-label={`Add one ${z.name}`}
                            disabled={n >= maxHere || atLimit}
                            onClick={() => setQty({ ...qty, [z.id]: n + 1 })}
                            className="grid size-9 place-items-center rounded-r-lg text-lg text-slate-600 hover:bg-slate-50 disabled:opacity-30"
                          >
                            +
                          </button>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <CodeBox
            code={code}
            setCode={setCode}
            applied={appliedCode}
            error={shownQuote?.codeError ?? null}
            label={shownQuote?.appliedLabel ?? null}
            onApply={() => setAppliedCode(code.trim() || null)}
            onClear={() => {
              setCode("");
              setAppliedCode(null);
            }}
          />

          <Summary quote={shownQuote} pending={pending} nightLabel={chosenNight?.label} />

          <button
            type="button"
            disabled={ticketCount === 0}
            onClick={() => setStep("details")}
            className="w-full rounded-xl px-4 py-3.5 text-base font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-40"
            style={{ background: brandColor }}
          >
            {ticketCount === 0
              ? multiNight && !nightId
                ? "Pick a night to start"
                : "Select your passes"
              : `Continue · ${formatMinor(shownQuote?.totalMinor ?? 0)}`}
          </button>
        </div>
      ) : (
        <form
          className="space-y-4 p-5"
          onSubmit={async (e) => {
            e.preventDefault();
            setError(null);
            setSubmitting(true);
            const form = new FormData(e.currentTarget);
            const res = await startCheckout({
              eventId: event.id,
              lines,
              seatIds: selectedSeats,
              code: appliedCode,
              showDateId: nightId,
              buyerName: String(form.get("name") ?? ""),
              buyerPhone: String(form.get("phone") ?? ""),
              buyerEmail: String(form.get("email") ?? ""),
              channel,
            });
            if (!res.ok) {
              setError(res.error);
              setSubmitting(false);
              return;
            }
            router.push(`/pay/${res.publicId}`);
          }}
        >
          <label className="block">
            <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
              Full name
            </span>
            <input
              name="name"
              required
              autoFocus
              placeholder="Aarav Patel"
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-slate-900 outline-none focus:border-slate-400"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
              Mobile number
            </span>
            <input
              name="phone"
              required
              type="tel"
              placeholder="+91 98765 43210"
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-slate-900 outline-none focus:border-slate-400"
            />
            <span className="mt-1 block text-xs text-slate-500">
              Your passes are sent here on WhatsApp.
            </span>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
              Email <span className="normal-case text-slate-400">(optional)</span>
            </span>
            <input
              name="email"
              type="email"
              placeholder="you@example.com"
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-slate-900 outline-none focus:border-slate-400"
            />
          </label>

          <Summary quote={shownQuote} pending={pending} nightLabel={chosenNight?.label} />

          {event.terms ? (
            <p className="text-xs leading-relaxed text-slate-500">{event.terms}</p>
          ) : null}

          {error ? (
            <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          ) : null}

          <button
            disabled={submitting}
            className="w-full rounded-xl px-4 py-3.5 text-base font-semibold text-white transition disabled:opacity-60"
            style={{ background: brandColor }}
          >
            {submitting ? "Taking you to payment…" : `Pay ${formatMinor(shownQuote?.totalMinor ?? 0)}`}
          </button>

          {supportPhone ? (
            <p className="text-center text-xs text-slate-500">
              Need help? WhatsApp{" "}
              <a
                href={`https://wa.me/${supportPhone.replace(/\D/g, "")}`}
                className="underline"
                target="_blank"
                rel="noreferrer"
              >
                {supportPhone}
              </a>
            </p>
          ) : null}
        </form>
      )}
    </div>
  );
}

function CodeBox({
  code,
  setCode,
  applied,
  error,
  label,
  onApply,
  onClear,
}: {
  code: string;
  setCode: (v: string) => void;
  applied: string | null;
  error: string | null;
  label: string | null;
  onApply: () => void;
  onClear: () => void;
}) {
  if (applied && !error) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-sm">
        <span className="font-medium text-emerald-800">{applied} applied</span>
        {label ? <span className="text-emerald-700">· {label}</span> : null}
        <button
          type="button"
          onClick={onClear}
          className="ml-auto text-emerald-700 underline hover:text-emerald-900"
        >
          Remove
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="flex gap-2">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="Discount or referral code"
          className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3.5 py-2.5 font-mono text-sm uppercase text-slate-900 outline-none focus:border-slate-400"
        />
        <button
          type="button"
          onClick={onApply}
          className="shrink-0 rounded-xl border border-slate-300 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Apply
        </button>
      </div>
      {error ? <p className="mt-1.5 text-sm text-red-600">{error}</p> : null}
    </div>
  );
}

function Summary({
  quote,
  pending,
  nightLabel,
}: {
  quote: Quote | null;
  pending: boolean;
  nightLabel?: string;
}) {
  if (!quote || quote.ticketCount === 0) return null;
  return (
    <dl
      className={`space-y-1.5 rounded-xl bg-slate-50 p-4 text-sm transition-opacity ${pending ? "opacity-60" : ""}`}
    >
      {nightLabel ? (
        <div className="flex justify-between border-b border-slate-200 pb-2">
          <dt className="text-slate-600">Night</dt>
          <dd className="font-medium text-slate-900">{nightLabel}</dd>
        </div>
      ) : null}
      <div className="flex justify-between">
        <dt className="text-slate-600">
          {quote.ticketCount} ticket{quote.ticketCount > 1 ? "s" : ""}
        </dt>
        <dd className="tabular-nums text-slate-900">{formatMinor(quote.subtotalMinor)}</dd>
      </div>
      {quote.discountMinor > 0 ? (
        <div className="flex justify-between text-emerald-700">
          <dt>Discount</dt>
          <dd className="tabular-nums">−{formatMinor(quote.discountMinor)}</dd>
        </div>
      ) : null}
      {quote.feeMinor > 0 ? (
        <div className="flex justify-between">
          <dt className="text-slate-600">Convenience fee</dt>
          <dd className="tabular-nums text-slate-900">{formatMinor(quote.feeMinor)}</dd>
        </div>
      ) : null}
      <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-semibold">
        <dt className="text-slate-900">Total</dt>
        <dd className="tabular-nums text-slate-900">{formatMinor(quote.totalMinor)}</dd>
      </div>
    </dl>
  );
}
