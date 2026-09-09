import { and, eq, sql } from "drizzle-orm";
import { db, first } from "@/db";
import {
  discountCodes,
  eventDates,
  orderItems,
  orders,
  seatHolds,
  seats,
  tickets,
  zones,
  type Event,
} from "@/db/schema";
import { holdInventory, releaseCart } from "./inventory";
import { id, orderPublicId, ticketCode } from "./ids";
import { quoteCart, type CartLine } from "./pricing";
import { shortDate } from "@/lib/datetime";

const nowSec = () => Math.floor(Date.now() / 1000);

export type CreateOrderInput = {
  event: Event;
  cartId: string;
  lines: CartLine[];
  seatIds?: string[];
  code?: string | null;
  buyerName: string;
  buyerPhone: string;
  buyerEmail?: string | null;
  channel?: string;
  holderNames?: Record<string, string>;
  /** Which night, for multi-night events. */
  showDateId?: string | null;
};

/**
 * Prices the cart server-side, reserves inventory, and writes a pending order.
 * Tickets are only minted once payment confirms.
 */
export async function createPendingOrder(input: CreateOrderInput) {
  const { event, cartId, lines, seatIds = [] } = input;

  if (!lines.some((l) => l.qty > 0)) throw new Error("Your cart is empty.");

  const nights = await db
    .select()
    .from(eventDates)
    .where(and(eq(eventDates.eventId, event.id), eq(eventDates.active, 1)))
    .orderBy(eventDates.sortOrder);

  // A multi-night event must know which night before anything is reserved.
  let showDate = nights.find((n) => n.id === input.showDateId) ?? null;
  if (nights.length > 1 && !showDate) throw new Error("Please choose which night you're coming.");
  if (nights.length === 1) showDate = nights[0];
  if (nights.length > 1 && showDate && showDate.startsAt < nowSec())
    throw new Error("That night has already passed.");

  const totalQty = lines.reduce((n, l) => n + l.qty, 0);
  if (totalQty > event.maxTicketsPerOrder) {
    throw new Error(`You can book at most ${event.maxTicketsPerOrder} tickets in one order.`);
  }
  if (event.layoutType === "seated" && seatIds.length !== totalQty) {
    throw new Error("Please pick a seat for every ticket.");
  }

  const quote = await quoteCart({
    event,
    lines,
    code: input.code,
    buyerPhone: input.buyerPhone,
  });
  if (quote.codeError && (input.code ?? "").trim()) throw new Error(quote.codeError);

  await holdInventory({
    eventId: event.id,
    cartId,
    showDateId: showDate?.id ?? null,
    seatIds,
    openQty:
      event.layoutType === "seated"
        ? []
        : lines.filter((l) => l.qty > 0).map((l) => ({ zoneId: l.zoneId, qty: l.qty })),
  });

  const orderId = id();
  const publicId = orderPublicId();

  await db.transaction(async (tx) => {
    await tx.insert(orders).values({
      id: orderId,
      publicId,
      eventId: event.id,
      organizerId: event.organizerId,
      showDateId: showDate?.id ?? null,
      showDateLabel: showDate ? nightLabel(showDate) : null,
      buyerName: input.buyerName,
      buyerPhone: input.buyerPhone,
      buyerEmail: input.buyerEmail ?? null,
      subtotalMinor: quote.subtotalMinor,
      discountMinor: quote.discountMinor,
      feeMinor: quote.feeMinor,
      totalMinor: quote.totalMinor,
      commissionMinor: quote.commissionMinor,
      discountCodeId: quote.discountCode?.id ?? null,
      referralCodeId: quote.referralCode?.id ?? null,
      ticketCount: quote.ticketCount,
      status: "pending",
      channel: input.channel ?? "web",
      notes: JSON.stringify({ cartId, seatIds }),
    });

    for (const line of quote.lines) {
      await tx.insert(orderItems).values({
        id: id(),
        orderId,
        zoneId: line.zoneId,
        zoneName: line.zoneName,
        qty: line.qty,
        unitPriceMinor: line.unitPriceMinor,
      });
    }
  });

  return { orderId, publicId, quote };
}

/**
 * Confirms payment and mints one ticket row per admission. Idempotent — a
 * duplicated gateway callback will not double-issue tickets.
 */
export async function confirmOrder(args: {
  orderId: string;
  paymentProvider: string;
  paymentRef: string;
}) {
  return db.transaction(async (tx) => {
    const order = await first(tx.select().from(orders).where(eq(orders.id, args.orderId)));
    if (!order) throw new Error("Order not found.");
    if (order.status === "paid") return order;
    if (order.status !== "pending") throw new Error("This order can't be paid.");

    const meta = JSON.parse(order.notes ?? "{}") as { cartId?: string; seatIds?: string[] };

    const showDateStartsAt = order.showDateId
      ? ((await first(tx.select().from(eventDates).where(eq(eventDates.id, order.showDateId))))
          ?.startsAt ?? null)
      : null;

    const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, order.id));

    const seatQueue = [...(meta.seatIds ?? [])];
    const seatRows = seatQueue.length
      ? await tx.select().from(seats).where(eq(seats.eventId, order.eventId))
      : [];
    const seatById = new Map(seatRows.map((s) => [s.id, s]));

    for (const item of items) {
      const zone = await first(tx.select().from(zones).where(eq(zones.id, item.zoneId)));
      for (let i = 0; i < item.qty; i++) {
        // Seated events consume the seats the buyer picked, in zone order.
        const seatId = seatQueue.find((sid) => seatById.get(sid)?.zoneId === item.zoneId) ?? null;
        if (seatId) seatQueue.splice(seatQueue.indexOf(seatId), 1);

        await tx.insert(tickets).values({
          id: id(),
          code: ticketCode(),
          orderId: order.id,
          eventId: order.eventId,
          zoneId: item.zoneId,
          zoneName: item.zoneName,
          seatId,
          seatLabel: seatId ? (seatById.get(seatId)?.label ?? null) : null,
          showDateId: order.showDateId,
          showDateLabel: order.showDateLabel,
          showDateStartsAt,
          holderName: order.buyerName,
          admitsCount: zone?.admitsCount ?? 1,
          status: "valid",
        });
      }
    }

    if (order.discountCodeId) {
      await tx
        .update(discountCodes)
        .set({ usedCount: sql`${discountCodes.usedCount} + 1` })
        .where(eq(discountCodes.id, order.discountCodeId));
    }

    await tx
      .update(orders)
      .set({
        status: "paid",
        paidAt: nowSec(),
        paymentProvider: args.paymentProvider,
        paymentRef: args.paymentRef,
      })
      .where(eq(orders.id, order.id));

    // Inventory is now committed as tickets; the reservation can go.
    if (meta.cartId) await tx.delete(seatHolds).where(eq(seatHolds.cartId, meta.cartId));

    return { ...order, status: "paid" as const };
  });
}

export async function failOrder(orderId: string, reason = "cancelled") {
  const order = await first(db.select().from(orders).where(eq(orders.id, orderId)));
  if (!order || order.status === "paid") return;
  const meta = JSON.parse(order.notes ?? "{}") as { cartId?: string };
  if (meta.cartId) await releaseCart(meta.cartId);
  await db.update(orders).set({ status: reason }).where(eq(orders.id, orderId));
}

/** "Night 3 — Finale", or the date itself when no label was given. */
export function nightLabel(night: { label: string | null; startsAt: number }) {
  if (night.label) return night.label;
  return shortDate(night.startsAt);
}
