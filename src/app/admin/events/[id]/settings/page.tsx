import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { events } from "@/db/schema";
import { requireOrganizer } from "@/lib/auth";
import { SettingsForm } from "./settings-form";

export default async function SettingsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const organizer = await requireOrganizer();
  const event = await db
    .select()
    .from(events)
    .where(and(eq(events.id, id), eq(events.organizerId, organizer.id)))
    .get();
  if (!event) return null;

  return <SettingsForm event={event} />;
}
