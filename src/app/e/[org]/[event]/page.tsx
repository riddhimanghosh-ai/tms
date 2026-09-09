import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { loadPublicEvent } from "@/lib/public-event";
import { formatMinor } from "@/lib/money";
import { Countdown } from "@/components/booking/countdown";
import { UrgencyStrip, urgencySignals } from "@/components/booking/urgency";
import { HIGHLIGHT_ICONS, parseHighlights } from "@/lib/highlights";
import { ViewTracker } from "@/components/booking/view-tracker";
import { BuyerNav } from "@/components/booking/buyer-nav";

type Props = {
  params: Promise<{ org: string; event: string }>;
  searchParams: Promise<{ ref?: string; code?: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { org, event } = await params;
  const data = await loadPublicEvent(org, event);
  if (!data) return { title: "Event not found" };
  return {
    title: `${data.event.title} — book tickets`,
    description: data.event.tagline ?? data.event.description ?? undefined,
  };
}

export default async function EventLandingPage({ params, searchParams }: Props) {
  const { org, event: eventSlug } = await params;
  const { ref, code } = await searchParams;
  const data = await loadPublicEvent(org, eventSlug);
  if (!data) notFound();

  const { event, organizer, zones, nights, ticketsSold } = data;
  const onSale = event.status === "published";
  const start = new Date(event.startsAt * 1000);
  const cheapest = zones.filter((z) => !z.soldOut).sort((a, b) => a.priceMinor - b.priceMinor)[0];

  const query = new URLSearchParams();
  if (ref) query.set("ref", ref);
  if (code) query.set("code", code);
  const bookHref = `/e/${org}/${eventSlug}/book${query.size ? `?${query}` : ""}`;
  // "Book" on a tier opens that tier: its seat map on a reserved-seating
  // event, or one ticket of that category already in the cart on open ground.
  const bookZoneHref = (zoneId: string) => {
    const q = new URLSearchParams(query);
    q.set("zone", zoneId);
    return `/e/${org}/${eventSlug}/book?${q}`;
  };

  const signals = urgencySignals({
    zones,
    ticketsSold,
    startsAt: event.startsAt,
    nowSec: data.nowSec,
  });

  const upcoming = nights.filter((n) => !n.past);
  const multiNight = nights.length > 1;
  const firstNight = upcoming[0] ?? nights[0] ?? null;
  const lastNight = nights[nights.length - 1] ?? null;

  const highlights = parseHighlights(event.highlights);
  const capacityTotal = zones.reduce((n, z) => n + z.available, 0) + ticketsSold;
  const filledPct = capacityTotal > 0 ? Math.round((ticketsSold / capacityTotal) * 100) : 0;

  const proof = [
    {
      value:
        ticketsSold >= 1000
          ? `${(ticketsSold / 1000).toFixed(1)}K+`
          : ticketsSold.toLocaleString("en-IN"),
      label: "Passes booked",
    },
    multiNight
      ? { value: String(nights.length), label: "Nights" }
      : { value: cheapest ? formatMinor(cheapest.priceMinor) : "—", label: "Entry from" },
    { value: `${filledPct}%`, label: "Of capacity gone" },
  ];

  const facts = [
    {
      label: multiNight ? "Runs" : "Date",
      value: multiNight && firstNight && lastNight
        ? `${new Date(firstNight.startsAt * 1000).toLocaleDateString("en-IN", { day: "numeric", month: "short" })} – ${new Date(lastNight.startsAt * 1000).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`
        : start.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" }),
    },
    {
      label: "Doors",
      value: new Date((event.doorsOpenAt ?? event.startsAt) * 1000).toLocaleTimeString("en-IN", {
        hour: "2-digit",
        minute: "2-digit",
      }),
    },
    { label: "Venue", value: event.venue ?? "To be announced" },
    multiNight
      ? { label: "Nights", value: `${upcoming.length} still open of ${nights.length}` }
      : { label: "City", value: event.city ?? "—" },
  ];

  return (
    <div className="surface-light min-h-dvh pb-24 lg:pb-0">
      <ViewTracker eventId={event.id} source="web" referral={ref ?? null} />

      <BuyerNav
        backHref="/"
        backLabel="All events"
        crumbs={[
          { label: "Events", href: "/" },
          ...(event.city ? [{ label: event.city, href: `/?city=${encodeURIComponent(event.city)}` }] : []),
          { label: event.title },
        ]}
        action={
          <Link
            href={bookHref}
            className="hidden shrink-0 rounded-lg px-4 py-2 text-sm font-semibold text-white sm:inline-block"
            style={{ background: organizer.brandColor }}
          >
            {onSale ? "Book tickets" : "Notify me"}
          </Link>
        }
      />

      <header
        className="relative"
        style={{
          background: event.coverImageUrl
            ? `linear-gradient(180deg, rgba(10,8,15,.5), rgba(10,8,15,.9)), url(${event.coverImageUrl}) center/cover`
            : `linear-gradient(140deg, ${organizer.brandColor}, #16121f 72%)`,
        }}
      >
        <div className="mx-auto max-w-5xl px-5 py-14 sm:py-20">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-white/70">
            {organizer.name}
          </p>
          <h1 className="mt-3 max-w-3xl text-4xl font-bold leading-[1.08] tracking-tight text-white sm:text-6xl">
            {event.title}
          </h1>
          {event.tagline ? (
            <p className="mt-4 max-w-2xl text-lg leading-relaxed text-white/85">{event.tagline}</p>
          ) : null}

          <div className="mt-8 max-w-md">
            <Countdown targetSec={firstNight?.startsAt ?? event.startsAt} tone="dark" label={multiNight ? "Next night in" : "Doors open in"} />
          </div>

          <div className="mt-8 flex flex-wrap items-center gap-4">
            <Link
              href={bookHref}
              className="rounded-xl px-7 py-4 text-base font-semibold text-white shadow-lg transition hover:brightness-110"
              style={{ background: organizer.brandColor }}
            >
              {onSale ? "Book tickets" : "Tickets coming soon"}
            </Link>
            {cheapest ? (
              <p className="text-white/85">
                From{" "}
                <span className="text-xl font-semibold text-white">
                  {formatMinor(cheapest.priceMinor)}
                </span>
              </p>
            ) : null}
          </div>
        </div>
      </header>

      {highlights.length ? (
        <div className="border-b border-slate-200 bg-white">
          <ul className="mx-auto grid max-w-5xl grid-cols-2 gap-px overflow-hidden px-5 py-5 sm:grid-cols-4">
            {highlights.map((h) => (
              <li key={h.label} className="flex flex-col items-center gap-2 px-2 text-center">
                <span
                  className="grid size-11 place-items-center rounded-2xl text-xl"
                  style={{
                    background: `${organizer.brandColor}14`,
                    color: organizer.brandColor,
                  }}
                  aria-hidden
                >
                  {HIGHLIGHT_ICONS[h.icon].glyph}
                </span>
                <span className="text-sm font-medium leading-tight text-slate-700">{h.label}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-5xl px-5 py-5">
          <Link
            href={bookHref}
            className="block w-full rounded-2xl px-6 py-4 text-center text-lg font-semibold text-white shadow-lg transition hover:brightness-110 lg:hidden"
            style={{ background: organizer.brandColor }}
          >
            {onSale ? "Book Now" : "Tickets coming soon"}
          </Link>

          <dl className="mt-5 grid grid-cols-3 gap-4 lg:mt-0">
            {proof.map((pItem) => (
              <div key={pItem.label} className="text-center">
                <dt className="sr-only">{pItem.label}</dt>
                <dd>
                  <span className="block text-2xl font-bold tracking-tight text-slate-900">
                    {pItem.value}
                  </span>
                  <span className="mt-0.5 block text-xs text-slate-500">{pItem.label}</span>
                </dd>
              </div>
            ))}
          </dl>

          {signals.length ? (
            <div className="mt-5">
              <UrgencyStrip signals={signals} />
            </div>
          ) : null}
        </div>
      </div>

      <main className="mx-auto max-w-5xl space-y-12 px-5 py-12">
        <section>
          <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-slate-200 bg-slate-200 sm:grid-cols-4">
            {facts.map((f) => (
              <div key={f.label} className="bg-white p-4">
                <dt className="text-xs uppercase tracking-wide text-slate-400">{f.label}</dt>
                <dd className="mt-1 font-medium text-slate-900">{f.value}</dd>
              </div>
            ))}
          </dl>
        </section>

        {multiNight ? (
          <section>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-2xl font-semibold tracking-tight text-slate-900">
                  {nights.length} nights
                </h2>
                <p className="mt-1 text-slate-500">
                  Each night is booked separately — pick yours at the next step.
                </p>
              </div>
            </div>

            <ul className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {nights.map((n) => {
                const d = new Date(n.startsAt * 1000);
                const gone = n.past || n.soldOut;
                return (
                  <li
                    key={n.id}
                    className={`flex items-center gap-3 rounded-xl border p-3 ${
                      gone ? "border-slate-200 bg-slate-50" : "border-slate-200 bg-white"
                    }`}
                  >
                    <div
                      className={`w-12 shrink-0 rounded-lg py-1 text-center ${
                        gone ? "bg-slate-200 text-slate-500" : "bg-slate-900 text-white"
                      }`}
                    >
                      <span className="block text-[10px] uppercase tracking-wide opacity-80">
                        {d.toLocaleDateString("en-IN", { month: "short" })}
                      </span>
                      <span className="block text-base font-semibold leading-tight">
                        {d.getDate()}
                      </span>
                    </div>
                    <div className="min-w-0">
                      <p
                        className={`truncate text-sm font-medium ${gone ? "text-slate-500" : "text-slate-900"}`}
                      >
                        {n.label}
                      </p>
                      <p className="truncate text-xs text-slate-500">
                        {n.past
                          ? "Passed"
                          : n.soldOut
                            ? "Sold out"
                            : `${d.toLocaleDateString("en-IN", { weekday: "long" })} · ${d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}`}
                      </p>
                    </div>
                    {!gone ? (
                      <Link
                        href={bookHref}
                        className="ml-auto shrink-0 text-sm font-medium underline"
                        style={{ color: organizer.brandColor }}
                      >
                        Book
                      </Link>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}

        {event.description ? (
          <section>
            <h2 className="text-2xl font-semibold tracking-tight text-slate-900">
              About this event
            </h2>
            <p className="mt-3 max-w-3xl whitespace-pre-line text-lg leading-relaxed text-slate-600">
              {event.description}
            </p>
          </section>
        ) : null}

        <section id="tickets">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight text-slate-900">
                {event.layoutType === "seated" ? "Seating & prices" : "Passes"}
              </h2>
              <p className="mt-1 text-slate-500">
                {event.layoutType === "seated"
                  ? "Pick a block to open its seat map and choose your exact seats."
                  : multiNight
                  ? "Pick your night, then your category."
                  : "Choose a category and how many you need."}
              </p>
            </div>
            <Link
              href={bookHref}
              className="rounded-lg px-4 py-2.5 text-sm font-semibold text-white"
              style={{ background: organizer.brandColor }}
            >
              Book tickets
            </Link>
          </div>

          <ul className="mt-5 grid gap-3 sm:grid-cols-2">
            {zones.map((z) => {
              const scarce = !z.soldOut && z.available <= 25;
              return (
                <li
                  key={z.id}
                  className={`rounded-2xl border p-5 transition ${
                    z.soldOut ? "border-slate-200 bg-slate-50" : "border-slate-200 bg-white hover:border-slate-300"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2 font-semibold text-slate-900">
                        <span
                          className="size-2.5 rounded-full"
                          style={{ background: z.color }}
                        />
                        {z.name}
                        {z.admitsCount > 1 ? (
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                            admits {z.admitsCount}
                          </span>
                        ) : null}
                      </p>
                      {z.description ? (
                        <p className="mt-1.5 text-sm leading-relaxed text-slate-500">
                          {z.description}
                        </p>
                      ) : null}
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-lg font-semibold text-slate-900">
                        {formatMinor(z.priceMinor)}
                      </p>
                      {z.compareAtMinor ? (
                        <p className="text-sm text-slate-400 line-through">
                          {formatMinor(z.compareAtMinor)}
                        </p>
                      ) : null}
                    </div>
                  </div>

                  <div className="mt-4 flex items-center justify-between gap-3">
                    {z.soldOut ? (
                      <span className="text-sm font-medium text-slate-400">Sold out</span>
                    ) : scarce ? (
                      <span className="text-sm font-medium text-rose-600">
                        Only {z.available} left
                      </span>
                    ) : (
                      <span className="text-sm text-emerald-600">Available</span>
                    )}
                    {!z.soldOut ? (
                      <Link
                        href={bookZoneHref(z.id)}
                        className="rounded-lg border border-slate-300 px-3.5 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                      >
                        {event.layoutType === "seated" ? "Choose seats" : "Book"}
                      </Link>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>

        {event.address ? (
          <section>
            <h2 className="text-2xl font-semibold tracking-tight text-slate-900">Getting there</h2>
            <p className="mt-3 text-lg text-slate-600">{event.address}</p>
            <a
              href={`https://maps.google.com/?q=${encodeURIComponent(event.address)}`}
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-block font-medium underline"
              style={{ color: organizer.brandColor }}
            >
              Open in Maps ↗
            </a>
          </section>
        ) : null}

        {event.terms ? (
          <section>
            <h2 className="text-2xl font-semibold tracking-tight text-slate-900">Good to know</h2>
            <p className="mt-3 max-w-3xl leading-relaxed text-slate-500">{event.terms}</p>
          </section>
        ) : null}

        <section className="rounded-2xl border border-slate-200 bg-white p-8 text-center">
          <h2 className="text-2xl font-semibold tracking-tight text-slate-900">
            {onSale ? "Ready to join?" : "Tickets aren't on sale yet"}
          </h2>
          <p className="mx-auto mt-2 max-w-md text-slate-500">
            {onSale
              ? "Passes are issued instantly with a QR you can show at the gate."
              : "Booking opens shortly — check back soon."}
          </p>
          <Link
            href={bookHref}
            className="mt-6 inline-block rounded-xl px-8 py-4 text-base font-semibold text-white"
            style={{ background: organizer.brandColor }}
          >
            {onSale ? "Book tickets" : "See ticket options"}
          </Link>
          {organizer.supportPhone ? (
            <p className="mt-4 text-sm text-slate-500">
              Questions? WhatsApp{" "}
              <a
                href={`https://wa.me/${organizer.supportPhone.replace(/\D/g, "")}`}
                className="underline"
                target="_blank"
                rel="noreferrer"
              >
                {organizer.supportPhone}
              </a>
            </p>
          ) : null}
        </section>
      </main>

      {/* Mobile: the CTA follows the reader down the page. */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 p-3 backdrop-blur lg:hidden">
        <div className="mx-auto flex max-w-5xl items-center gap-3">
          <div className="min-w-0">
            <p className="text-xs text-slate-500">From</p>
            <p className="font-semibold text-slate-900">
              {cheapest ? formatMinor(cheapest.priceMinor) : "Sold out"}
            </p>
          </div>
          <Link
            href={bookHref}
            className="ml-auto flex-1 rounded-xl px-5 py-3.5 text-center text-base font-semibold text-white"
            style={{ background: organizer.brandColor }}
          >
            {onSale ? "Book tickets" : "See options"}
          </Link>
        </div>
      </div>

      <footer className="border-t border-slate-200 px-5 py-6 text-center text-xs text-slate-400">
        Booking powered by Rasana for {organizer.name}
      </footer>
    </div>
  );
}
