import { and, eq, isNull, or, sql } from "drizzle-orm";
import { db, first } from "@/db";
import { discountCodes, events, orders, referralCodes, zones } from "@/db/schema";
import { requireOrganizer } from "@/lib/auth";
import { CodesManager } from "./codes-manager";

export default async function CodesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const organizer = await requireOrganizer();
  const event = await first(db
    .select()
    .from(events)
    .where(and(eq(events.id, id), eq(events.organizerId, organizer.id)))
    );
  if (!event) return null;

  const discounts = await db
    .select()
    .from(discountCodes)
    .where(
      and(
        eq(discountCodes.organizerId, organizer.id),
        or(isNull(discountCodes.eventId), eq(discountCodes.eventId, id)),
      ),
    )
    ;

  const referrals = await db
    .select({
      code: referralCodes,
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
    .where(eq(referralCodes.eventId, id))
    .groupBy(referralCodes.id)
    ;

  const zoneRows = await db.select().from(zones).where(eq(zones.eventId, id));

  return (
    <CodesManager
      eventId={id}
      publicBase={`/e/${organizer.slug}/${event.slug}`}
      zones={zoneRows.map((z) => ({ id: z.id, name: z.name }))}
      discounts={discounts}
      referrals={referrals.map((r) => ({
        ...r.code,
        orders: Number(r.orders),
        tickets: Number(r.tickets),
        gross: Number(r.gross),
        commission: Number(r.commission),
      }))}
    />
  );
}
