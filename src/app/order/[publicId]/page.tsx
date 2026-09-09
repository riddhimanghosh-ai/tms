import Link from "next/link";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db, first } from "@/db";
import { events, orders, organizers, tickets } from "@/db/schema";
import { formatMinor } from "@/lib/money";
import { qrSvg } from "@/lib/qr";
import { TicketCard } from "@/components/booking/ticket-card";
import { BackButton } from "@/components/nav";

export default async function OrderPage({
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

  const { order, event, organizer } = row;
  const ticketRows = await db
    .select()
    .from(tickets)
    .where(eq(tickets.orderId, order.id))
    ;

  const qrs = await Promise.all(ticketRows.map((t) => qrSvg(t.code)));
  const start = new Date(event.startsAt * 1000);

  const whatsappText = `My passes for ${event.title} — order ${order.publicId}. View them here:`;

  return (
    <div className="surface-light min-h-dvh px-4 py-10">
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="flex items-center justify-between gap-3">
          <BackButton href={`/e/${organizer.slug}/${event.slug}`} label="Event page" tone="light" />
          <Link
            href={`/e/${organizer.slug}/${event.slug}/book`}
            className="text-sm font-medium underline"
            style={{ color: organizer.brandColor }}
          >
            Book more passes
          </Link>
        </div>

        {order.status === "paid" ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-center">
            <p className="text-2xl">🎉</p>
            <h1 className="mt-2 text-xl font-bold text-emerald-900">You&apos;re going!</h1>
            <p className="mt-1 text-sm text-emerald-800">
              {ticketRows.length} pass{ticketRows.length > 1 ? "es" : ""} for {event.title}.
              Show the QR at the gate.
            </p>
            <p className="mt-2 font-mono text-xs text-emerald-700">{order.publicId}</p>
          </div>
        ) : (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center">
            <h1 className="text-xl font-bold text-amber-900">Payment not completed</h1>
            <p className="mt-1 text-sm text-amber-800">
              This order is <strong>{order.status}</strong>. Nothing has been charged and no
              passes were issued.
            </p>
            <Link
              href={`/e/${organizer.slug}/${event.slug}`}
              className="mt-4 inline-block rounded-lg bg-amber-900 px-4 py-2 text-sm font-medium text-white"
            >
              Try booking again
            </Link>
          </div>
        )}

        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="font-semibold text-slate-900">{event.title}</h2>
          <p className="mt-1 text-sm text-slate-600">
            {start.toLocaleDateString("en-IN", {
              weekday: "long",
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
            {" · "}
            {start.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
          </p>
          {event.venue ? (
            <p className="text-sm text-slate-600">
              {event.venue}
              {event.city ? `, ${event.city}` : ""}
            </p>
          ) : null}

          <dl className="mt-4 space-y-1.5 border-t border-slate-100 pt-4 text-sm">
            <div className="flex justify-between">
              <dt className="text-slate-600">Booked by</dt>
              <dd className="text-slate-900">{order.buyerName}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-600">Mobile</dt>
              <dd className="text-slate-900">{order.buyerPhone}</dd>
            </div>
            {order.discountMinor > 0 ? (
              <div className="flex justify-between text-emerald-700">
                <dt>You saved</dt>
                <dd className="tabular-nums">{formatMinor(order.discountMinor)}</dd>
              </div>
            ) : null}
            <div className="flex justify-between border-t border-slate-100 pt-2 font-semibold">
              <dt className="text-slate-900">Paid</dt>
              <dd className="tabular-nums text-slate-900">{formatMinor(order.totalMinor)}</dd>
            </div>
          </dl>
        </section>

        {ticketRows.length > 0 ? (
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-slate-900">Your passes</h2>
              <a
                href={`https://wa.me/?text=${encodeURIComponent(whatsappText)}`}
                target="_blank"
                rel="noreferrer"
                className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-500"
              >
                Share on WhatsApp
              </a>
            </div>

            {ticketRows.map((t, i) => (
              <TicketCard
                key={t.id}
                code={t.code}
                qr={qrs[i]}
                holderName={t.holderName ?? order.buyerName}
                zoneName={t.zoneName}
                seatLabel={t.seatLabel}
                admitsCount={t.admitsCount}
                status={t.status}
                eventTitle={event.title}
                venue={event.venue}
                startsAt={event.startsAt}
                brandColor={organizer.brandColor}
              />
            ))}
          </section>
        ) : null}

        {event.terms ? (
          <p className="text-xs leading-relaxed text-slate-500">{event.terms}</p>
        ) : null}

        <p className="text-center text-xs text-slate-400">
          Questions? WhatsApp {organizer.supportPhone ?? organizer.name}.
        </p>
      </div>
    </div>
  );
}
