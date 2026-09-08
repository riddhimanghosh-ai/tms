import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { events, seats, tickets, zones } from "@/db/schema";
import { requireOrganizer } from "@/lib/auth";
import { zoneAvailability } from "@/lib/inventory";
import { ZoneManager } from "./zone-manager";

export default async function TicketsPage({
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

  const zoneRows = await db
    .select()
    .from(zones)
    .where(eq(zones.eventId, id))
    .orderBy(zones.sortOrder)
    .all();

  const avail = zoneAvailability(id);
  const seatRows =
    event.layoutType === "seated"
      ? await db.select().from(seats).where(eq(seats.eventId, id)).all()
      : [];
  const soldSeatIds = new Set(
    (await db.select({ seatId: tickets.seatId }).from(tickets).where(eq(tickets.eventId, id)).all())
      .map((t) => t.seatId)
      .filter(Boolean) as string[],
  );

  return (
    <ZoneManager
      event={{
        id: event.id,
        layoutType: event.layoutType,
        currency: event.currency,
      }}
      zones={zoneRows.map((z) => ({
        ...z,
        sold: avail.get(z.id)?.sold ?? 0,
        capacityResolved: avail.get(z.id)?.capacity ?? z.capacity,
      }))}
      seats={seatRows.map((s) => ({
        id: s.id,
        zoneId: s.zoneId,
        label: s.label,
        rowLabel: s.rowLabel,
        seatNumber: s.seatNumber,
        status: soldSeatIds.has(s.id) ? "sold" : s.status,
      }))}
    />
  );
}
