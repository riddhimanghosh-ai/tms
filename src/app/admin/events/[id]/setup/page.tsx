import Link from "next/link";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { eventDates, events, seats, tickets, zones } from "@/db/schema";
import { requireOrganizer } from "@/lib/auth";
import { zoneAvailability } from "@/lib/inventory";
import { parseLayerList, type ZoneShape } from "@/lib/seat-layout";
import { formatMinor } from "@/lib/money";
import { Card } from "@/components/ui";
import { ZoneManager } from "../tickets/zone-manager";
import { DatesManager } from "../dates/dates-manager";
import { DetailsStep } from "./details-step";
import { PublishStep } from "./publish-step";
import { WizardShell } from "./wizard-shell";
import { SETUP_STEPS } from "./steps";

export default async function SetupPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ step?: string }>;
}) {
  const { id } = await params;
  const { step = "details" } = await searchParams;
  const organizer = await requireOrganizer();

  const event = await db
    .select()
    .from(events)
    .where(and(eq(events.id, id), eq(events.organizerId, organizer.id)))
    .get();
  if (!event) return null;

  const current = SETUP_STEPS.some((s) => s.slug === step) ? step : "details";

  const zoneRows = await db
    .select()
    .from(zones)
    .where(eq(zones.eventId, id))
    .orderBy(zones.sortOrder)
    .all();

  const nightRows = await db
    .select()
    .from(eventDates)
    .where(eq(eventDates.eventId, id))
    .orderBy(asc(eventDates.sortOrder), asc(eventDates.startsAt))
    .all();

  const avail = zoneAvailability(id);
  const seatRows =
    event.layoutType === "seated"
      ? await db.select().from(seats).where(eq(seats.eventId, id)).all()
      : [];
  const soldSeatIds = new Set(
    (await db.select({ seatId: tickets.seatId }).from(tickets).where(eq(tickets.eventId, id)).all())
      .map((t) => t.seatId)
      .filter(Boolean) as string[],
  );

  const capacity = [...avail.values()].reduce((n, z) => n + z.capacity, 0);

  // A step counts as done when it holds enough for the event to actually sell.
  const completed = [
    event.venue && event.description ? "details" : null,
    capacity > 0 ? "venue" : null,
    zoneRows.some((z) => z.priceMinor > 0) ? "categories" : null,
    nightRows.length > 0 ? "nights" : null,
    event.status === "published" ? "publish" : null,
  ].filter(Boolean) as string[];

  const stage = {
    label: event.stageLabel,
    position: event.stagePosition as "auto",
    shape: event.stageShape as "auto",
  };

  const zoneManagerProps = {
    event: { id: event.id, layoutType: event.layoutType, currency: event.currency },
    stage,
    nightCount: nightRows.length,
    zones: zoneRows.map((z) => ({
      ...z,
      shape: z.shape as ZoneShape,
      layerColors: parseLayerList(z.layerColors),
      layerNotes: parseLayerList(z.layerNotes),
      sold: avail.get(z.id)?.sold ?? 0,
      capacityResolved: avail.get(z.id)?.capacity ?? z.capacity,
    })),
    seats: seatRows.map((s) => ({
      id: s.id,
      zoneId: s.zoneId,
      label: s.label,
      rowLabel: s.rowLabel,
      seatNumber: s.seatNumber,
      ringIndex: s.ringIndex,
      posInRing: s.posInRing,
      ringSize: s.ringSize,
      x: s.x,
      y: s.y,
      state: soldSeatIds.has(s.id)
        ? ("sold" as const)
        : s.status === "blocked"
          ? ("blocked" as const)
          : ("available" as const),
    })),
  };

  return (
    <WizardShell eventId={id} current={current} completed={completed}>
      {current === "details" ? <DetailsStep event={event} /> : null}

      {current === "venue" ? (
        <div className="space-y-5">
          <Card className="flex flex-wrap items-center justify-between gap-4 p-5">
            <div>
              <p className="text-sm text-ink-400">Venue capacity</p>
              <p className="tabular text-3xl font-semibold tracking-tight">
                {capacity.toLocaleString("en-IN")}
                <span className="ml-2 text-base font-normal text-ink-400">
                  {event.layoutType === "seated" ? "seats" : "passes"}
                </span>
              </p>
            </div>
            <p className="max-w-sm text-sm text-ink-400">
              {event.layoutType === "seated"
                ? "Each block below has its own shape and seat grid. Mix shapes freely — a ringed floor with tiered stands is one event."
                : "Open ground: capacity is the sum of your categories. Nobody picks a seat."}
            </p>
          </Card>
          <ZoneManager {...zoneManagerProps} />
        </div>
      ) : null}

      {current === "categories" ? (
        <div className="space-y-5">
          <Card className="p-5">
            <p className="mb-3 text-sm text-ink-400">
              Prices and capacities stay editable after you publish — change one here and the
              booking page updates immediately.
            </p>
            <ul className="divide-y divide-ink-700">
              {zoneRows.map((z) => (
                <li key={z.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <span className="flex min-w-0 items-center gap-2.5">
                    <span className="size-2.5 shrink-0 rounded-full" style={{ background: z.color }} />
                    <span className="truncate font-medium">{z.name}</span>
                  </span>
                  <span className="tabular shrink-0 font-semibold">
                    {formatMinor(z.priceMinor)}
                  </span>
                </li>
              ))}
              {zoneRows.length === 0 ? (
                <li className="py-2 text-sm text-ink-400">No categories yet — add one below.</li>
              ) : null}
            </ul>
          </Card>
          <ZoneManager {...zoneManagerProps} />
        </div>
      ) : null}

      {current === "nights" ? (
        <DatesManager
          eventId={id}
          eventStartsAt={event.startsAt}
          nights={nightRows.map((n) => ({
            id: n.id,
            startsAt: n.startsAt,
            endsAt: n.endsAt,
            label: n.label,
            note: n.note,
            active: n.active,
            sold: 0,
            grossMinor: 0,
          }))}
        />
      ) : null}

      {current === "publish" ? (
        <PublishStep
          event={{
            id: event.id,
            title: event.title,
            slug: event.slug,
            status: event.status,
            venue: event.venue,
            description: event.description,
            coverImageUrl: event.coverImageUrl,
          }}
          orgSlug={organizer.slug}
          capacity={capacity}
          categoryCount={zoneRows.length}
          nightCount={nightRows.length}
          lowestPriceMinor={
            zoneRows.length ? Math.min(...zoneRows.map((z) => z.priceMinor)) : null
          }
        />
      ) : null}

      {current !== "publish" ? (
        <p className="text-sm text-ink-400">
          Everything here stays editable later —{" "}
          <Link href={`/admin/events/${id}/settings`} className="underline hover:text-ink-50">
            Settings
          </Link>{" "}
          and the tabs above cover the same ground once you&apos;re live.
        </p>
      ) : null}
    </WizardShell>
  );
}
