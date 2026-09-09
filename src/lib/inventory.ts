import { and, eq, gt, inArray, isNotNull, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { seatHolds, seats, tickets, zones } from "@/db/schema";

export const HOLD_SECONDS = 8 * 60;

const nowSec = () => Math.floor(Date.now() / 1000);

/** Holds are reaped lazily — no cron needed for a single-node deployment. */
export async function reapExpiredHolds() {
  await db.delete(seatHolds).where(sql`${seatHolds.expiresAt} < ${nowSec()}`);
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
export async function zoneAvailability(
  eventId: string,
  showDateId?: string | null,
): Promise<Map<string, ZoneAvailability>> {
  await reapExpiredHolds();

  const [zoneRows, soldRows, heldRows, seatCounts] = await Promise.all([
    db.select().from(zones).where(eq(zones.eventId, eventId)),
    db
      .select({ zoneId: tickets.zoneId, n: sql<number>`count(*)` })
      .from(tickets)
      .where(and(eq(tickets.eventId, eventId), ne(tickets.status, "cancelled")))
      .groupBy(tickets.zoneId),
    db
      .select({ zoneId: seatHolds.zoneId, n: sql<number>`sum(${seatHolds.qty})` })
      .from(seatHolds)
      .where(and(eq(seatHolds.eventId, eventId), gt(seatHolds.expiresAt, nowSec())))
      .groupBy(seatHolds.zoneId),
    db
      .select({ zoneId: seats.zoneId, n: sql<number>`count(*)` })
      .from(seats)
      .where(and(eq(seats.eventId, eventId), eq(seats.status, "available")))
      .groupBy(seats.zoneId),
  ]);

  const [soldThisDate, heldThisDate] = await Promise.all([
    showDateId
    ? db
        .select({ zoneId: tickets.zoneId, n: sql<number>`count(*)` })
        .from(tickets)
        .where(
          and(
            eq(tickets.eventId, eventId),
            ne(tickets.status, "cancelled"),
            eq(tickets.showDateId, showDateId),
          ),
        )
        .groupBy(tickets.zoneId)
    : Promise.resolve(soldRows),
    showDateId
    ? db
        .select({ zoneId: seatHolds.zoneId, n: sql<number>`sum(${seatHolds.qty})` })
        .from(seatHolds)
        .where(
          and(
            eq(seatHolds.eventId, eventId),
            gt(seatHolds.expiresAt, nowSec()),
            eq(seatHolds.showDateId, showDateId),
          ),
        )
        .groupBy(seatHolds.zoneId)
    : Promise.resolve(heldRows),
  ]);

  const soldAll = new Map(soldRows.map((r) => [r.zoneId, Number(r.n)]));
  const soldDate = new Map(soldThisDate.map((r) => [r.zoneId, Number(r.n)]));
  const heldAll = new Map(heldRows.map((r) => [r.zoneId, Number(r.n ?? 0)]));
  const heldDate = new Map(heldThisDate.map((r) => [r.zoneId, Number(r.n ?? 0)]));
  const seatTotals = new Map(seatCounts.map((r) => [r.zoneId, Number(r.n)]));

  const out = new Map<string, ZoneAvailability>();
  for (const z of zoneRows) {
    const season = z.allDates === 1;
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
export async function unavailableSeatIds(
  eventId: string,
  showDateId?: string | null,
  exceptCartId?: string,
) {
  await reapExpiredHolds();

  const soldWhere = [
    eq(tickets.eventId, eventId),
    ne(tickets.status, "cancelled"),
    isNotNull(tickets.seatId),
  ];
  if (showDateId) soldWhere.push(eq(tickets.showDateId, showDateId));

  const heldWhere = [eq(seatHolds.eventId, eventId), gt(seatHolds.expiresAt, nowSec())];
  if (showDateId) heldWhere.push(eq(seatHolds.showDateId, showDateId));

  const [sold, held] = await Promise.all([
    db.select({ seatId: tickets.seatId }).from(tickets).where(and(...soldWhere)),
    db
      .select({ seatId: seatHolds.seatId, cartId: seatHolds.cartId })
      .from(seatHolds)
      .where(and(...heldWhere)),
  ]);

  const ids = new Set<string>();
  for (const r of sold) if (r.seatId) ids.add(r.seatId);
  for (const r of held) if (r.seatId && r.cartId !== exceptCartId) ids.add(r.seatId);
  return ids;
}

export async function releaseCart(cartId: string) {
  await db.delete(seatHolds).where(eq(seatHolds.cartId, cartId));
}

/**
 * Reserve inventory for a cart. Runs in one transaction and re-checks
 * availability inside it, so two simultaneous buyers can't oversell.
 */
export async function holdInventory(args: {
  eventId: string;
  cartId: string;
  showDateId?: string | null;
  seatIds?: string[];
  openQty?: { zoneId: string; qty: number }[];
}) {
  const { eventId, cartId, showDateId = null, seatIds = [], openQty = [] } = args;
  const expiresAt = nowSec() + HOLD_SECONDS;

  return db.transaction(async (tx) => {
    await tx.delete(seatHolds).where(eq(seatHolds.cartId, cartId));
    await tx.delete(seatHolds).where(sql`${seatHolds.expiresAt} < ${nowSec()}`);

    if (seatIds.length) {
      const taken = await unavailableSeatIds(eventId, showDateId, cartId);
      const clash = seatIds.filter((s) => taken.has(s));
      if (clash.length) {
        const labels = (
          await tx.select({ label: seats.label }).from(seats).where(inArray(seats.id, clash))
        ).map((s) => s.label);
        throw new Error(
          `These seats were just taken: ${labels.join(", ")}. Please pick others.`,
        );
      }
      const rows = await tx.select().from(seats).where(inArray(seats.id, seatIds));
      for (const seat of rows) {
        await tx.insert(seatHolds).values({
          id: `hold_${seat.id}_${showDateId ?? "single"}`,
          eventId,
          seatId: seat.id,
          zoneId: seat.zoneId,
          showDateId,
          qty: 1,
          cartId,
          expiresAt,
        });
      }
    }

    for (const { zoneId, qty } of openQty) {
      if (qty <= 0) continue;
      const avail = (await zoneAvailability(eventId, showDateId)).get(zoneId);
      if (!avail || avail.available < qty) {
        throw new Error("Not enough tickets left in that category.");
      }
      await tx.insert(seatHolds).values({
        id: `hold_${cartId}_${zoneId}`,
        eventId,
        seatId: null,
        zoneId,
        showDateId,
        qty,
        cartId,
        expiresAt,
      });
    }

    return { expiresAt };
  });
}

/**
 * Free capacity for every night at once.
 *
 * The landing page needs a sold-out flag per night, and calling
 * `zoneAvailability` in a loop meant a nine-night event issued fifty-odd
 * queries. This does it in three, and groups in memory.
 */
export async function nightsFreeCapacity(eventId: string, nightIds: string[]) {
  if (!nightIds.length) return new Map<string, number>();
  await reapExpiredHolds();

  const [zoneRows, soldRows, heldRows, seatCounts] = await Promise.all([
    db.select().from(zones).where(eq(zones.eventId, eventId)),
    db
      .select({
        zoneId: tickets.zoneId,
        showDateId: tickets.showDateId,
        n: sql<number>`count(*)`,
      })
      .from(tickets)
      .where(and(eq(tickets.eventId, eventId), ne(tickets.status, "cancelled")))
      .groupBy(tickets.zoneId, tickets.showDateId),
    db
      .select({
        zoneId: seatHolds.zoneId,
        showDateId: seatHolds.showDateId,
        n: sql<number>`sum(${seatHolds.qty})`,
      })
      .from(seatHolds)
      .where(and(eq(seatHolds.eventId, eventId), gt(seatHolds.expiresAt, nowSec())))
      .groupBy(seatHolds.zoneId, seatHolds.showDateId),
    db
      .select({ zoneId: seats.zoneId, n: sql<number>`count(*)` })
      .from(seats)
      .where(and(eq(seats.eventId, eventId), eq(seats.status, "available")))
      .groupBy(seats.zoneId),
  ]);

  const seatTotals = new Map(seatCounts.map((r) => [r.zoneId, Number(r.n)]));
  const key = (zoneId: string, nightId: string | null) => `${zoneId}:${nightId ?? "-"}`;

  const usedPerNight = new Map<string, number>();
  const usedAllNights = new Map<string, number>();
  for (const r of [...soldRows, ...heldRows]) {
    const n = Number(r.n ?? 0);
    usedPerNight.set(key(r.zoneId, r.showDateId), (usedPerNight.get(key(r.zoneId, r.showDateId)) ?? 0) + n);
    usedAllNights.set(r.zoneId, (usedAllNights.get(r.zoneId) ?? 0) + n);
  }

  const out = new Map<string, number>();
  for (const nightId of nightIds) {
    let free = 0;
    for (const z of zoneRows) {
      const capacity = z.kind === "seated" ? (seatTotals.get(z.id) ?? 0) : z.capacity;
      // A season pass draws from one pool shared across every night.
      const used = z.allDates === 1
        ? (usedAllNights.get(z.id) ?? 0)
        : (usedPerNight.get(key(z.id, nightId)) ?? 0);
      free += Math.max(0, capacity - used);
    }
    out.set(nightId, free);
  }
  return out;
}
