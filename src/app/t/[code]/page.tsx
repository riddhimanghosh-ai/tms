import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { events, orders, organizers, tickets } from "@/db/schema";
import { qrSvg } from "@/lib/qr";
import { TicketCard } from "@/components/booking/ticket-card";
import { BackButton } from "@/components/nav";

/** A single pass, for forwarding one ticket to one friend. */
export default async function TicketPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;

  const row = await db
    .select({ ticket: tickets, event: events, organizer: organizers, order: orders })
    .from(tickets)
    .innerJoin(events, eq(events.id, tickets.eventId))
    .innerJoin(orders, eq(orders.id, tickets.orderId))
    .innerJoin(organizers, eq(organizers.id, events.organizerId))
    .where(eq(tickets.code, code.toUpperCase()))
    .get();
  if (!row) notFound();

  const qr = await qrSvg(row.ticket.code);

  return (
    <div className="surface-light grid min-h-dvh place-items-center px-4 py-10">
      <div className="w-full max-w-md space-y-4">
        <BackButton
          href={`/order/${row.order.publicId}`}
          label="All passes in this booking"
          tone="light"
        />
        <TicketCard
          code={row.ticket.code}
          qr={qr}
          holderName={row.ticket.holderName ?? row.order.buyerName}
          zoneName={row.ticket.zoneName}
          seatLabel={row.ticket.seatLabel}
          admitsCount={row.ticket.admitsCount}
          status={row.ticket.status}
          eventTitle={row.event.title}
          venue={row.event.venue}
          startsAt={row.event.startsAt}
          brandColor={row.organizer.brandColor}
        />
        <p className="text-center text-xs text-slate-400">
          Show this screen at the gate. One scan per pass.
        </p>
      </div>
    </div>
  );
}
