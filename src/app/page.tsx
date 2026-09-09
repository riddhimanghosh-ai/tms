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
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-5">
          <Wordmark />
          <nav className="ml-auto flex items-center gap-1">
            <Link
              href="/admin/login"
              className="rounded-lg px-3 py-2 text-sm text-ink-400 hover:bg-ink-800 hover:text-ink-50"
            >
              Organiser sign in
            </Link>
            <Link
              href="/admin/signup"
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-500"
            >
              List your event
            </Link>
          </nav>
        </div>
      </header>

      <section className="border-b border-ink-700 bg-gradient-to-b from-brand-50 to-white">
        <div className="mx-auto max-w-6xl px-5 py-14 sm:py-20">
          <h1 className="max-w-3xl text-4xl font-bold leading-[1.08] tracking-tight sm:text-5xl">
            Every Garba night, concert and utsav —{" "}
            <span className="text-brand-600">one place to book.</span>
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-ink-400">
            Real seats, real inventory, instant QR passes. Booked straight from the organiser,
            not resold.
          </p>

          <form className="mt-8 flex max-w-2xl flex-wrap gap-2">
            <input
              name="q"
              defaultValue={q}
              placeholder="Search an event, venue or city"
              className="h-12 min-w-0 flex-1 rounded-xl border border-ink-700 bg-white px-4 text-base outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-600/20"
            />
            <select
              name="city"
              defaultValue={city}
              className="h-12 rounded-xl border border-ink-700 bg-white px-3 text-base outline-none focus:border-brand-500"
            >
              <option value="">All cities</option>
              {cities.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <button className="h-12 rounded-xl bg-ink-50 px-6 text-base font-semibold text-white hover:bg-ink-200">
              Search
            </button>
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
                    className="group block overflow-hidden rounded-2xl border border-ink-700 bg-white transition hover:-translate-y-0.5 hover:border-ink-600 card-shadow"
                  >
                    <div
                      className="relative h-40"
                      style={{
                        background: event.coverImageUrl
                          ? `linear-gradient(180deg, rgba(10,8,15,.25), rgba(10,8,15,.72)), url(${event.coverImageUrl}) center/cover`
                          : `linear-gradient(140deg, ${organizer.brandColor}, #2a1c33 75%)`,
                      }}
                    >
                      <div className="absolute inset-x-0 bottom-0 p-4">
                        <p className="text-xs font-medium uppercase tracking-wider text-white/70">
                          {organizer.name}
                        </p>
                        <p className="mt-0.5 truncate text-lg font-semibold text-white">
                          {event.title}
                        </p>
                      </div>
                      <div className="absolute right-3 top-3 flex gap-1.5">
                        {Number(nights) > 1 ? (
                          <span className="rounded-full bg-white/90 px-2 py-0.5 text-xs font-semibold text-ink-50">
                            {Number(nights)} nights
                          </span>
                        ) : null}
                        {soon ? (
                          <span className="rounded-full bg-brand-600 px-2 py-0.5 text-xs font-semibold text-white">
                            This week
                          </span>
                        ) : null}
                      </div>
                    </div>

                    <div className="p-4">
                      <p className="text-sm text-ink-400">
                        {start.toLocaleDateString("en-IN", { timeZone: EVENT_TZ,
                          weekday: "short",
                          day: "numeric",
                          month: "short",
                        })}
                        {event.venue ? ` · ${event.venue}` : ""}
                      </p>
                      {event.tagline ? (
                        <p className="mt-2 line-clamp-2 text-sm text-ink-300">{event.tagline}</p>
                      ) : null}

                      <div className="mt-4 flex items-center justify-between gap-3">
                        <span className="text-sm">
                          <span className="text-ink-400">from </span>
                          <span className="font-semibold">
                            {Number(fromPrice) > 0 ? formatMinor(Number(fromPrice)) : "Free"}
                          </span>
                        </span>
                        {Number(sold) > 50 ? (
                          <span className="text-xs text-ink-400">
                            {Number(sold).toLocaleString("en-IN")} booked
                          </span>
                        ) : null}
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
