import { and, desc, eq, sql } from "drizzle-orm";
import { db, first } from "@/db";
import { events, scans, tickets } from "@/db/schema";
import { requireOrganizer } from "@/lib/auth";
import { Badge, Card, SectionTitle } from "@/components/ui";
import { Scanner } from "./scanner";

export default async function CheckinPage({
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

  const counts = await first(db
    .select({
      expected: sql<number>`coalesce(sum(${tickets.admitsCount}), 0)`,
      inside: sql<number>`coalesce(sum(case when ${tickets.inside} = 1 then ${tickets.admitsCount} else 0 end), 0)`,
      arrived: sql<number>`coalesce(sum(case when ${tickets.entryCount} > 0 then ${tickets.admitsCount} else 0 end), 0)`,
    })
    .from(tickets)
    .where(and(eq(tickets.eventId, id), sql`${tickets.status} != 'cancelled'`))
    );

  const recent = await db
    .select({ scan: scans, ticket: tickets })
    .from(scans)
    .innerJoin(tickets, eq(tickets.id, scans.ticketId))
    .where(eq(scans.eventId, id))
    .orderBy(desc(scans.at))
    .limit(15)
    ;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <Scanner
        eventId={id}
        inside={Number(counts?.inside ?? 0)}
        expected={Number(counts?.expected ?? 0)}
        arrived={Number(counts?.arrived ?? 0)}
        allowReentry={event.allowReentry === 1}
      />

      <Card className="p-5">
        <SectionTitle
          title="Gate activity"
          hint={event.allowReentry ? "Every entry and exit, newest first." : "Newest first."}
        />
        {recent.length === 0 ? (
          <p className="text-sm text-ink-400">Nobody has scanned yet.</p>
        ) : (
          <ul className="divide-y divide-ink-700 text-sm">
            {recent.map(({ scan, ticket }) => (
              <li key={scan.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate font-medium">{ticket.holderName}</p>
                  <p className="truncate text-xs text-ink-400">
                    {ticket.zoneName}
                    {ticket.seatLabel ? ` · ${ticket.seatLabel}` : ""} · {ticket.code}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge tone={scan.direction === "in" ? "green" : "neutral"}>
                    {scan.direction === "in" ? "in" : "out"}
                  </Badge>
                  <span className="tabular text-xs text-ink-400">
                    {new Date(scan.at * 1000).toLocaleTimeString("en-IN", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
