import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  events,
  orders,
  pageViews,
  referralCodes,
  tickets,
  zones,
} from "@/db/schema";
import { zoneAvailability } from "./inventory";

const DAY = 86400;
const nowSec = () => Math.floor(Date.now() / 1000);

export type EventStats = ReturnType<typeof eventStats>;

/** Everything the event dashboard needs, in one pass over the tables. */
export function eventStats(eventId: string, windowDays: number | null = 30) {
  // `null` means all time: reach back past the first order rather than special
  // -casing every query below.
  const span = windowDays ?? 3650;
  const since = nowSec() - span * DAY;
  const event = db.select().from(events).where(eq(events.id, eventId)).get();
  const prevSince = since - span * DAY;

  const totals = db
    .select({
      orders: sql<number>`count(*)`,
      tickets: sql<number>`coalesce(sum(${orders.ticketCount}), 0)`,
      gross: sql<number>`coalesce(sum(${orders.totalMinor}), 0)`,
      net: sql<number>`coalesce(sum(${orders.subtotalMinor} - ${orders.discountMinor}), 0)`,
      discounts: sql<number>`coalesce(sum(${orders.discountMinor}), 0)`,
      fees: sql<number>`coalesce(sum(${orders.feeMinor}), 0)`,
      commission: sql<number>`coalesce(sum(${orders.commissionMinor}), 0)`,
    })
    .from(orders)
    .where(and(eq(orders.eventId, eventId), eq(orders.status, "paid")))
    .get();

  const windowed = (from: number, to: number) =>
    db
      .select({
        gross: sql<number>`coalesce(sum(${orders.totalMinor}), 0)`,
        tickets: sql<number>`coalesce(sum(${orders.ticketCount}), 0)`,
      })
      .from(orders)
      .where(
        and(
          eq(orders.eventId, eventId),
          eq(orders.status, "paid"),
          sql`${orders.createdAt} >= ${from} and ${orders.createdAt} < ${to}`,
        ),
      )
      .get();

  const current = windowed(since, nowSec() + DAY);
  const previous = windowed(prevSince, since);

  const pct = (now: number, before: number) =>
    before > 0 ? ((now - before) / before) * 100 : null;

  // Daily buckets, zero-filled so the line never lies about quiet days.
  const rows = db
    .select({
      day: sql<number>`${orders.createdAt} / ${DAY}`,
      gross: sql<number>`sum(${orders.totalMinor})`,
      tickets: sql<number>`sum(${orders.ticketCount})`,
    })
    .from(orders)
    .where(
      and(
        eq(orders.eventId, eventId),
        eq(orders.status, "paid"),
        gte(orders.createdAt, since),
      ),
    )
    .groupBy(sql`${orders.createdAt} / ${DAY}`)
    .all();

  const byDay = new Map(rows.map((r) => [Number(r.day), r]));
  const startDay = Math.floor(since / DAY);
  const endDay = Math.floor(nowSec() / DAY);
  const daily: { label: string; value: number; secondary: number; ts: number }[] = [];
  for (let d = startDay; d <= endDay; d++) {
    const hit = byDay.get(d);
    daily.push({
      ts: d * DAY,
      label: new Date(d * DAY * 1000).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
      }),
      value: Number(hit?.gross ?? 0),
      secondary: Number(hit?.tickets ?? 0),
    });
  }

  const zoneRows = db
    .select()
    .from(zones)
    .where(eq(zones.eventId, eventId))
    .orderBy(zones.sortOrder)
    .all();
  const avail = zoneAvailability(eventId);

  const zoneSales = db
    .select({
      zoneId: tickets.zoneId,
      sold: sql<number>`count(*)`,
    })
    .from(tickets)
    .where(and(eq(tickets.eventId, eventId), sql`${tickets.status} != 'cancelled'`))
    .groupBy(tickets.zoneId)
    .all();
  const soldByZone = new Map(zoneSales.map((r) => [r.zoneId, Number(r.sold)]));

  const zoneBreakdown = zoneRows.map((z) => {
    const sold = soldByZone.get(z.id) ?? 0;
    return {
      zone: z,
      sold,
      capacity: avail.get(z.id)?.capacity ?? z.capacity,
      available: avail.get(z.id)?.available ?? 0,
      revenueMinor: sold * z.priceMinor,
    };
  });

  const channels = db
    .select({
      channel: orders.channel,
      n: sql<number>`sum(${orders.ticketCount})`,
      gross: sql<number>`sum(${orders.totalMinor})`,
    })
    .from(orders)
    .where(and(eq(orders.eventId, eventId), eq(orders.status, "paid")))
    .groupBy(orders.channel)
    .all();

  const referrals = db
    .select({
      code: referralCodes.code,
      ownerName: referralCodes.ownerName,
      clicks: referralCodes.clicks,
      orders: sql<number>`count(${orders.id})`,
      tickets: sql<number>`coalesce(sum(${orders.ticketCount}), 0)`,
      gross: sql<number>`coalesce(sum(${orders.totalMinor}), 0)`,
      commission: sql<number>`coalesce(sum(${orders.commissionMinor}), 0)`,
    })
    .from(referralCodes)
    .leftJoin(
      orders,
      and(eq(orders.referralCodeId, referralCodes.id), eq(orders.status, "paid")),
    )
    .where(eq(referralCodes.eventId, eventId))
    .groupBy(referralCodes.id)
    .orderBy(desc(sql`coalesce(sum(${orders.totalMinor}), 0)`))
    .all();

  const checkedIn = db
    .select({ n: sql<number>`count(*)` })
    .from(tickets)
    .where(and(eq(tickets.eventId, eventId), eq(tickets.status, "checked_in")))
    .get();

  const views = db
    .select({ n: sql<number>`count(*)` })
    .from(pageViews)
    .where(eq(pageViews.eventId, eventId))
    .get();

  const totalCapacity = zoneBreakdown.reduce((n, z) => n + z.capacity, 0);
  const totalSold = zoneBreakdown.reduce((n, z) => n + z.sold, 0);
  const viewCount = Number(views?.n ?? 0);
  const orderCount = Number(totals?.orders ?? 0);

  return {
    totals: {
      orders: orderCount,
      tickets: Number(totals?.tickets ?? 0),
      grossMinor: Number(totals?.gross ?? 0),
      netMinor: Number(totals?.net ?? 0),
      discountsMinor: Number(totals?.discounts ?? 0),
      feesMinor: Number(totals?.fees ?? 0),
      commissionMinor: Number(totals?.commission ?? 0),
      avgOrderMinor: orderCount ? Math.round(Number(totals?.gross ?? 0) / orderCount) : 0,
    },
    deltas: {
      gross: pct(Number(current?.gross ?? 0), Number(previous?.gross ?? 0)),
      tickets: pct(Number(current?.tickets ?? 0), Number(previous?.tickets ?? 0)),
    },
    daily,
    zoneBreakdown,
    channels: channels.map((c) => ({
      channel: c.channel,
      tickets: Number(c.n ?? 0),
      grossMinor: Number(c.gross ?? 0),
    })),
    referrals,
    totalCapacity,
    totalSold,
    sellThroughPct: totalCapacity ? (totalSold / totalCapacity) * 100 : 0,
    checkedIn: Number(checkedIn?.n ?? 0),
    daysToGo: event ? Math.max(0, Math.ceil((event.startsAt - nowSec()) / DAY)) : 0,
    windowDays,
    nowSec: nowSec(),
    views: viewCount,
    conversionPct: viewCount ? (orderCount / viewCount) * 100 : 0,
  };
}

/** Cross-event roll-up for the organiser's home screen. */
export function organizerSummary(organizerId: string) {
  const totals = db
    .select({
      orders: sql<number>`count(*)`,
      tickets: sql<number>`coalesce(sum(${orders.ticketCount}), 0)`,
      gross: sql<number>`coalesce(sum(${orders.totalMinor}), 0)`,
    })
    .from(orders)
    .where(and(eq(orders.organizerId, organizerId), eq(orders.status, "paid")))
    .get();

  return {
    orders: Number(totals?.orders ?? 0),
    tickets: Number(totals?.tickets ?? 0),
    grossMinor: Number(totals?.gross ?? 0),
  };
}
