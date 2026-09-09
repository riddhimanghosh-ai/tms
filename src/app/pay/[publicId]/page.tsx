import { eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { db, first } from "@/db";
import { events, orderItems, orders, organizers } from "@/db/schema";
import { activeProvider } from "@/lib/payments";
import { PaymentPanel } from "./payment-panel";

export default async function PayPage({
  params,
}: {
  params: Promise<{ publicId: string }>;
}) {
  const { publicId } = await params;

  const row = await first(db
    .select({ order: orders, event: events, organizer: organizers })
    .from(orders)
    .innerJoin(events, eq(events.id, orders.eventId))
    .innerJoin(organizers, eq(organizers.id, orders.organizerId))
    .where(eq(orders.publicId, publicId))
    );
  if (!row) notFound();
  if (row.order.status === "paid") redirect(`/order/${publicId}`);

  const items = await db
    .select()
    .from(orderItems)
    .where(eq(orderItems.orderId, row.order.id))
    ;

  return (
    <PaymentPanel
      publicId={publicId}
      provider={activeProvider()}
      order={{
        buyerName: row.order.buyerName,
        buyerPhone: row.order.buyerPhone,
        subtotalMinor: row.order.subtotalMinor,
        discountMinor: row.order.discountMinor,
        feeMinor: row.order.feeMinor,
        totalMinor: row.order.totalMinor,
        paymentRef: row.order.paymentRef,
      }}
      eventTitle={row.event.title}
      backHref={`/e/${row.organizer.slug}/${row.event.slug}/book`}
      brandColor={row.organizer.brandColor}
      razorpayKey={process.env.RAZORPAY_KEY_ID ?? ""}
      items={items.map((i) => ({ name: i.zoneName, qty: i.qty, unitPriceMinor: i.unitPriceMinor }))}
    />
  );
}
