"use client";

import Link from "next/link";
import { Fragment, useState, useTransition } from "react";
import { cancelOrder, orderDetail } from "@/app/admin/actions";
import { Badge, Button, Card, cn } from "@/components/ui";
import { toast } from "@/components/toast";
import { formatMinor } from "@/lib/money";
import { dateTime } from "@/lib/datetime";

type Row = {
  id: string;
  publicId: string;
  buyerName: string;
  buyerPhone: string;
  buyerEmail: string | null;
  ticketCount: number;
  discountMinor: number;
  totalMinor: number;
  status: string;
  channel: string;
  createdAt: number;
  showDateLabel: string | null;
  items: string | null;
  discountCode: string | null;
  referralCode: string | null;
};

type Detail = Awaited<ReturnType<typeof orderDetail>>;

const tone = {
  paid: "green",
  pending: "amber",
  failed: "red",
  cancelled: "neutral",
  refunded: "neutral",
} as const;

export function OrdersTable({
  rows,
  eventTitle,
  origin,
}: {
  rows: Row[];
  eventTitle: string;
  /** Resolved on the server so the link a buyer receives outlives this deployment. */
  origin: string;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, startLoad] = useTransition();

  function toggle(row: Row) {
    if (openId === row.id) {
      setOpenId(null);
      setDetail(null);
      return;
    }
    setOpenId(row.id);
    setDetail(null);
    startLoad(async () => setDetail(await orderDetail(row.id)));
  }

  return (
    <Card className="overflow-x-auto">
      <table className="w-full min-w-[880px] text-sm">
        <thead>
          <tr className="border-b border-ink-700 text-left text-xs uppercase tracking-wide text-ink-400">
            <th className="px-4 py-3 font-medium">Order</th>
            <th className="px-4 py-3 font-medium">Buyer</th>
            <th className="px-4 py-3 font-medium">Tickets</th>
            <th className="px-4 py-3 font-medium">Code</th>
            <th className="px-4 py-3 text-right font-medium">Discount</th>
            <th className="px-4 py-3 text-right font-medium">Paid</th>
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-700">
          {rows.map((order) => (
            <Fragment key={order.id}>
              <tr
                className={cn("cursor-pointer hover:bg-ink-800", openId === order.id && "bg-ink-800")}
                onClick={() => toggle(order)}
              >
                <td className="px-4 py-3">
                  <span className="font-mono text-xs text-brand-600">{order.publicId}</span>
                  <p className="mt-0.5 text-xs text-ink-500">
                    {dateTime(order.createdAt)}
                  </p>
                </td>
                <td className="px-4 py-3">
                  <p className="font-medium">{order.buyerName}</p>
                  <p className="text-xs text-ink-400">{order.buyerPhone}</p>
                </td>
                <td className="px-4 py-3 text-ink-300">
                  {order.items ?? "—"}
                  {order.showDateLabel ? (
                    <span className="mt-0.5 block text-xs text-ink-500">{order.showDateLabel}</span>
                  ) : null}
                </td>
                <td className="px-4 py-3">
                  {order.discountCode ? (
                    <code className="rounded bg-ink-800 px-1.5 py-0.5 text-xs">{order.discountCode}</code>
                  ) : order.referralCode ? (
                    <code className="rounded bg-brand-100 px-1.5 py-0.5 text-xs text-brand-600">
                      {order.referralCode}
                    </code>
                  ) : (
                    <span className="text-ink-500">—</span>
                  )}
                </td>
                <td className="tabular px-4 py-3 text-right text-ink-300">
                  {order.discountMinor ? `−${formatMinor(order.discountMinor)}` : "—"}
                </td>
                <td className="tabular px-4 py-3 text-right font-medium">
                  {formatMinor(order.totalMinor)}
                </td>
                <td className="px-4 py-3">
                  <Badge tone={tone[order.status as keyof typeof tone] ?? "neutral"}>
                    {order.status}
                  </Badge>
                </td>
                <td className="px-3 py-3 text-right text-ink-500">
                  {openId === order.id ? "▲" : "▼"}
                </td>
              </tr>

              {openId === order.id ? (
                <tr className="bg-ink-850">
                  <td colSpan={8} className="px-4 py-4">
                    {loading || !detail ? (
                      <p className="text-sm text-ink-400">Loading passes…</p>
                    ) : (
                      <OrderDetail
                        order={order}
                        detail={detail}
                        eventTitle={eventTitle}
                        origin={origin}
                        onChanged={() => {
                          setOpenId(null);
                          setDetail(null);
                        }}
                      />
                    )}
                  </td>
                </tr>
              ) : null}
            </Fragment>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

function OrderDetail({
  order,
  detail,
  eventTitle,
  origin,
  onChanged,
}: {
  order: Row;
  detail: Detail;
  eventTitle: string;
  origin: string;
  onChanged: () => void;
}) {
  const [pending, start] = useTransition();
  const orderUrl = `${origin}/order/${order.publicId}`;

  const whatsapp = `https://wa.me/${order.buyerPhone.replace(/\D/g, "")}?text=${encodeURIComponent(
    `Hi ${order.buyerName}, here are your passes for ${eventTitle} (${order.publicId}):\n${orderUrl}`,
  )}`;

  const checkedIn = detail.passes.filter((p) => p.status === "checked_in").length;
  const live = order.status === "paid";

  return (
    <div className="grid gap-5 [&>*]:min-w-0 lg:grid-cols-[1fr_260px]">
      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-400">
          Passes ({detail.passes.length})
          {checkedIn ? <span className="ml-2 text-emerald-600">{checkedIn} scanned</span> : null}
        </p>
        {detail.passes.length === 0 ? (
          <p className="text-sm text-ink-400">
            No passes were issued — this order never completed payment.
          </p>
        ) : (
          <ul className="grid gap-1.5 sm:grid-cols-2">
            {detail.passes.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-ink-700 px-3 py-2 text-sm"
              >
                <span className="min-w-0">
                  <Link
                    href={`/t/${p.code}`}
                    target="_blank"
                    className="font-mono text-xs text-brand-600 hover:underline"
                  >
                    {p.code}
                  </Link>
                  <span className="mt-0.5 block truncate text-xs text-ink-400">
                    {p.zoneName}
                    {p.seatLabel ? ` · ${p.seatLabel}` : ""}
                    {p.admitsCount > 1 ? ` · admits ${p.admitsCount}` : ""}
                  </span>
                </span>
                {p.status === "checked_in" ? (
                  <Badge tone="green">in</Badge>
                ) : p.status === "cancelled" ? (
                  <Badge tone="red">void</Badge>
                ) : (
                  <Badge>valid</Badge>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-3">
        <dl className="space-y-1 rounded-lg border border-ink-700 p-3 text-sm">
          {detail.items.map((i) => (
            <div key={i.zoneName} className="flex justify-between gap-3">
              <dt className="text-ink-400">
                {i.zoneName} × {i.qty}
              </dt>
              <dd className="tabular">{formatMinor(i.unitPriceMinor * i.qty)}</dd>
            </div>
          ))}
          <div className="flex justify-between gap-3 border-t border-ink-700 pt-1.5 font-medium">
            <dt>Paid</dt>
            <dd className="tabular">{formatMinor(order.totalMinor)}</dd>
          </div>
        </dl>

        <div className="grid gap-2">
          <a
            href={whatsapp}
            target="_blank"
            rel="noreferrer"
            className="rounded-lg bg-emerald-600 px-3 py-2 text-center text-sm font-medium text-white hover:bg-emerald-500"
          >
            Send passes on WhatsApp
          </a>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              void navigator.clipboard.writeText(orderUrl);
              toast("Order link copied", "ok");
            }}
          >
            Copy order link
          </Button>
          <Link
            href={`/order/${order.publicId}`}
            target="_blank"
            className="rounded-lg border border-ink-700 bg-ink-800 px-3 py-2 text-center text-sm hover:bg-ink-700"
          >
            Open passes ↗
          </Link>

          {live ? (
            <Button
              variant="danger"
              size="sm"
              disabled={pending}
              onClick={() => {
                if (
                  !confirm(
                    `Cancel ${order.publicId}? All ${detail.passes.length} passes stop working and the seats go back on sale. Refund the buyer separately in your payment gateway.`,
                  )
                )
                  return;
                start(async () => {
                  await cancelOrder(order.id, "refunded");
                  toast("Order cancelled — seats released", "ok");
                  onChanged();
                });
              }}
            >
              {pending ? "Cancelling…" : "Cancel & release seats"}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
