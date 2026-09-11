import { and, desc, eq, like, or, sql } from "drizzle-orm";
import { db, first } from "@/db";
import { discountCodes, events, orderItems, orders, referralCodes } from "@/db/schema";
import { requireOrganizer } from "@/lib/auth";
import { EmptyState, Input } from "@/components/ui";
import { canonicalOrigin } from "@/lib/site-url";
import { OrdersTable } from "./orders-table";

const STATUSES = ["paid", "pending", "failed", "cancelled", "refunded"];

export default async function OrdersPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  const { id } = await params;
  const { q = "", status = "" } = await searchParams;
  const organizer = await requireOrganizer();

  const event = await first(db
    .select()
    .from(events)
    .where(and(eq(events.id, id), eq(events.organizerId, organizer.id)))
    );
  if (!event) return null;

  const filters = [eq(orders.eventId, id)];
  if (status) filters.push(eq(orders.status, status));
  if (q.trim()) {
    const needle = `%${q.trim()}%`;
    filters.push(
      or(
        like(orders.buyerName, needle),
        like(orders.buyerPhone, needle),
        like(orders.publicId, needle),
        like(orders.buyerEmail, needle),
      )!,
    );
  }

  const rows = await db
    .select({
      order: orders,
      items: sql<string>`string_agg(${orderItems.zoneName} || ' × ' || ${orderItems.qty}::text, ', ')`,
      discountCode: discountCodes.code,
      referralCode: referralCodes.code,
    })
    .from(orders)
    .leftJoin(orderItems, eq(orderItems.orderId, orders.id))
    .leftJoin(discountCodes, eq(discountCodes.id, orders.discountCodeId))
    .leftJoin(referralCodes, eq(referralCodes.id, orders.referralCodeId))
    .where(and(...filters))
    .groupBy(orders.id, discountCodes.code, referralCodes.code)
    .orderBy(desc(orders.createdAt))
    .limit(200)
    ;

  return (
    <div className="space-y-4">
      <form className="flex flex-wrap items-center gap-2">
        <Input
          name="q"
          defaultValue={q}
          placeholder="Search name, phone, email or order ID"
          className="max-w-xs"
        />
        <select
          name="status"
          defaultValue={status}
          className="rounded-lg border border-ink-700 bg-ink-850 px-3 py-2 text-sm"
        >
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <button className="rounded-lg border border-ink-700 bg-ink-800 px-4 py-2 text-sm hover:bg-ink-700">
          Filter
        </button>
        {q || status ? (
          <a href={`/admin/events/${id}/orders`} className="px-2 text-sm text-ink-400 hover:text-ink-100">
            Clear
          </a>
        ) : null}
        <a
          href={`/api/events/${id}/export?type=orders`}
          className="ml-auto rounded-lg border border-ink-700 bg-ink-800 px-4 py-2 text-sm hover:bg-ink-700"
        >
          Export CSV
        </a>
      </form>

      <p className="text-sm text-ink-400">
        {rows.length === 200 ? "Showing the latest 200 orders." : `${rows.length} orders.`} Click a
        row to see its passes, message the buyer, or release the seats.
      </p>

      {rows.length === 0 ? (
        <EmptyState title="No orders match" body="Try clearing the search or the status filter." />
      ) : (
        <OrdersTable
          eventTitle={event.title}
          origin={await canonicalOrigin()}
          rows={rows.map(({ order, items, discountCode, referralCode }) => ({
            id: order.id,
            publicId: order.publicId,
            buyerName: order.buyerName,
            buyerPhone: order.buyerPhone,
            buyerEmail: order.buyerEmail,
            ticketCount: order.ticketCount,
            discountMinor: order.discountMinor,
            totalMinor: order.totalMinor,
            status: order.status,
            channel: order.channel,
            createdAt: order.createdAt,
            showDateLabel: order.showDateLabel,
            items,
            discountCode,
            referralCode,
          }))}
        />
      )}
    </div>
  );
}
