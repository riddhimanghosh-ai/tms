import Link from "next/link";
import { and, asc, eq, like, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { events, organizers } from "@/db/schema";
import { formatMinor } from "@/lib/money";
import { Wordmark } from "@/components/brand";
import { EmptyState } from "@/components/ui";
import { EVENT_TZ } from "@/lib/datetime";

// The marketplace reads live inventory on every request.
export const dynamic = "force-dynamic";

/** Reading the clock in a helper keeps the component body pure. */
function currentSeconds() {
  return Math.floor(Date.now() / 1000);
}

type Props = {
  searchParams: Promise<{ q?: string; city?: string }>;
};

/** A thumb-sized city filter. Reads as a link so it works without JS. */
function CityChip({ label, href, active }: { label: string; href: string; active: boolean }) {
  return (
    <Link
      href={href}
      aria-current={active ? "true" : undefined}
      className={`press shrink-0 whitespace-nowrap rounded-full border px-4 py-2 text-sm font-medium ${
        active
          ? "border-ink-50 bg-ink-50 text-white"
          : "border-ink-700 bg-white text-ink-300 hover:border-ink-600 hover:text-ink-50"
      }`}
    >
      {label}
    </Link>
  );
}

export default async function Marketplace({ searchParams }: Props) {
  const { q = "", city = "" } = await searchParams;
  const nowSec = currentSeconds();

  const filters = [eq(events.status, "published"), eq(events.listPublicly, 1)];
  if (city) filters.push(eq(events.city, city));
  if (q.trim()) {
    const needle = `%${q.trim()}%`;
    filters.push(
      or(
        like(events.title, needle),
        like(events.tagline, needle),
        like(events.venue, needle),
        like(events.city, needle),
      )!,
    );
  }

  const rows = await db
    .select({
      event: events,
      organizer: organizers,
      fromPrice: sql<number>`(select min(price_minor) from zones where zones.event_id = events.id and zones.active = 1)`,
      sold: sql<number>`(select coalesce(sum(ticket_count), 0) from orders where orders.event_id = events.id and orders.status = 'paid')`,
      nights: sql<number>`(select count(*) from event_dates where event_dates.event_id = events.id and event_dates.active = 1)`,
    })
    .from(events)
    .innerJoin(organizers, eq(organizers.id, events.organizerId))
    .where(and(...filters))
    .orderBy(asc(events.startsAt))
    ;

  const cities = [
    ...new Set(
      (
        await db
          .select({ city: events.city })
          .from(events)
          .where(and(eq(events.status, "published"), eq(events.listPublicly, 1)))
          
      )
        .map((r) => r.city)
        .filter(Boolean) as string[],
    ),
  ].sort();

  return (
    <div className="min-h-dvh bg-white">
      <header className="sticky top-0 z-40 border-b border-ink-700 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-5">
          <Wordmark />
          <nav className="ml-auto flex shrink-0 items-center gap-1">
            <Link
              href="/admin/login"
              className="press whitespace-nowrap rounded-lg px-3 py-2 text-sm text-ink-400 hover:bg-ink-800 hover:text-ink-50"
            >
              Sign in<span className="hidden sm:inline"> as organiser</span>
            </Link>
            <Link
              href="/admin/signup"
              className="press whitespace-nowrap rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-brand-500 sm:px-4"
            >
              List<span className="hidden sm:inline"> your</span> event
            </Link>
          </nav>
        </div>
      </header>

      <section className="relative overflow-hidden border-b border-ink-700 bg-gradient-to-b from-brand-50 via-brand-50/40 to-white">
        {/* Soft brand glow behind the headline, never a hard edge. */}
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -top-32 size-96 rounded-full opacity-40 blur-3xl"
          style={{ background: "radial-gradient(circle, #fb6f8f, transparent 70%)" }}
        />
        <div className="relative mx-auto max-w-6xl px-5 py-12 sm:py-20">
          <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-brand-200 bg-white/70 px-3 py-1 text-xs font-medium text-brand-700 backdrop-blur">
            <span className="relative flex size-1.5">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-brand-500 opacity-75" />
              <span className="relative inline-flex size-1.5 rounded-full bg-brand-600" />
            </span>
            Booking open for the 2026 season
          </p>
          <h1 className="max-w-3xl text-[2rem] font-bold leading-[1.08] tracking-tight sm:text-5xl">
            Every Garba night, concert and utsav —{" "}
            <span className="text-brand-600">one place to book.</span>
          </h1>
          <p className="mt-4 max-w-2xl text-base text-ink-400 sm:text-lg">
            Real seats, real inventory, instant QR passes. Booked straight from the organiser,
            not resold.
          </p>

          <form className="mt-7 max-w-2xl">
            <div className="flex gap-2">
              <div className="relative min-w-0 flex-1">
                <svg
                  aria-hidden
                  viewBox="0 0 20 20"
                  fill="none"
                  className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-ink-400"
                >
                  <circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="1.8" />
                  <path d="m13.5 13.5 3 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
                <input
                  name="q"
                  defaultValue={q}
                  placeholder="Search an event, venue or city"
                  className="h-13 w-full rounded-xl border border-ink-700 bg-white py-3.5 pl-11 pr-4 text-base outline-none transition focus:border-brand-500 focus:ring-4 focus:ring-brand-600/10"
                />
              </div>
              <button className="press h-13 shrink-0 rounded-xl bg-ink-50 px-6 text-base font-semibold text-white hover:bg-ink-200">
                Search
              </button>
            </div>

            {/* City chips — the filter you can hit with a thumb, not a dropdown. */}
            {cities.length ? (
              <div className="no-scrollbar -mx-5 mt-3 flex gap-2 overflow-x-auto px-5 pb-1">
                <CityChip label="All cities" href={q ? `/?q=${encodeURIComponent(q)}` : "/"} active={!city} />
                {cities.map((c) => (
                  <CityChip
                    key={c}
                    label={c}
                    active={city === c}
                    href={`/?city=${encodeURIComponent(c)}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
                  />
                ))}
              </div>
            ) : null}
          </form>
        </div>
      </section>

      <main className="mx-auto max-w-6xl px-5 py-12">
        <div className="mb-6 flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-2xl font-semibold tracking-tight">
            {q || city ? "Matching events" : "What's on"}
          </h2>
          <p className="text-sm text-ink-400">
            {rows.length} event{rows.length === 1 ? "" : "s"}
            {city ? ` in ${city}` : ""}
          </p>
        </div>

        {rows.length === 0 ? (
          <EmptyState
            title="Nothing matches that search"
            body="Try a different city, or clear the search to see everything on sale."
            action={
              <Link href="/" className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white">
                Show all events
              </Link>
            }
          />
        ) : (
          <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {rows.map(({ event, organizer, fromPrice, sold, nights }) => {
              const start = new Date(event.startsAt * 1000);
              const soon = event.startsAt - nowSec < 7 * 86400;
              return (
                <li key={event.id}>
                  <Link
                    href={`/e/${organizer.slug}/${event.slug}`}
                    className="card-lift group flex h-full flex-col overflow-hidden rounded-2xl border border-ink-700 bg-white card-shadow"
                  >
                    {/* Poster-first, the way a listings app sells an event. */}
                    <div className="relative aspect-[4/3] overflow-hidden sm:aspect-[3/2]">
                      <div
                        className="absolute inset-0 transition-transform duration-500 group-hover:scale-[1.06]"
                        style={{
                          background: event.coverImageUrl
                            ? `url(${event.coverImageUrl}) center/cover`
                            : `linear-gradient(140deg, ${organizer.brandColor}, #2a1c33 75%)`,
                        }}
                      />
                      <div
                        aria-hidden
                        className="absolute inset-0"
                        style={{
                          background:
                            "linear-gradient(180deg, rgba(10,8,15,.15) 0%, rgba(10,8,15,.05) 40%, rgba(10,8,15,.82) 100%)",
                        }}
                      />
                      <div className="absolute inset-x-0 bottom-0 p-4">
                        <p className="text-[11px] font-medium uppercase tracking-wider text-white/75">
                          {organizer.name}
                        </p>
                        <p className="mt-0.5 line-clamp-2 text-lg font-semibold leading-tight text-white">
                          {event.title}
                        </p>
                      </div>
                      <div className="absolute left-3 right-3 top-3 flex items-start justify-between gap-2">
                        <span className="rounded-lg bg-white/95 px-2 py-1 text-center text-[11px] font-semibold leading-tight text-ink-50 backdrop-blur">
                          <span className="block text-sm leading-none">
                            {start.toLocaleDateString("en-IN", { timeZone: EVENT_TZ, day: "numeric" })}
                          </span>
                          <span className="block uppercase tracking-wide text-ink-400">
                            {start.toLocaleDateString("en-IN", { timeZone: EVENT_TZ, month: "short" })}
                          </span>
                        </span>
                        <span className="flex flex-col items-end gap-1.5">
                          {soon ? (
                            <span className="rounded-full bg-brand-600 px-2 py-0.5 text-xs font-semibold text-white shadow-sm">
                              This week
                            </span>
                          ) : null}
                          {Number(nights) > 1 ? (
                            <span className="rounded-full bg-white/95 px-2 py-0.5 text-xs font-semibold text-ink-50 backdrop-blur">
                              {Number(nights)} nights
                            </span>
                          ) : null}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-1 flex-col p-4">
                      <p className="flex items-center gap-1.5 text-sm text-ink-400">
                        <svg aria-hidden viewBox="0 0 16 16" className="size-3.5 shrink-0 text-ink-500">
                          <path
                            d="M8 1.5c-2.3 0-4.2 1.9-4.2 4.2C3.8 9 8 14.5 8 14.5s4.2-5.5 4.2-8.8c0-2.3-1.9-4.2-4.2-4.2Z"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.3"
                          />
                          <circle cx="8" cy="5.7" r="1.5" fill="currentColor" />
                        </svg>
                        <span className="truncate">
                          {start.toLocaleDateString("en-IN", { timeZone: EVENT_TZ, weekday: "short" })}
                          {event.venue ? ` · ${event.venue}` : ""}
                        </span>
                      </p>
                      {event.tagline ? (
                        <p className="mt-2 line-clamp-2 text-sm text-ink-300">{event.tagline}</p>
                      ) : null}

                      <div className="mt-4 flex items-center justify-between gap-3 border-t border-ink-800 pt-3">
                        <span className="text-sm">
                          <span className="text-ink-400">from </span>
                          <span className="text-base font-bold text-ink-50">
                            {Number(fromPrice) > 0 ? formatMinor(Number(fromPrice)) : "Free"}
                          </span>
                        </span>
                        {Number(sold) > 50 ? (
                          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                            {Number(sold).toLocaleString("en-IN")} booked
                          </span>
                        ) : (
                          <span className="text-sm font-semibold text-brand-600 transition group-hover:translate-x-0.5">
                            Book →
                          </span>
                        )}
                      </div>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </main>

      <section className="border-t border-ink-700 bg-ink-950">
        <div className="mx-auto max-w-6xl px-5 py-14">
          <h2 className="text-2xl font-semibold tracking-tight">Running an event?</h2>
          <p className="mt-2 max-w-2xl text-ink-400">
            Rasana gives you three ways to sell, and you keep the audience either way: listed
            here, a landing page of your own to send over WhatsApp, and a booking form embedded
            in your existing website.
          </p>
          <ul className="mt-8 grid gap-6 sm:grid-cols-3">
            {[
              ["Listed here", "Discovered by people browsing what's on in their city."],
              ["Your own landing page", "One link, your branding, no competitors on the page. Made for WhatsApp."],
              ["Embedded on your site", "A script tag drops the booking form into the site you already have."],
            ].map(([title, body]) => (
              <li key={title}>
                <h3 className="font-medium">{title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-ink-400">{body}</p>
              </li>
            ))}
          </ul>
          <Link
            href="/admin/signup"
            className="mt-8 inline-block rounded-xl bg-brand-600 px-6 py-3 font-semibold text-white hover:bg-brand-500"
          >
            Start selling
          </Link>
        </div>
      </section>

      <footer className="border-t border-ink-700 px-5 py-8 text-center text-sm text-ink-400">
        Rasana — ticketing for live events across India.
      </footer>
    </div>
  );
}
