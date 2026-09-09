import { headers } from "next/headers";
import { and, eq } from "drizzle-orm";
import { db, first } from "@/db";
import { events } from "@/db/schema";
import { requireOrganizer } from "@/lib/auth";
import { EmbedPanel } from "./embed-panel";

export default async function EmbedPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const organizer = await requireOrganizer();
  const event = await first(db
    .select()
    .from(events)
    .where(and(eq(events.id, id), eq(events.organizerId, organizer.id)))
    );
  if (!event) return null;

  // The snippets must carry a real absolute URL, so read the host we're served on.
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");

  return (
    <EmbedPanel
      orgSlug={organizer.slug}
      eventSlug={event.slug}
      title={event.title}
      venue={event.venue}
      startsAt={event.startsAt}
      published={event.status === "published"}
      origin={`${proto}://${host}`}
    />
  );
}
