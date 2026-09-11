import { and, eq } from "drizzle-orm";
import { db, first } from "@/db";
import { events } from "@/db/schema";
import { requireOrganizer } from "@/lib/auth";
import { canonicalOrigin } from "@/lib/site-url";
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

  // A snippet is pasted once and left alone for a season, so it has to carry
  // the durable domain rather than whichever deployment served this page.
  const origin = await canonicalOrigin();

  return (
    <EmbedPanel
      orgSlug={organizer.slug}
      eventSlug={event.slug}
      title={event.title}
      venue={event.venue}
      startsAt={event.startsAt}
      published={event.status === "published"}
      origin={origin}
    />
  );
}
