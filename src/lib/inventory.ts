import { and, eq, gt, inArray, isNotNull, ne, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { seatHolds, seats, tickets, zones } from "@/db/schema";

export const HOLD_SECONDS = 8 * 60;

const nowSec = () => Math.floor(Date.now() / 1000);

/** Holds are reaped lazily — no cron needed for a single-node deployment. */
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
 * Inventory is per night. A normal zone's capacity resets each night; a season
 * pass (`allDates`) is sold once and counted across every night, so its rows
 * are matched without a date filter.
 */
export function zoneAvailability(
  eventId: string,
  showDateId?: string | null,
): Map<string, ZoneAvailability> {
  reapExpiredHolds();

  const zoneRows = db.select().from(zones).where(eq(zones.eventId, eventId)).all();
  const seasonZoneIds = new Set(zoneRows.filter((z) => z.allDates).map((z) => z.id));

  const dateFilter = <T extends { showDateId: unknown }>(col: T["showDateId"]): SQL | undefined =>
    showDateId ? eq(col as never, showDateId) : undefined;

  const soldRows = db
    .select({ zoneId: tickets.zoneId, n: sql<number>`count(*)` })
    .from(tickets)
    .where(and(eq(tickets.eventId, eventId), ne(tickets.status, "cancelled")))
    .groupBy(tickets.zoneId)
    .all();

  const soldThisDate = showDateId
    ? db
        .select({ zoneId: tickets.zoneId, n: sql<number>`count(*)` })
        .from(tickets)
        .where(
          and(
            eq(tickets.eventId, eventId),
            ne(tickets.status, "cancelled"),
            dateFilter(tickets.showDateId),
          ),
        )
        .groupBy(tickets.zoneId)
        .all()
    : soldRows;

  const heldRows = db
    .select({ zoneId: seatHolds.zoneId, n: sql<number>`sum(${seatHolds.qty})` })
    .from(seatHolds)
    .where(and(eq(seatHolds.eventId, eventId), gt(seatHolds.expiresAt, nowSec())))
    .groupBy(seatHolds.zoneId)
    .all();

  const heldThisDate = showDateId
    ? db
        .select({ zoneId: seatHolds.zoneId, n: sql<number>`sum(${seatHolds.qty})` })
        .from(seatHolds)
        .where(
          and(
            eq(seatHolds.eventId, eventId),
            gt(seatHolds.expiresAt, nowSec()),
            dateFilter(seatHolds.showDateId),
          ),
        )
        .groupBy(seatHolds.zoneId)
        .all()
    : heldRows;

  const seatCounts = db
    .select({ zoneId: seats.zoneId, n: sql<number>`count(*)` })
    .from(seats)
    .where(and(eq(seats.eventId, eventId), eq(seats.status, "available")))
    .groupBy(seats.zoneId)
    .all();

  const soldAll = new Map(soldRows.map((r) => [r.zoneId, Number(r.n)]));
  const soldDate = new Map(soldThisDate.map((r) => [r.zoneId, Number(r.n)]));
  const heldAll = new Map(heldRows.map((r) => [r.zoneId, Number(r.n ?? 0)]));
  const heldDate = new Map(heldThisDate.map((r) => [r.zoneId, Number(r.n ?? 0)]));
  const seatTotals = new Map(seatCounts.map((r) => [r.zoneId, Number(r.n)]));

  const out = new Map<string, ZoneAvailability>();
  for (const z of zoneRows) {
    const season = seasonZoneIds.has(z.id);
    const capacity = z.kind === "seated" ? (seatTotals.get(z.id) ?? 0) : z.capacity;
    const s = (season ? soldAll : soldDate).get(z.id) ?? 0;
    const h = (season ? heldAll : heldDate).get(z.id) ?? 0;
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

/** Seat ids a buyer may not pick on a given night. */
export function unavailableSeatIds(
  eventId: string,
  showDateId?: string | null,
  exceptCartId?: string,
) {
  reapExpiredHolds();

  const soldWhere = [
    eq(tickets.eventId, eventId),
    ne(tickets.status, "cancelled"),
    isNotNull(tickets.seatId),
  ];
  if (showDateId) soldWhere.push(eq(tickets.showDateId, showDateId));

  const sold = db
    .select({ seatId: tickets.seatId })
    .from(tickets)
    .where(and(...soldWhere))
    .all();

  const heldWhere = [eq(seatHolds.eventId, eventId), gt(seatHolds.expiresAt, nowSec())];
  if (showDateId) heldWhere.push(eq(seatHolds.showDateId, showDateId));

  const held = db
    .select({ seatId: seatHolds.seatId, cartId: seatHolds.cartId })
    .from(seatHolds)
    .where(and(...heldWhere))
    .all();

  const ids = new Set<string>();
  for (const r of sold) if (r.seatId) ids.add(r.seatId);
  for (const r of held) if (r.seatId && r.cartId !== exceptCartId) ids.add(r.seatId);
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
  showDateId?: string | null;
  seatIds?: string[];
  openQty?: { zoneId: string; qty: number }[];
}) {
  const { eventId, cartId, showDateId = null, seatIds = [], openQty = [] } = args;
  const expiresAt = nowSec() + HOLD_SECONDS;

  return db.transaction((tx) => {
    tx.delete(seatHolds).where(eq(seatHolds.cartId, cartId)).run();
    tx.delete(seatHolds).where(sql`${seatHolds.expiresAt} < ${nowSec()}`).run();

    if (seatIds.length) {
      const taken = unavailableSeatIds(eventId, showDateId, cartId);
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
      const rows = tx.select().from(seats).where(inArray(seats.id, seatIds)).all();
      for (const seat of rows) {
        tx.insert(seatHolds)
          .values({
            id: `hold_${seat.id}_${showDateId ?? "single"}`,
            eventId,
            seatId: seat.id,
            zoneId: seat.zoneId,
            showDateId,
            qty: 1,
            cartId,
            expiresAt,
          })
          .run();
      }
    }

    for (const { zoneId, qty } of openQty) {
      if (qty <= 0) continue;
      const avail = zoneAvailability(eventId, showDateId).get(zoneId);
      if (!avail || avail.available < qty) {
        throw new Error("Not enough tickets left in that category.");
      }
      tx.insert(seatHolds)
        .values({
          id: `hold_${cartId}_${zoneId}`,
          eventId,
          seatId: null,
          zoneId,
          showDateId,
          qty,
          cartId,
          expiresAt,
        })
        .run();
    }

    return { expiresAt };
  });
}
