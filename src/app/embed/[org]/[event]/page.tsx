import { notFound } from "next/navigation";
import { loadPublicEvent } from "@/lib/public-event";
import { BookingWidget } from "@/components/booking/booking-widget";
import { ViewTracker } from "@/components/booking/view-tracker";
import { EmbedAutoHeight } from "@/components/booking/embed-auto-height";

/**
 * The bare booking surface an organiser drops into their own site. No hero,
 * no navigation, nothing that competes with the host page.
 */
export default async function EmbedPage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string; event: string }>;
  searchParams: Promise<{ ref?: string; code?: string }>;
}) {
  const { org, event: eventSlug } = await params;
  const { ref, code } = await searchParams;
  const data = await loadPublicEvent(org, eventSlug);
  if (!data) notFound();

  const { event, organizer, zones, seats } = data;
  const start = new Date(event.startsAt * 1000);

  return (
    <div className="surface-light p-4">
      <ViewTracker eventId={event.id} source="embed" referral={ref ?? null} />
      <EmbedAutoHeight />

      <div className="mx-auto max-w-lg">
        <div className="mb-4">
          <h1 className="text-xl font-bold tracking-tight text-slate-900">{event.title}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {start.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}
            {" · "}
            {start.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
            {event.venue ? ` · ${event.venue}` : ""}
          </p>
        </div>

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
          channel="embed"
          supportPhone={organizer.supportPhone}
        />
      </div>
    </div>
  );
}
