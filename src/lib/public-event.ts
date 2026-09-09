import { and, asc, eq, sql } from "drizzle-orm";
import { db, first } from "@/db";
import { eventDates, events, orders, organizers, seats, zones } from "@/db/schema";
import { nightLabel } from "./booking";
import { parseLayerList } from "./seat-layout";
import { nightsFreeCapacity, unavailableSeatIds, zoneAvailability } from "./inventory";
import type { PublicSeat, PublicZone } from "@/components/booking/booking-widget";

export type PublicNight = {
  id: string;
  startsAt: number;
  endsAt: number | null;
  label: string;
  note: string | null;
  soldOut: boolean;
  past: boolean;
};

/** Everything a public booking surface needs, for both the page and the embed. */
export async function loadPublicEvent(
  orgSlug: string,
  eventSlug: string,
  selectedNightId?: string | null,
) {
  const row = await first(db
    .select({ event: events, organizer: organizers })
    .from(events)
    .innerJoin(organizers, eq(organizers.id, events.organizerId))
    .where(and(eq(organizers.slug, orgSlug), eq(events.slug, eventSlug)))
    );
  if (!row) return null;

  const { event, organizer } = row;
  const nowSec = Math.floor(Date.now() / 1000);

  const nightRows = await db
    .select()
    .from(eventDates)
    .where(and(eq(eventDates.eventId, event.id), eq(eventDates.active, 1)))
    .orderBy(asc(eventDates.sortOrder), asc(eventDates.startsAt))
    ;

  const upcoming = nightRows.filter((n) => n.startsAt >= nowSec - 6 * 3600);
  const chosen =
    nightRows.find((n) => n.id === selectedNightId) ?? upcoming[0] ?? nightRows[0] ?? null;

  const avail = await zoneAvailability(event.id, chosen?.id ?? null);

  const zoneRows = await db
    .select()
    .from(zones)
    .where(and(eq(zones.eventId, event.id), eq(zones.active, 1)))
    .orderBy(zones.sortOrder)
    ;

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
      allDates: z.allDates === 1,
      shape: (z.shape as PublicZone["shape"]) ?? "grid",
      rows: z.rows,
      cols: z.cols,
      ringCount: z.ringCount,
      ringStartSeats: z.ringStartSeats,
      ringSeatStep: z.ringSeatStep,
      arcSpanDeg: z.arcSpanDeg,
      arcStartDeg: z.arcStartDeg,
      innerHolePct: z.innerHolePct,
      layerColors: parseLayerList(z.layerColors),
      layerNotes: parseLayerList(z.layerNotes),
      available: a?.available ?? 0,
      soldOut: (a?.available ?? 0) <= 0,
    };
  });

  let publicSeats: PublicSeat[] = [];
  if (event.layoutType === "seated") {
    const taken = await unavailableSeatIds(event.id, chosen?.id ?? null);
    const seatRows = await db.select().from(seats).where(eq(seats.eventId, event.id));
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

  // Each night gets its own sold-out flag, resolved in one pass rather than
  // one availability query per night.
  const freeByNight = await nightsFreeCapacity(event.id, nightRows.map((n) => n.id));
  const nights: PublicNight[] = nightRows.map((n) => ({
    id: n.id,
    startsAt: n.startsAt,
    endsAt: n.endsAt,
    label: nightLabel(n),
    note: n.note,
    soldOut: (freeByNight.get(n.id) ?? 0) <= 0,
    past: n.startsAt < nowSec - 6 * 3600,
  }));

  const sold = await first(db
    .select({ n: sql<number>`coalesce(sum(${orders.ticketCount}), 0)` })
    .from(orders)
    .where(and(eq(orders.eventId, event.id), eq(orders.status, "paid")))
    );

  return {
    event,
    organizer,
    zones: publicZones,
    seats: publicSeats,
    nights,
    selectedNightId: chosen?.id ?? null,
    totalAvailable: publicZones.reduce((n, z) => n + z.available, 0),
    ticketsSold: Number(sold?.n ?? 0),
    // Read the clock here so pages stay free of impure calls during render.
    nowSec,
  };
}
