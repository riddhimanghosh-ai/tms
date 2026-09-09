import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { events, orders } from "@/db/schema";
import { requireOrganizer } from "@/lib/auth";
import { eventStats } from "@/lib/analytics";
import { formatMinor } from "@/lib/money";
import { Card, SectionTitle } from "@/components/ui";
import { BarList, DonutChart, SellThrough, StatTile, TrendChart } from "@/components/charts";
import { RangeLabel, RangePicker } from "@/components/range-picker";

const channelLabels: Record<string, string> = {
  web: "Website",
  embed: "Their website",
  whatsapp: "WhatsApp",
  counter: "Counter / cash",
};

export default async function EventOverview({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ range?: string }>;
}) {
  const { id } = await params;
  const { range = "30" } = await searchParams;
  const organizer = await requireOrganizer();

  const event = await db
    .select()
    .from(events)
    .where(and(eq(events.id, id), eq(events.organizerId, organizer.id)))
    .get();
  if (!event) return null;

  const windowDays = range === "all" ? null : Number(range) || 30;
  const stats = eventStats(id, windowDays);

  const recent = await db
    .select()
    .from(orders)
    .where(and(eq(orders.eventId, id), eq(orders.status, "paid")))
    .orderBy(desc(orders.createdAt))
    .limit(6)
    .all();

  const live = event.status === "published";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold tracking-tight">Event overview</h2>
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-sm font-medium ${
              live
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-ink-700 bg-ink-800 text-ink-400"
            }`}
          >
            <span
              className={`size-2 rounded-full ${live ? "bg-emerald-500" : "bg-ink-500"}`}
              aria-hidden
            />
            {live ? "Live" : event.status}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden text-sm text-ink-400 sm:inline">
            <RangeLabel days={stats.windowDays} nowSec={stats.nowSec} />
          </span>
          <RangePicker current={range} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Tickets sold"
          value={stats.totals.tickets.toLocaleString("en-IN")}
          delta={stats.deltas.tickets}
          sub={`${stats.sellThroughPct.toFixed(0)}% of capacity`}
        />
        <StatTile
          label="Revenue"
          value={formatMinor(stats.totals.grossMinor)}
          delta={stats.deltas.gross}
          sub={`${stats.totals.orders.toLocaleString("en-IN")} orders`}
        />
        <StatTile
          label="Attendees in"
          value={stats.checkedIn.toLocaleString("en-IN")}
          sub={
            stats.totals.tickets
              ? `${((stats.checkedIn / stats.totals.tickets) * 100).toFixed(0)}% of passes scanned`
              : "Nobody scanned yet"
          }
        />
        <StatTile
          label="Conversion"
          value={`${stats.conversionPct.toFixed(1)}%`}
          sub={`${stats.views.toLocaleString("en-IN")} page views`}
        />
      </div>

      <Card className="p-5">
        <SectionTitle
          title="Ticket sales"
          hint={`Gross per day · ${stats.daysToGo} day${stats.daysToGo === 1 ? "" : "s"} until doors open`}
        />
        <TrendChart points={stats.daily} format="moneyShort" valueLabel="Gross sales" />
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <SectionTitle title="Top ticket types" hint="Share of revenue by category." />
          <BarList
            items={stats.zoneBreakdown
              .slice()
              .sort((a, b) => b.revenueMinor - a.revenueMinor)
              .map((z) => ({ label: z.zone.name, value: z.revenueMinor }))}
            format="money"
            showShare
          />
        </Card>

        <Card className="p-5">
          <SectionTitle title="Sales by source" hint="Where the money actually comes from." />
          <DonutChart
            items={stats.channels
              .slice()
              .sort((a, b) => b.grossMinor - a.grossMinor)
              .map((c) => ({
                label: channelLabels[c.channel] ?? c.channel,
                value: c.grossMinor,
              }))}
            format="money"
            centreLabel="sources"
          />
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
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

        <Card className="p-5">
          <SectionTitle title="Money breakdown" />
          <dl className="space-y-2.5 text-sm">
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
            <div className="flex justify-between gap-4 border-t border-ink-700 pt-2.5 text-base">
              <dt className="font-medium">Net to you</dt>
              <dd className="tabular font-semibold">
                {formatMinor(stats.totals.grossMinor - stats.totals.commissionMinor)}
              </dd>
            </div>
          </dl>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <SectionTitle title="Promoter leaderboard" hint="Sales driven and commission owed." />
          {stats.referrals.length === 0 ? (
            <p className="text-sm text-ink-400">No referral codes yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink-700 text-left text-xs uppercase tracking-wide text-ink-400">
                  <th className="pb-2 font-medium">Promoter</th>
                  <th className="pb-2 text-right font-medium">Tickets</th>
                  <th className="pb-2 text-right font-medium">Sales</th>
                  <th className="pb-2 text-right font-medium">Commission</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-700">
                {stats.referrals.map((r) => (
                  <tr key={r.code}>
                    <td className="py-2.5">
                      <span className="font-medium">{r.ownerName}</span>
                      <span className="ml-2 rounded bg-ink-800 px-1.5 py-0.5 font-mono text-xs text-ink-400">
                        {r.code}
                      </span>
                    </td>
                    <td className="tabular py-2.5 text-right">{Number(r.tickets)}</td>
                    <td className="tabular py-2.5 text-right">{formatMinor(Number(r.gross))}</td>
                    <td className="tabular py-2.5 text-right font-medium text-gold-500">
                      {formatMinor(Number(r.commission))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        <Card className="p-5">
          <SectionTitle title="Latest bookings" />
          <ul className="divide-y divide-ink-700 text-sm">
            {recent.map((o) => (
              <li key={o.id} className="flex items-center justify-between gap-4 py-2.5">
                <div className="min-w-0">
                  <p className="truncate font-medium">{o.buyerName}</p>
                  <p className="text-xs text-ink-400">
                    {o.publicId} · {o.ticketCount} ticket{o.ticketCount > 1 ? "s" : ""}
                    {o.showDateLabel ? ` · ${o.showDateLabel}` : ""}
                  </p>
                </div>
                <span className="tabular shrink-0 font-medium">{formatMinor(o.totalMinor)}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
