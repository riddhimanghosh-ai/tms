import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db, first } from "@/db";
import { events } from "@/db/schema";
import { requireOrganizer } from "@/lib/auth";
import { Badge } from "@/components/ui";
import { PageNav } from "@/components/nav";
import { StatusControl } from "./status-control";
import { DuplicateButton } from "./duplicate-button";
import { EVENT_TZ } from "@/lib/datetime";

const statusTone = {
  published: "green",
  draft: "neutral",
  paused: "amber",
  closed: "red",
} as const;

export default async function EventLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const organizer = await requireOrganizer();

  const event = await first(db
    .select()
    .from(events)
    .where(and(eq(events.id, id), eq(events.organizerId, organizer.id)))
    );
  if (!event) notFound();

  const publicPath = `/e/${organizer.slug}/${event.slug}`;
  const start = new Date(event.startsAt * 1000);

  return (
    <div className="space-y-6">
      <PageNav
        backHref="/admin"
        backLabel="All events"
        crumbs={[
          { label: "Events", href: "/admin" },
          { label: event.title },
        ]}
      />

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex flex-wrap items-center gap-3 text-xl font-semibold tracking-tight">
            {event.title}
            <Badge tone={statusTone[event.status as keyof typeof statusTone] ?? "neutral"}>
              {event.status}
            </Badge>
          </h1>
          <p className="mt-1 text-sm text-ink-400">
            {start.toLocaleString("en-IN", { timeZone: EVENT_TZ, dateStyle: "full", timeStyle: "short" })}
            {event.venue ? ` · ${event.venue}` : ""}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={publicPath}
            target="_blank"
            className="rounded-lg border border-ink-700 bg-ink-800 px-3 py-2 text-sm hover:bg-ink-700"
          >
            View booking page ↗
          </Link>
          <DuplicateButton eventId={event.id} title={event.title} />
          <StatusControl eventId={event.id} status={event.status} />
        </div>
      </div>

      {children}
    </div>
  );
}
