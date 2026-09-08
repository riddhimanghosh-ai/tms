import { and, eq, gt, inArray, isNotNull, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { seatHolds, seats, tickets, zones } from "@/db/schema";

export const HOLD_SECONDS = 8 * 60;

const nowSec = () => Math.floor(Date.now() / 1000);

/** Holds are lazily reaped — no cron needed for a single-node deployment. */
export function reapExpiredHolds() {
  db.delete(seatHolds).where(sql`${seatHolds.expiresAt} < ${nowSec()}`).run();
}

export type ZoneAvailability = {
  zoneId: string;
  capacity: number;
  sold: number;
  held: number;
  available: number;
};

/**
 * Remaining inventory per zone. Seated zones count their unblocked seats;
 * open zones use the declared capacity. Both subtract sold + actively held.
 */
export function zoneAvailability(eventId: string): Map<string, ZoneAvailability> {
  reapExpiredHolds();

  const zoneRows = db
    .select()
    .from(zones)
    .where(eq(zones.eventId, eventId))
    .all();

  const soldRows = db
    .select({ zoneId: tickets.zoneId, n: sql<number>`count(*)` })
    .from(tickets)
    .where(and(eq(tickets.eventId, eventId), ne(tickets.status, "cancelled")))
    .groupBy(tickets.zoneId)
    .all();

  const heldRows = db
    .select({ zoneId: seatHolds.zoneId, n: sql<number>`sum(${seatHolds.qty})` })
    .from(seatHolds)
    .where(
      and(eq(seatHolds.eventId, eventId), gt(seatHolds.expiresAt, nowSec())),
    )
    .groupBy(seatHolds.zoneId)
    .all();

  const seatCounts = db
    .select({ zoneId: seats.zoneId, n: sql<number>`count(*)` })
    .from(seats)
    .where(and(eq(seats.eventId, eventId), eq(seats.status, "available")))
    .groupBy(seats.zoneId)
    .all();

  const sold = new Map(soldRows.map((r) => [r.zoneId, Number(r.n)]));
  const held = new Map(heldRows.map((r) => [r.zoneId, Number(r.n ?? 0)]));
  const seatTotals = new Map(seatCounts.map((r) => [r.zoneId, Number(r.n)]));

  const out = new Map<string, ZoneAvailability>();
  for (const z of zoneRows) {
    const capacity =
      z.kind === "seated" ? (seatTotals.get(z.id) ?? 0) : z.capacity;
    const s = sold.get(z.id) ?? 0;
    const h = held.get(z.id) ?? 0;
    out.set(z.id, {
      zoneId: z.id,
      capacity,
      sold: s,
      held: h,
      available: Math.max(0, capacity - s - h),
    });
  }
  return out;
}

/** Seat ids that a buyer may not pick: already ticketed or held by someone else. */
export function unavailableSeatIds(eventId: string, exceptCartId?: string) {
  reapExpiredHolds();

  const sold = db
    .select({ seatId: tickets.seatId })
    .from(tickets)
    .where(
      and(
        eq(tickets.eventId, eventId),
        ne(tickets.status, "cancelled"),
        isNotNull(tickets.seatId),
      ),
    )
    .all();

  const held = db
    .select({ seatId: seatHolds.seatId, cartId: seatHolds.cartId })
    .from(seatHolds)
    .where(
      and(eq(seatHolds.eventId, eventId), gt(seatHolds.expiresAt, nowSec())),
    )
    .all();

  const ids = new Set<string>();
  for (const r of sold) if (r.seatId) ids.add(r.seatId);
  for (const r of held) {
    if (r.seatId && r.cartId !== exceptCartId) ids.add(r.seatId);
  }
  return ids;
}

export function releaseCart(cartId: string) {
  db.delete(seatHolds).where(eq(seatHolds.cartId, cartId)).run();
}

/**
 * Reserve inventory for a cart. Runs in one transaction and re-checks
 * availability inside it, so two simultaneous buyers can't oversell.
 */
export function holdInventory(args: {
  eventId: string;
  cartId: string;
  seatIds?: string[];
  openQty?: { zoneId: string; qty: number }[];
}) {
  const { eventId, cartId, seatIds = [], openQty = [] } = args;
  const expiresAt = nowSec() + HOLD_SECONDS;

  return db.transaction((tx) => {
    tx.delete(seatHolds).where(eq(seatHolds.cartId, cartId)).run();
    tx.delete(seatHolds).where(sql`${seatHolds.expiresAt} < ${nowSec()}`).run();

    if (seatIds.length) {
      const taken = unavailableSeatIds(eventId, cartId);
      const clash = seatIds.filter((s) => taken.has(s));
      if (clash.length) {
        const labels = tx
          .select({ label: seats.label })
          .from(seats)
          .where(inArray(seats.id, clash))
          .all()
          .map((s) => s.label);
        throw new Error(
          `These seats were just taken: ${labels.join(", ")}. Please pick others.`,
        );
      }
      const rows = tx
        .select()
        .from(seats)
        .where(inArray(seats.id, seatIds))
        .all();
      for (const seat of rows) {
        tx.insert(seatHolds)
          .values({
            id: `hold_${seat.id}`,
            eventId,
            seatId: seat.id,
            zoneId: seat.zoneId,
            qty: 1,
            cartId,
            expiresAt,
          })
          .run();
      }
    }

    for (const { zoneId, qty } of openQty) {
      if (qty <= 0) continue;
      const avail = zoneAvailability(eventId).get(zoneId);
      if (!avail || avail.available < qty) {
        throw new Error("Not enough tickets left in that category.");
      }
      tx.insert(seatHolds)
        .values({
          id: `hold_${cartId}_${zoneId}`,
          eventId,
          seatId: null,
          zoneId,
          qty,
          cartId,
          expiresAt,
        })
        .run();
    }

    return { expiresAt };
  });
}
