import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { events, organizers, orders, seats, zones } from "@/db/schema";
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
      shape: (z.shape as PublicZone["shape"]) ?? "grid",
      rows: z.rows,
      cols: z.cols,
      ringCount: z.ringCount,
      ringStartSeats: z.ringStartSeats,
      ringSeatStep: z.ringSeatStep,
      arcSpanDeg: z.arcSpanDeg,
      arcStartDeg: z.arcStartDeg,
      innerHolePct: z.innerHolePct,
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
      ringIndex: s.ringIndex,
      posInRing: s.posInRing,
      ringSize: s.ringSize,
      x: s.x,
      y: s.y,
      taken: taken.has(s.id) || s.status === "blocked",
    }));
  }

  const totalAvailable = publicZones.reduce((n, z) => n + z.available, 0);

  // Social proof on the landing page comes from real paid orders, not a guess.
  const sold = await db
    .select({ n: sql<number>`coalesce(sum(${orders.ticketCount}), 0)` })
    .from(orders)
    .where(and(eq(orders.eventId, event.id), eq(orders.status, "paid")))
    .get();

  return {
    event,
    organizer,
    zones: publicZones,
    seats: publicSeats,
    totalAvailable,
    ticketsSold: Number(sold?.n ?? 0),
    // Read the clock here so pages stay free of impure calls during render.
    nowSec: Math.floor(Date.now() / 1000),
  };
}
