import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { events, organizers, seats, zones } from "@/db/schema";
import { unavailableSeatIds, zoneAvailability } from "./inventory";
import type { PublicSeat, PublicZone } from "@/components/booking/booking-widget";

/** Everything a public booking surface needs, for both the page and the embed. */
export async function loadPublicEvent(orgSlug: string, eventSlug: string) {
  const row = await db
    .select({ event: events, organizer: organizers })
    .from(events)
    .innerJoin(organizers, eq(organizers.id, events.organizerId))
    .where(and(eq(organizers.slug, orgSlug), eq(events.slug, eventSlug)))
    .get();
  if (!row) return null;

  const { event, organizer } = row;
  const avail = zoneAvailability(event.id);

  const zoneRows = await db
    .select()
    .from(zones)
    .where(and(eq(zones.eventId, event.id), eq(zones.active, 1)))
    .orderBy(zones.sortOrder)
    .all();

  const publicZones: PublicZone[] = zoneRows.map((z) => {
    const a = avail.get(z.id);
    return {
      id: z.id,
      name: z.name,
      description: z.description,
      priceMinor: z.priceMinor,
      compareAtMinor: z.compareAtMinor,
      admitsCount: z.admitsCount,
      minPerOrder: z.minPerOrder,
      maxPerOrder: z.maxPerOrder,
      color: z.color,
      available: a?.available ?? 0,
      soldOut: (a?.available ?? 0) <= 0,
    };
  });

  let publicSeats: PublicSeat[] = [];
  if (event.layoutType === "seated") {
    const taken = unavailableSeatIds(event.id);
    const seatRows = await db
      .select()
      .from(seats)
      .where(eq(seats.eventId, event.id))
      .all();
    publicSeats = seatRows.map((s) => ({
      id: s.id,
      zoneId: s.zoneId,
      label: s.label,
      rowLabel: s.rowLabel,
      seatNumber: s.seatNumber,
      taken: taken.has(s.id) || s.status === "blocked",
    }));
  }

  const totalAvailable = publicZones.reduce((n, z) => n + z.available, 0);

  return { event, organizer, zones: publicZones, seats: publicSeats, totalAvailable };
}
