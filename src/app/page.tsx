import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { events, organizers } from "@/db/schema";
import { ButtonLink } from "@/components/ui";

// The live-events strip reads the database on every request.
export const dynamic = "force-dynamic";

const features = [
  {
    title: "Your page, on your site",
    body: "Paste one script tag and the booking form appears inside your own website — your branding, your domain, no competing events, no marketplace taking your audience.",
  },
  {
    title: "No website? No problem",
    body: "Every event gets a hosted landing page. Drop the link into a WhatsApp broadcast or an Instagram bio and you're selling in minutes.",
  },
  {
    title: "Open ground or reserved seats",
    body: "Set up priced categories with capacities for a Garba ground, or lay out an exact seat grid for an auditorium. Same dashboard either way.",
  },
  {
    title: "Codes that actually pay off",
    body: "Early-bird percentages, flat-off codes, group deals, hidden sponsor passes, and per-promoter referral codes with automatic commission tracking.",
  },
  {
    title: "Know what's selling, live",
    body: "Daily sales curves, revenue by category, sell-through per tier, channel attribution and a promoter leaderboard — so you can reprice before it's too late.",
  },
  {
    title: "A gate that moves",
    body: "Scan QR passes with any phone camera. Duplicate scans are caught instantly, and you can watch the crowd arrive in real time.",
  },
];

export default async function Home() {
  const live = await db
    .select({ event: events, organizer: organizers })
    .from(events)
    .innerJoin(organizers, eq(organizers.id, events.organizerId))
    .where(eq(events.status, "published"))
    .orderBy(desc(events.startsAt))
    .limit(3)
    .all();

  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
        <span className="font-semibold tracking-tight">
          <span className="text-brand-500">◆</span> Gathara
        </span>
        <nav className="flex items-center gap-2">
          <Link href="/admin/login" className="rounded-lg px-3 py-2 text-sm text-ink-300 hover:text-ink-50">
            Sign in
          </Link>
          <ButtonLink href="/admin/signup" size="sm">
            Start free
          </ButtonLink>
        </nav>
      </header>

      <main>
        <section className="mx-auto max-w-6xl px-5 pb-16 pt-12 sm:pt-20">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-brand-400">
            Ticketing for live events
          </p>
          <h1 className="mt-4 max-w-3xl text-4xl font-bold leading-[1.1] tracking-tight sm:text-6xl">
            Sell your own tickets.
            <span className="block text-ink-400">Keep your own audience.</span>
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-ink-300">
            Built for Garba nights, dandiya grounds and live shows across India. Put a
            booking page on your website or send it over WhatsApp, and run pricing,
            discounts, promoters, analytics and the gate from one dashboard.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <ButtonLink href="/admin/signup" size="lg">
              Create your event
            </ButtonLink>
            <ButtonLink href="/admin/login" size="lg" variant="secondary">
              See the demo dashboard
            </ButtonLink>
          </div>
        </section>

        {live.length > 0 ? (
          <section className="mx-auto max-w-6xl px-5 pb-16">
            <p className="mb-4 text-xs font-medium uppercase tracking-wide text-ink-400">
              Live booking pages
            </p>
            <ul className="grid gap-3 sm:grid-cols-3">
              {live.map(({ event, organizer }) => (
                <li key={event.id}>
                  <Link
                    href={`/e/${organizer.slug}/${event.slug}`}
                    className="block rounded-[--radius-card] border border-ink-700/70 bg-ink-900/70 p-4 transition hover:border-brand-600/60"
                  >
                    <p className="font-medium">{event.title}</p>
                    <p className="mt-1 text-sm text-ink-400">
                      {new Date(event.startsAt * 1000).toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "long",
                      })}
                      {event.venue ? ` · ${event.venue}` : ""}
                    </p>
                    <p className="mt-3 text-sm text-brand-400">Book tickets →</p>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="border-t border-ink-800 bg-ink-900/40">
          <div className="mx-auto max-w-6xl px-5 py-16">
            <h2 className="text-2xl font-semibold tracking-tight">
              Everything an organiser actually needs
            </h2>
            <ul className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {features.map((f) => (
                <li key={f.title}>
                  <h3 className="font-medium">{f.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-ink-400">{f.body}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </main>

      <footer className="mx-auto max-w-6xl px-5 py-10 text-sm text-ink-500">
        Gathara — ticketing infrastructure for Indian event organisers.
      </footer>
    </div>
  );
}
