import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { events, orders } from "@/db/schema";
import { requireOrganizer } from "@/lib/auth";
import { eventStats } from "@/lib/analytics";
import { formatMinor } from "@/lib/money";
import { Card, SectionTitle } from "@/components/ui";
import { BarList, SellThrough, StatTile, TrendChart } from "@/components/charts";

const channelLabels: Record<string, string> = {
  web: "Direct link",
  embed: "Embedded on their site",
  whatsapp: "WhatsApp",
  counter: "Counter / cash",
};

export default async function EventOverview({
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

  const stats = eventStats(id);
  const recent = await db
    .select()
    .from(orders)
    .where(and(eq(orders.eventId, id), eq(orders.status, "paid")))
    .orderBy(desc(orders.createdAt))
    .limit(8)
    .all();

  return (
    <div className="space-y-8">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Gross sales"
          value={formatMinor(stats.totals.grossMinor)}
          delta={stats.deltas.gross}
          sub={`vs previous 21 days`}
          spark={stats.daily.map((d) => d.value)}
        />
        <StatTile
          label="Tickets sold"
          value={stats.totals.tickets.toLocaleString("en-IN")}
          delta={stats.deltas.tickets}
          sub={`${stats.sellThroughPct.toFixed(0)}% of ${stats.totalCapacity.toLocaleString("en-IN")} capacity`}
        />
        <StatTile
          label="Average order"
          value={formatMinor(stats.totals.avgOrderMinor)}
          sub={`${stats.totals.orders.toLocaleString("en-IN")} paid orders`}
        />
        <StatTile
          label="Page → booking"
          value={`${stats.conversionPct.toFixed(1)}%`}
          sub={`${stats.views.toLocaleString("en-IN")} landing page views`}
        />
      </div>

      <Card className="p-5">
        <SectionTitle
          title="Daily gross sales"
          hint={`Last 21 days · ${stats.daysToGo} day${stats.daysToGo === 1 ? "" : "s"} until doors open`}
        />
        <TrendChart
          points={stats.daily}
          format="moneyShort"
          valueLabel="Gross sales"
        />
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <SectionTitle title="Revenue by ticket type" hint="Where the money actually comes from." />
          <BarList
            items={stats.zoneBreakdown
              .slice()
              .sort((a, b) => b.revenueMinor - a.revenueMinor)
              .map((z) => ({
                label: z.zone.name,
                value: z.revenueMinor,
                sub: `${z.sold} sold · ${formatMinor(z.zone.priceMinor)} each`,
              }))}
            format="money"
          />
        </Card>

        <Card className="p-5">
          <SectionTitle title="How full each category is" hint="Raise prices on what's nearly gone." />
          <SellThrough
            rows={stats.zoneBreakdown.map((z) => ({
              label: z.zone.name,
              sold: z.sold,
              capacity: z.capacity,
              priceLabel: formatMinor(z.zone.priceMinor),
            }))}
          />
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <SectionTitle title="Promoter leaderboard" hint="Referral codes, sales driven, commission owed." />
          {stats.referrals.length === 0 ? (
            <p className="text-sm text-ink-400">No referral codes yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink-800 text-left text-xs uppercase tracking-wide text-ink-400">
                  <th className="pb-2 font-medium">Promoter</th>
                  <th className="pb-2 text-right font-medium">Tickets</th>
                  <th className="pb-2 text-right font-medium">Sales</th>
                  <th className="pb-2 text-right font-medium">Commission</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-800/70">
                {stats.referrals.map((r) => (
                  <tr key={r.code}>
                    <td className="py-2">
                      <span className="font-medium">{r.ownerName}</span>
                      <span className="ml-2 rounded bg-ink-800 px-1.5 py-0.5 font-mono text-xs text-ink-300">
                        {r.code}
                      </span>
                    </td>
                    <td className="tabular py-2 text-right">{Number(r.tickets)}</td>
                    <td className="tabular py-2 text-right">{formatMinor(Number(r.gross))}</td>
                    <td className="tabular py-2 text-right text-gold-400">
                      {formatMinor(Number(r.commission))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        <div className="space-y-4">
          <Card className="p-5">
            <SectionTitle title="Where buyers came from" />
            <BarList
              items={stats.channels
                .slice()
                .sort((a, b) => b.tickets - a.tickets)
                .map((c) => ({
                  label: channelLabels[c.channel] ?? c.channel,
                  value: c.tickets,
                  sub: formatMinor(c.grossMinor),
                }))}
              format="tickets"
            />
          </Card>

          <Card className="p-5">
            <SectionTitle title="Money breakdown" />
            <dl className="space-y-2 text-sm">
              {[
                ["Ticket face value", stats.totals.grossMinor - stats.totals.feesMinor + stats.totals.discountsMinor],
                ["Discounts given", -stats.totals.discountsMinor],
                ["Convenience fees collected", stats.totals.feesMinor],
                ["Promoter commission owed", -stats.totals.commissionMinor],
              ].map(([label, value]) => (
                <div key={label as string} className="flex justify-between gap-4">
                  <dt className="text-ink-400">{label}</dt>
                  <dd className="tabular font-medium">
                    {Number(value) < 0 ? "−" : ""}
                    {formatMinor(Math.abs(Number(value)))}
                  </dd>
                </div>
              ))}
              <div className="flex justify-between gap-4 border-t border-ink-800 pt-2">
                <dt className="font-medium">Net to you</dt>
                <dd className="tabular font-semibold">
                  {formatMinor(stats.totals.grossMinor - stats.totals.commissionMinor)}
                </dd>
              </div>
            </dl>
          </Card>
        </div>
      </div>

      <Card className="p-5">
        <SectionTitle title="Latest bookings" />
        <ul className="divide-y divide-ink-800/70 text-sm">
          {recent.map((o) => (
            <li key={o.id} className="flex items-center justify-between gap-4 py-2.5">
              <div className="min-w-0">
                <p className="truncate font-medium">{o.buyerName}</p>
                <p className="text-xs text-ink-400">
                  {o.publicId} · {o.ticketCount} ticket{o.ticketCount > 1 ? "s" : ""} ·{" "}
                  {new Date(o.createdAt * 1000).toLocaleString("en-IN", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </p>
              </div>
              <span className="tabular shrink-0 font-medium">
                {formatMinor(o.totalMinor)}
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
