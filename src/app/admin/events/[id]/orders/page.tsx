import Link from "next/link";
import { and, desc, eq, like, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { discountCodes, events, orderItems, orders, referralCodes } from "@/db/schema";
import { requireOrganizer } from "@/lib/auth";
import { formatMinor } from "@/lib/money";
import { Badge, Card, EmptyState, Input } from "@/components/ui";

const tone = {
  paid: "green",
  pending: "amber",
  failed: "red",
  cancelled: "neutral",
  refunded: "neutral",
} as const;

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

  const event = await db
    .select()
    .from(events)
    .where(and(eq(events.id, id), eq(events.organizerId, organizer.id)))
    .get();
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
      items: sql<string>`group_concat(${orderItems.zoneName} || ' × ' || ${orderItems.qty}, ', ')`,
      discountCode: discountCodes.code,
      referralCode: referralCodes.code,
    })
    .from(orders)
    .leftJoin(orderItems, eq(orderItems.orderId, orders.id))
    .leftJoin(discountCodes, eq(discountCodes.id, orders.discountCodeId))
    .leftJoin(referralCodes, eq(referralCodes.id, orders.referralCodeId))
    .where(and(...filters))
    .groupBy(orders.id)
    .orderBy(desc(orders.createdAt))
    .limit(200)
    .all();

  return (
    <div className="space-y-4">
      <form className="flex flex-wrap gap-2">
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
          {["paid", "pending", "failed", "cancelled", "refunded"].map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <button className="rounded-lg border border-ink-700 bg-ink-800 px-4 text-sm hover:bg-ink-700">
          Filter
        </button>
        <a
          href={`/api/events/${id}/export?type=orders`}
          className="ml-auto rounded-lg border border-ink-700 bg-ink-800 px-4 py-2 text-sm hover:bg-ink-700"
        >
          Export CSV
        </a>
      </form>

      {rows.length === 0 ? (
        <EmptyState title="No orders match" body="Try clearing the search or the status filter." />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-b border-ink-800 text-left text-xs uppercase tracking-wide text-ink-400">
                <th className="px-4 py-3 font-medium">Order</th>
                <th className="px-4 py-3 font-medium">Buyer</th>
                <th className="px-4 py-3 font-medium">Tickets</th>
                <th className="px-4 py-3 font-medium">Code</th>
                <th className="px-4 py-3 text-right font-medium">Discount</th>
                <th className="px-4 py-3 text-right font-medium">Paid</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-800/70">
              {rows.map(({ order, items, discountCode, referralCode }) => (
                <tr key={order.id} className="hover:bg-ink-850/50">
                  <td className="px-4 py-3">
                    <Link
                      href={`/order/${order.publicId}`}
                      target="_blank"
                      className="font-mono text-xs text-brand-400 hover:underline"
                    >
                      {order.publicId}
                    </Link>
                    <p className="mt-0.5 text-xs text-ink-500">
                      {new Date(order.createdAt * 1000).toLocaleString("en-IN", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium">{order.buyerName}</p>
                    <p className="text-xs text-ink-400">{order.buyerPhone}</p>
                  </td>
                  <td className="px-4 py-3 text-ink-300">{items ?? "—"}</td>
                  <td className="px-4 py-3">
                    {discountCode ? (
                      <code className="rounded bg-ink-800 px-1.5 py-0.5 text-xs">{discountCode}</code>
                    ) : referralCode ? (
                      <code className="rounded bg-brand-600/15 px-1.5 py-0.5 text-xs text-brand-400">
                        {referralCode}
                      </code>
                    ) : (
                      <span className="text-ink-600">—</span>
                    )}
                  </td>
                  <td className="tabular px-4 py-3 text-right text-ink-300">
                    {order.discountMinor ? `−${formatMinor(order.discountMinor)}` : "—"}
                  </td>
                  <td className="tabular px-4 py-3 text-right font-medium">
                    {formatMinor(order.totalMinor)}
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={tone[order.status as keyof typeof tone] ?? "neutral"}>
                      {order.status}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
