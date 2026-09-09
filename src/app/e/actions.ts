"use server";

import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { events, orders, pageViews, referralCodes } from "@/db/schema";
import { confirmOrder, createPendingOrder, failOrder } from "@/lib/booking";
import { quoteCart, type CartLine } from "@/lib/pricing";
import { activeProvider, createIntent, verifyCallback } from "@/lib/payments";
import { unavailableSeatIds, zoneAvailability } from "@/lib/inventory";
import { id } from "@/lib/ids";

/** Priced entirely on the server — the browser never decides what to charge. */
export async function priceCart(
  eventId: string,
  lines: CartLine[],
  code: string | null,
) {
  const event = await db.select().from(events).where(eq(events.id, eventId)).get();
  if (!event) throw new Error("Event not found.");
  const q = quoteCart({ event, lines, code });
  return {
    ticketCount: q.ticketCount,
    subtotalMinor: q.subtotalMinor,
    discountMinor: q.discountMinor,
    feeMinor: q.feeMinor,
    totalMinor: q.totalMinor,
    codeError: q.codeError,
    appliedCode: q.discountCode?.code ?? q.referralCode?.code ?? null,
    appliedLabel:
      q.discountCode?.label ??
      (q.referralCode ? `Referred by ${q.referralCode.ownerName}` : null),
  };
}

/**
 * Availability for one night. The widget calls this when the buyer switches
 * nights, so a nine-night event doesn't need nine page loads.
 */
export async function liveAvailability(eventId: string, showDateId: string | null) {
  const avail = zoneAvailability(eventId, showDateId);
  return {
    zones: Object.fromEntries([...avail].map(([k, v]) => [k, v.available])),
    takenSeatIds: [...unavailableSeatIds(eventId, showDateId)],
  };
}

export type StartCheckoutResult =
  | { ok: true; publicId: string; provider: string; checkout: Record<string, string | number> }
  | { ok: false; error: string };

export async function startCheckout(input: {
  eventId: string;
  lines: CartLine[];
  seatIds: string[];
  code: string | null;
  showDateId: string | null;
  buyerName: string;
  buyerPhone: string;
  buyerEmail: string;
  channel: string;
}): Promise<StartCheckoutResult> {
  const event = await db.select().from(events).where(eq(events.id, input.eventId)).get();
  if (!event) return { ok: false, error: "Event not found." };
  if (event.status !== "published") return { ok: false, error: "Tickets are not on sale." };
  if (!input.buyerName.trim()) return { ok: false, error: "Enter the name on the booking." };
  if (!/^[+0-9 ()-]{8,}$/.test(input.buyerPhone.trim()))
    return { ok: false, error: "Enter a valid mobile number — your passes are sent there." };

  try {
    const { orderId, publicId, quote } = createPendingOrder({
      event,
      cartId: id(),
      lines: input.lines,
      seatIds: input.seatIds,
      code: input.code,
      showDateId: input.showDateId,
      buyerName: input.buyerName.trim(),
      buyerPhone: input.buyerPhone.trim(),
      buyerEmail: input.buyerEmail.trim() || null,
      channel: input.channel,
    });

    const intent = await createIntent({
      orderPublicId: publicId,
      amountMinor: quote.totalMinor,
      currency: event.currency,
      buyerName: input.buyerName,
      buyerPhone: input.buyerPhone,
      buyerEmail: input.buyerEmail,
    });

    await db
      .update(orders)
      .set({ paymentProvider: intent.provider, paymentRef: intent.ref })
      .where(eq(orders.id, orderId));

    return {
      ok: true,
      publicId,
      provider: intent.provider,
      checkout: intent.checkout,
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Something went wrong." };
  }
}

/** Called by the mock gateway page and by the Razorpay browser callback. */
export async function completePayment(
  publicId: string,
  payload: Record<string, string> = {},
) {
  const order = await db.select().from(orders).where(eq(orders.publicId, publicId)).get();
  if (!order) return { ok: false as const, error: "Order not found." };
  if (order.status === "paid") return { ok: true as const };

  if (!verifyCallback(payload)) {
    failOrder(order.id, "failed");
    return { ok: false as const, error: "Payment could not be verified." };
  }

  confirmOrder({
    orderId: order.id,
    paymentProvider: activeProvider(),
    paymentRef: payload.razorpay_payment_id ?? order.paymentRef ?? "mock",
  });
  return { ok: true as const };
}

export async function abandonPayment(publicId: string) {
  const order = await db.select().from(orders).where(eq(orders.publicId, publicId)).get();
  if (order) failOrder(order.id, "cancelled");
}

/** Fire-and-forget view counter, plus referral click attribution. */
export async function trackView(eventId: string, source: string, ref?: string | null) {
  await db.insert(pageViews).values({ id: id(), eventId, source, referralCode: ref ?? null });
  if (ref) {
    await db
      .update(referralCodes)
      .set({ clicks: sql`${referralCodes.clicks} + 1` })
      .where(
        and(eq(referralCodes.eventId, eventId), eq(sql`upper(${referralCodes.code})`, ref.toUpperCase())),
      );
  }
}
