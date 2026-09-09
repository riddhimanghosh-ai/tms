import { and, desc, eq, sql } from "drizzle-orm";
import { db, first } from "@/db";
import { discountCodes, events, orderItems, orders, referralCodes, tickets } from "@/db/schema";
import { getOrganizer } from "@/lib/auth";
import { minorToRupees } from "@/lib/money";
import { exportStamp } from "@/lib/datetime";

const csvCell = (v: unknown) => {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const toCsv = (headers: string[], rows: unknown[][]) =>
  [headers, ...rows].map((r) => r.map(csvCell).join(",")).join("\n");

// Exports read and sort in the venue timezone, not the server's.
const stamp = exportStamp;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const organizer = await getOrganizer();
  if (!organizer) return new Response("Unauthorized", { status: 401 });

  const { id } = await params;
  const event = await first(db
    .select()
    .from(events)
    .where(and(eq(events.id, id), eq(events.organizerId, organizer.id)))
    );
  if (!event) return new Response("Not found", { status: 404 });

  const type = new URL(request.url).searchParams.get("type") ?? "orders";
  let csv: string;

  if (type === "attendees") {
    const rows = await db
      .select({ ticket: tickets, order: orders })
      .from(tickets)
      .innerJoin(orders, eq(orders.id, tickets.orderId))
      .where(eq(tickets.eventId, id))
      .orderBy(desc(tickets.createdAt))
      ;

    csv = toCsv(
      ["Pass code", "Holder", "Phone", "Category", "Seat", "Admits", "Status", "Entered at", "Order"],
      rows.map(({ ticket, order }) => [
        ticket.code,
        ticket.holderName ?? order.buyerName,
        order.buyerPhone,
        ticket.zoneName,
        ticket.seatLabel ?? "",
        ticket.admitsCount,
        ticket.status,
        stamp(ticket.checkedInAt),
        order.publicId,
      ]),
    );
  } else {
    const rows = await db
      .select({
        order: orders,
        items: sql<string>`string_agg(${orderItems.zoneName} || ' x ' || ${orderItems.qty}::text, '; ')`,
        discountCode: discountCodes.code,
        referralCode: referralCodes.code,
      })
      .from(orders)
      .leftJoin(orderItems, eq(orderItems.orderId, orders.id))
      .leftJoin(discountCodes, eq(discountCodes.id, orders.discountCodeId))
      .leftJoin(referralCodes, eq(referralCodes.id, orders.referralCodeId))
      .where(eq(orders.eventId, id))
      .groupBy(orders.id, discountCodes.code, referralCodes.code)
      .orderBy(desc(orders.createdAt))
      ;

    csv = toCsv(
      [
        "Order", "Placed at", "Buyer", "Phone", "Email", "Items", "Tickets",
        "Subtotal", "Discount", "Fee", "Total", "Code", "Referral",
        "Commission", "Channel", "Status",
      ],
      rows.map(({ order, items, discountCode, referralCode }) => [
        order.publicId,
        stamp(order.createdAt),
        order.buyerName,
        order.buyerPhone,
        order.buyerEmail ?? "",
        items ?? "",
        order.ticketCount,
        minorToRupees(order.subtotalMinor),
        minorToRupees(order.discountMinor),
        minorToRupees(order.feeMinor),
        minorToRupees(order.totalMinor),
        discountCode ?? "",
        referralCode ?? "",
        minorToRupees(order.commissionMinor),
        order.channel,
        order.status,
      ]),
    );
  }

  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${event.slug}-${type}.csv"`,
    },
  });
}
