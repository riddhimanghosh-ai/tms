import Link from "next/link";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { events, orders } from "@/db/schema";
import { requireOrganizer } from "@/lib/auth";
import { organizerSummary } from "@/lib/analytics";
import { zoneAvailability } from "@/lib/inventory";
import { formatMinor, formatMinorShort } from "@/lib/money";
import { Badge, ButtonLink, Card, EmptyState, SectionTitle } from "@/components/ui";
import { StatTile } from "@/components/charts";

const statusTone = {
  published: "green",
  draft: "neutral",
  paused: "amber",
  closed: "red",
} as const;

export default async function AdminHome() {
  const organizer = await requireOrganizer();
  const summary = organizerSummary(organizer.id);

  const rows = await db
    .select({
      event: events,
      paidOrders: sql<number>`coalesce(sum(case when ${orders.status} = 'paid' then 1 else 0 end), 0)`,
      soldTickets: sql<number>`coalesce(sum(case when ${orders.status} = 'paid' then ${orders.ticketCount} else 0 end), 0)`,
      gross: sql<number>`coalesce(sum(case when ${orders.status} = 'paid' then ${orders.totalMinor} else 0 end), 0)`,
    })
    .from(events)
    .leftJoin(orders, eq(orders.eventId, events.id))
    .where(eq(events.organizerId, organizer.id))
    .groupBy(events.id)
    .orderBy(desc(events.startsAt))
    .all();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">
          Welcome back, {organizer.name.split(",")[0]}
        </h1>
        <p className="mt-1 text-sm text-ink-400">
          Everything you&apos;ve sold, across every event.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile label="Gross sales" value={formatMinor(summary.grossMinor)} sub="All paid orders" />
        <StatTile label="Tickets sold" value={summary.tickets.toLocaleString("en-IN")} />
        <StatTile label="Orders" value={summary.orders.toLocaleString("en-IN")} />
      </div>

      <section>
        <SectionTitle
          title="Your events"
          hint="Pick an event to manage pricing, codes, sales and the gate."
          action={<ButtonLink href="/admin/events/new" size="sm">New event</ButtonLink>}
        />

        {rows.length === 0 ? (
          <EmptyState
            title="No events yet"
            body="Create your first event, add ticket categories, and you'll have a shareable booking page in minutes."
            action={<ButtonLink href="/admin/events/new">Create an event</ButtonLink>}
          />
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {rows.map(({ event, soldTickets, gross }) => {
              const avail = zoneAvailability(event.id);
              const capacity = [...avail.values()].reduce((n, z) => n + z.capacity, 0);
              const sold = Number(soldTickets);
              const pct = capacity ? Math.min(100, (sold / capacity) * 100) : 0;

              return (
                <li key={event.id}>
                  <Link href={`/admin/events/${event.id}`} className="block">
                    <Card className="p-4 transition hover:border-ink-600 hover:bg-ink-800">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate font-medium">{event.title}</p>
                          <p className="mt-0.5 text-sm text-ink-400">
                            {new Date(event.startsAt * 1000).toLocaleString("en-IN", {
                              dateStyle: "medium",
                              timeStyle: "short",
                            })}
                            {event.venue ? ` · ${event.venue}` : ""}
                          </p>
                        </div>
                        <Badge tone={statusTone[event.status as keyof typeof statusTone] ?? "neutral"}>
                          {event.status}
                        </Badge>
                      </div>

                      <div className="mt-4 flex items-baseline justify-between text-sm">
                        <span className="tabular font-medium">
                          {formatMinorShort(Number(gross))}
                        </span>
                        <span className="tabular text-ink-400">
                          {sold.toLocaleString("en-IN")} / {capacity.toLocaleString("en-IN")} sold
                        </span>
                      </div>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-ink-800">
                        <div
                          className="h-full rounded-full bg-brand-600"
                          style={{ width: `${Math.max(1, pct)}%` }}
                        />
                      </div>
                    </Card>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
