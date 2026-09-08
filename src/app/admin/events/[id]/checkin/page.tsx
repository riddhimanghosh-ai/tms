import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { events, tickets } from "@/db/schema";
import { requireOrganizer } from "@/lib/auth";
import { Card, SectionTitle } from "@/components/ui";
import { Scanner } from "./scanner";

export default async function CheckinPage({
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

  const counts = await db
    .select({
      total: sql<number>`count(*)`,
      inside: sql<number>`sum(case when ${tickets.status} = 'checked_in' then ${tickets.admitsCount} else 0 end)`,
      expected: sql<number>`sum(${tickets.admitsCount})`,
    })
    .from(tickets)
    .where(and(eq(tickets.eventId, id), sql`${tickets.status} != 'cancelled'`))
    .get();

  const recent = await db
    .select()
    .from(tickets)
    .where(and(eq(tickets.eventId, id), eq(tickets.status, "checked_in")))
    .orderBy(desc(tickets.checkedInAt))
    .limit(12)
    .all();

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <Scanner
        eventId={id}
        inside={Number(counts?.inside ?? 0)}
        expected={Number(counts?.expected ?? 0)}
      />

      <Card className="p-5">
        <SectionTitle title="Just scanned" hint="Newest first. Tap to undo a mistake." />
        {recent.length === 0 ? (
          <p className="text-sm text-ink-400">Nobody has entered yet.</p>
        ) : (
          <ul className="divide-y divide-ink-800/70 text-sm">
            {recent.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate font-medium">{t.holderName}</p>
                  <p className="text-xs text-ink-400">
                    {t.zoneName}
                    {t.seatLabel ? ` · ${t.seatLabel}` : ""} · {t.code}
                  </p>
                </div>
                <span className="tabular shrink-0 text-xs text-ink-400">
                  {new Date((t.checkedInAt ?? 0) * 1000).toLocaleTimeString("en-IN", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
