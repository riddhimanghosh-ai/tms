import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { eventDates, events, orders, tickets } from "@/db/schema";
import { requireOrganizer } from "@/lib/auth";
import { DatesManager } from "./dates-manager";

export default async function DatesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const organizer = await requireOrganizer();
  const event = await db
    .select()
    .from(events)
    .where(and(eq(events.id, id), eq(events.organizerId, organizer.id)))
    .get();
  if (!event) return null;

  const nights = await db
    .select()
    .from(eventDates)
    .where(eq(eventDates.eventId, id))
    .orderBy(asc(eventDates.sortOrder), asc(eventDates.startsAt))
    .all();

  const sold = await db
    .select({
      showDateId: tickets.showDateId,
      passes: sql<number>`count(*)`,
    })
    .from(tickets)
    .where(and(eq(tickets.eventId, id), sql`${tickets.status} != 'cancelled'`))
    .groupBy(tickets.showDateId)
    .all();

  const revenue = await db
    .select({
      showDateId: orders.showDateId,
      gross: sql<number>`coalesce(sum(${orders.totalMinor}), 0)`,
    })
    .from(orders)
    .where(and(eq(orders.eventId, id), eq(orders.status, "paid")))
    .groupBy(orders.showDateId)
    .all();

  const soldBy = new Map(sold.map((r) => [r.showDateId ?? "", Number(r.passes)]));
  const grossBy = new Map(revenue.map((r) => [r.showDateId ?? "", Number(r.gross)]));

  return (
    <DatesManager
      eventId={id}
      eventStartsAt={event.startsAt}
      nights={nights.map((n) => ({
        id: n.id,
        startsAt: n.startsAt,
        endsAt: n.endsAt,
        label: n.label,
        note: n.note,
        active: n.active,
        sold: soldBy.get(n.id) ?? 0,
        grossMinor: grossBy.get(n.id) ?? 0,
      }))}
    />
  );
}
