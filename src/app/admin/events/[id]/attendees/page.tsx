import { and, desc, eq, like, or } from "drizzle-orm";
import { db, first } from "@/db";
import { events, orders, tickets } from "@/db/schema";
import { requireOrganizer } from "@/lib/auth";
import { Badge, Card, EmptyState, Input } from "@/components/ui";
import { EVENT_TZ } from "@/lib/datetime";

export default async function AttendeesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const { id } = await params;
  const { q = "" } = await searchParams;
  const organizer = await requireOrganizer();

  const event = await first(db
    .select()
    .from(events)
    .where(and(eq(events.id, id), eq(events.organizerId, organizer.id)))
    );
  if (!event) return null;

  const filters = [eq(tickets.eventId, id)];
  if (q.trim()) {
    const needle = `%${q.trim()}%`;
    filters.push(
      or(
        like(tickets.holderName, needle),
        like(tickets.code, needle),
        like(orders.buyerPhone, needle),
      )!,
    );
  }

  const rows = await db
    .select({ ticket: tickets, order: orders })
    .from(tickets)
    .innerJoin(orders, eq(orders.id, tickets.orderId))
    .where(and(...filters))
    .orderBy(desc(tickets.createdAt))
    .limit(500)
    ;

  const checkedIn = rows.filter((r) => r.ticket.status === "checked_in").length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <form className="flex gap-2">
          <Input name="q" defaultValue={q} placeholder="Search name, phone or pass code" className="max-w-xs" />
          <button className="rounded-lg border border-ink-700 bg-ink-800 px-4 text-sm hover:bg-ink-700">
            Search
          </button>
        </form>
        <p className="text-sm text-ink-400">
          <span className="tabular font-medium text-ink-100">{checkedIn}</span> of{" "}
          <span className="tabular">{rows.length}</span> shown have entered
        </p>
        <a
          href={`/api/events/${id}/export?type=attendees`}
          className="ml-auto rounded-lg border border-ink-700 bg-ink-800 px-4 py-2 text-sm hover:bg-ink-700"
        >
          Export CSV
        </a>
      </div>

      {rows.length === 0 ? (
        <EmptyState title="No passes yet" body="Attendee passes appear here as soon as an order is paid." />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-ink-700 text-left text-xs uppercase tracking-wide text-ink-400">
                <th className="px-4 py-3 font-medium">Pass code</th>
                <th className="px-4 py-3 font-medium">Holder</th>
                <th className="px-4 py-3 font-medium">Category</th>
                <th className="px-4 py-3 font-medium">Seat</th>
                <th className="px-4 py-3 font-medium">Entry</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-700">
              {rows.map(({ ticket, order }) => (
                <tr key={ticket.id} className="hover:bg-ink-800">
                  <td className="px-4 py-3 font-mono text-xs">{ticket.code}</td>
                  <td className="px-4 py-3">
                    <p className="font-medium">{ticket.holderName ?? order.buyerName}</p>
                    <p className="text-xs text-ink-400">{order.buyerPhone}</p>
                  </td>
                  <td className="px-4 py-3 text-ink-300">
                    {ticket.zoneName}
                    {ticket.admitsCount > 1 ? (
                      <span className="ml-2 text-xs text-ink-500">admits {ticket.admitsCount}</span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-ink-300">{ticket.seatLabel ?? "—"}</td>
                  <td className="px-4 py-3">
                    {ticket.status === "checked_in" ? (
                      <Badge tone="green">
                        in ·{" "}
                        {new Date((ticket.checkedInAt ?? 0) * 1000).toLocaleTimeString("en-IN", { timeZone: EVENT_TZ,
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </Badge>
                    ) : ticket.status === "cancelled" ? (
                      <Badge tone="red">cancelled</Badge>
                    ) : (
                      <Badge>not arrived</Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
