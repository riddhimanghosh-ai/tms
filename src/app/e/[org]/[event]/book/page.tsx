import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { loadPublicEvent } from "@/lib/public-event";
import { formatMinor } from "@/lib/money";
import { BookingWidget } from "@/components/booking/booking-widget";
import { Countdown } from "@/components/booking/countdown";
import { UrgencyStrip, urgencySignals } from "@/components/booking/urgency";

type Props = {
  params: Promise<{ org: string; event: string }>;
  searchParams: Promise<{ ref?: string; code?: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { org, event } = await params;
  const data = await loadPublicEvent(org, event);
  return { title: data ? `Book — ${data.event.title}` : "Book tickets" };
}

export default async function BookPage({ params, searchParams }: Props) {
  const { org, event: eventSlug } = await params;
  const { ref, code } = await searchParams;
  const data = await loadPublicEvent(org, eventSlug);
  if (!data) notFound();

  const { event, organizer, zones, seats, ticketsSold } = data;
  const start = new Date(event.startsAt * 1000);
  const signals = urgencySignals({
    zones,
    ticketsSold,
    startsAt: event.startsAt,
    nowSec: data.nowSec,
  });

  return (
    <div className="surface-light min-h-dvh">
      <nav className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/85 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-5 py-3">
          <Link
            href={`/e/${org}/${eventSlug}`}
            className="rounded-lg px-2 py-1 text-sm text-slate-500 hover:bg-slate-100 hover:text-slate-900"
          >
            ← Event details
          </Link>
          <p className="ml-auto truncate text-sm font-medium text-slate-900">{event.title}</p>
        </div>
      </nav>

      <main className="mx-auto grid max-w-5xl gap-8 px-5 py-8 lg:grid-cols-[340px_1fr] lg:items-start">
        {/* Context rail — keeps the buyer oriented while they pick. */}
        <aside className="space-y-4 lg:sticky lg:top-20">
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <h1 className="text-lg font-semibold tracking-tight text-slate-900">{event.title}</h1>
            <p className="mt-1 text-sm text-slate-500">
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
              <p className="mt-0.5 text-sm text-slate-500">
                {event.venue}
                {event.city ? `, ${event.city}` : ""}
              </p>
            ) : null}

            <div className="mt-5 border-t border-slate-100 pt-4">
              <Countdown targetSec={event.startsAt} tone="light" label="Doors open in" />
            </div>
          </div>

          {signals.length ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <UrgencyStrip signals={signals} />
            </div>
          ) : null}

          <ol className="space-y-2 rounded-2xl border border-slate-200 bg-white p-5 text-sm">
            {[
              event.layoutType === "seated" ? "Pick your seats" : "Pick your passes",
              "Enter your name and mobile",
              "Pay — passes arrive instantly",
            ].map((step, i) => (
              <li key={step} className="flex gap-3 text-slate-600">
                <span className="grid size-5 shrink-0 place-items-center rounded-full bg-slate-900 text-[11px] font-medium text-white">
                  {i + 1}
                </span>
                {step}
              </li>
            ))}
          </ol>

          {organizer.supportPhone ? (
            <p className="px-1 text-xs text-slate-500">
              Stuck? WhatsApp{" "}
              <a
                href={`https://wa.me/${organizer.supportPhone.replace(/\D/g, "")}`}
                className="underline"
                target="_blank"
                rel="noreferrer"
              >
                {organizer.supportPhone}
              </a>
            </p>
          ) : null}
        </aside>

        <div>
          <BookingWidget
            event={{
              id: event.id,
              title: event.title,
              layoutType: event.layoutType,
              maxTicketsPerOrder: event.maxTicketsPerOrder,
              status: event.status,
              terms: event.terms,
            }}
            zones={zones}
            seats={seats}
            brandColor={organizer.brandColor}
            initialCode={ref ?? code ?? null}
            channel="web"
            supportPhone={organizer.supportPhone}
          />

          {event.status !== "published" ? (
            <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-5">
              <p className="text-sm font-medium text-slate-900">What&apos;s planned</p>
              <ul className="mt-3 divide-y divide-slate-100">
                {zones.map((z) => (
                  <li key={z.id} className="flex justify-between gap-4 py-2 text-sm">
                    <span className="text-slate-600">{z.name}</span>
                    <span className="font-medium text-slate-900">
                      {formatMinor(z.priceMinor)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </main>
    </div>
  );
}
