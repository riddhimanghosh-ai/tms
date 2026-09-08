import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { loadPublicEvent } from "@/lib/public-event";
import { BookingWidget } from "@/components/booking/booking-widget";
import { ViewTracker } from "@/components/booking/view-tracker";
import { formatMinor } from "@/lib/money";

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

  const { event, organizer, zones, seats } = data;
  const cheapest = zones.filter((z) => !z.soldOut).sort((a, b) => a.priceMinor - b.priceMinor)[0];
  const start = new Date(event.startsAt * 1000);

  return (
    <div className="surface-light min-h-dvh">
      <ViewTracker eventId={event.id} source="web" referral={ref ?? null} />

      <header
        className="relative overflow-hidden"
        style={{
          background: event.coverImageUrl
            ? `linear-gradient(180deg, rgba(10,8,15,.45), rgba(10,8,15,.85)), url(${event.coverImageUrl}) center/cover`
            : `linear-gradient(140deg, ${organizer.brandColor}, #16121f 70%)`,
        }}
      >
        <div className="mx-auto max-w-5xl px-5 py-16 sm:py-24">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-white/70">
            {organizer.name}
          </p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-white sm:text-5xl">
            {event.title}
          </h1>
          {event.tagline ? (
            <p className="mt-3 max-w-2xl text-lg text-white/85">{event.tagline}</p>
          ) : null}

          <dl className="mt-8 flex flex-wrap gap-x-10 gap-y-4 text-white/90">
            <div>
              <dt className="text-xs uppercase tracking-wide text-white/60">When</dt>
              <dd className="mt-0.5 font-medium">
                {start.toLocaleDateString("en-IN", {
                  weekday: "short",
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
                {" · "}
                {start.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
              </dd>
            </div>
            {event.venue ? (
              <div>
                <dt className="text-xs uppercase tracking-wide text-white/60">Where</dt>
                <dd className="mt-0.5 font-medium">
                  {event.venue}
                  {event.city ? `, ${event.city}` : ""}
                </dd>
              </div>
            ) : null}
            {cheapest ? (
              <div>
                <dt className="text-xs uppercase tracking-wide text-white/60">From</dt>
                <dd className="mt-0.5 font-medium">{formatMinor(cheapest.priceMinor)}</dd>
              </div>
            ) : null}
          </dl>
        </div>
      </header>

      <main className="mx-auto grid max-w-5xl gap-8 px-5 py-10 lg:grid-cols-[1fr_400px] lg:items-start">
        <div className="space-y-8 lg:order-1">
          {event.description ? (
            <section>
              <h2 className="text-lg font-semibold text-slate-900">About this event</h2>
              <p className="mt-2 whitespace-pre-line leading-relaxed text-slate-600">
                {event.description}
              </p>
            </section>
          ) : null}

          {event.address ? (
            <section>
              <h2 className="text-lg font-semibold text-slate-900">Getting there</h2>
              <p className="mt-2 text-slate-600">{event.address}</p>
              <a
                href={`https://maps.google.com/?q=${encodeURIComponent(event.address)}`}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-block text-sm font-medium underline"
                style={{ color: organizer.brandColor }}
              >
                Open in Maps ↗
              </a>
            </section>
          ) : null}

          <section>
            <h2 className="text-lg font-semibold text-slate-900">What&apos;s on offer</h2>
            <ul className="mt-3 divide-y divide-slate-100 rounded-xl border border-slate-200">
              {zones.map((z) => (
                <li key={z.id} className="flex items-center justify-between gap-4 px-4 py-3">
                  <div>
                    <p className="font-medium text-slate-900">{z.name}</p>
                    {z.description ? (
                      <p className="text-sm text-slate-500">{z.description}</p>
                    ) : null}
                  </div>
                  <p className="shrink-0 text-sm font-semibold text-slate-900">
                    {z.soldOut ? (
                      <span className="text-slate-400">Sold out</span>
                    ) : (
                      formatMinor(z.priceMinor)
                    )}
                  </p>
                </li>
              ))}
            </ul>
          </section>

          {event.terms ? (
            <section>
              <h2 className="text-lg font-semibold text-slate-900">Terms</h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-500">{event.terms}</p>
            </section>
          ) : null}
        </div>

        <div className="lg:sticky lg:top-6 lg:order-2">
          <BookingWidget
            event={{
              id: event.id,
              title: event.title,
              layoutType: event.layoutType,
              maxTicketsPerOrder: event.maxTicketsPerOrder,
              status: event.status,
              terms: event.terms,
            }}
            zones={zones}
            seats={seats}
            brandColor={organizer.brandColor}
            initialCode={ref ?? code ?? null}
            channel="web"
            supportPhone={organizer.supportPhone}
          />
        </div>
      </main>

      <footer className="border-t border-slate-200 px-5 py-6 text-center text-xs text-slate-400">
        Booking powered by Gathara for {organizer.name}
      </footer>
    </div>
  );
}
