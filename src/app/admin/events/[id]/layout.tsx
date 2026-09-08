import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { events } from "@/db/schema";
import { requireOrganizer } from "@/lib/auth";
import { Badge } from "@/components/ui";
import { StatusControl } from "./status-control";

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

  const event = await db
    .select()
    .from(events)
    .where(and(eq(events.id, id), eq(events.organizerId, organizer.id)))
    .get();
  if (!event) notFound();

  const publicPath = `/e/${organizer.slug}/${event.slug}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Link href="/admin" className="text-sm text-ink-400 hover:text-ink-100">
              Events
            </Link>
            <span className="text-ink-600">/</span>
          </div>
          <h1 className="mt-1 flex items-center gap-3 text-xl font-semibold tracking-tight">
            {event.title}
            <Badge tone={statusTone[event.status as keyof typeof statusTone] ?? "neutral"}>
              {event.status}
            </Badge>
          </h1>
          <p className="mt-1 text-sm text-ink-400">
            {new Date(event.startsAt * 1000).toLocaleString("en-IN", {
              dateStyle: "full",
              timeStyle: "short",
            })}
            {event.venue ? ` · ${event.venue}` : ""}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href={publicPath}
            target="_blank"
            className="rounded-lg border border-ink-700 bg-ink-800 px-3 py-2 text-sm hover:bg-ink-700"
          >
            View booking page ↗
          </Link>
          <StatusControl eventId={event.id} status={event.status} />
        </div>
      </div>

      {children}
    </div>
  );
}
