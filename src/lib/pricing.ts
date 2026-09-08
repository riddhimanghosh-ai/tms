import { and, eq, isNull, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  discountCodes,
  orders,
  referralCodes,
  zones,
  type DiscountCode,
  type Event,
  type ReferralCode,
  type Zone,
} from "@/db/schema";

export type CartLine = { zoneId: string; qty: number };

export type Quote = {
  lines: {
    zoneId: string;
    zoneName: string;
    qty: number;
    unitPriceMinor: number;
    lineTotalMinor: number;
  }[];
  ticketCount: number;
  subtotalMinor: number;
  discountMinor: number;
  feeMinor: number;
  totalMinor: number;
  commissionMinor: number;
  discountCode?: { id: string; code: string; label: string | null };
  referralCode?: { id: string; code: string; ownerName: string };
  /** Set when a code was supplied but rejected; the cart still prices fine. */
  codeError?: string;
};

const nowSec = () => Math.floor(Date.now() / 1000);

function applyRate(
  baseMinor: number,
  type: string,
  value: number,
  capMinor?: number | null,
) {
  // percent values are whole percents; flat values are already paise
  const raw = type === "percent" ? Math.round((baseMinor * value) / 100) : value;
  const capped = capMinor != null ? Math.min(raw, capMinor) : raw;
  return Math.max(0, Math.min(capped, baseMinor));
}

function codeIsLive(c: { startsAt: number | null; endsAt: number | null; active: number }) {
  const t = nowSec();
  if (!c.active) return false;
  if (c.startsAt && t < c.startsAt) return false;
  if (c.endsAt && t > c.endsAt) return false;
  return true;
}

export function lookupDiscountCode(
  organizerId: string,
  eventId: string,
  code: string,
): DiscountCode | undefined {
  return db
    .select()
    .from(discountCodes)
    .where(
      and(
        eq(discountCodes.organizerId, organizerId),
        eq(sql`upper(${discountCodes.code})`, code.trim().toUpperCase()),
        or(isNull(discountCodes.eventId), eq(discountCodes.eventId, eventId)),
      ),
    )
    .get();
}

export function lookupReferralCode(
  organizerId: string,
  eventId: string,
  code: string,
): ReferralCode | undefined {
  return db
    .select()
    .from(referralCodes)
    .where(
      and(
        eq(referralCodes.organizerId, organizerId),
        eq(sql`upper(${referralCodes.code})`, code.trim().toUpperCase()),
        or(isNull(referralCodes.eventId), eq(referralCodes.eventId, eventId)),
      ),
    )
    .get();
}

/**
 * The single source of truth for what a cart costs. The checkout UI and the
 * order-creation path both call this, so a tampered client price can't stick.
 */
export function quoteCart(args: {
  event: Event;
  lines: CartLine[];
  code?: string | null;
  buyerPhone?: string | null;
}): Quote {
  const { event, code, buyerPhone } = args;

  const zoneRows = db.select().from(zones).where(eq(zones.eventId, event.id)).all();
  const byId = new Map<string, Zone>(zoneRows.map((z) => [z.id, z]));

  const lines = args.lines
    .filter((l) => l.qty > 0 && byId.has(l.zoneId))
    .map((l) => {
      const z = byId.get(l.zoneId)!;
      return {
        zoneId: z.id,
        zoneName: z.name,
        qty: l.qty,
        unitPriceMinor: z.priceMinor,
        lineTotalMinor: z.priceMinor * l.qty,
      };
    });

  const ticketCount = lines.reduce((n, l) => n + l.qty, 0);
  const subtotalMinor = lines.reduce((n, l) => n + l.lineTotalMinor, 0);

  const quote: Quote = {
    lines,
    ticketCount,
    subtotalMinor,
    discountMinor: 0,
    feeMinor: 0,
    totalMinor: subtotalMinor,
    commissionMinor: 0,
  };

  if (code?.trim()) {
    const trimmed = code.trim();
    const discount = lookupDiscountCode(event.organizerId, event.id, trimmed);
    const referral = discount
      ? undefined
      : lookupReferralCode(event.organizerId, event.id, trimmed);

    if (discount) {
      const err = validateDiscount(discount, quote, buyerPhone);
      if (err) quote.codeError = err;
      else {
        // A zone-scoped code only discounts that zone's share of the cart.
        const base = discount.zoneId
          ? (lines.find((l) => l.zoneId === discount.zoneId)?.lineTotalMinor ?? 0)
          : subtotalMinor;
        quote.discountMinor = applyRate(
          base,
          discount.type,
          discount.value,
          discount.maxDiscountMinor,
        );
        quote.discountCode = {
          id: discount.id,
          code: discount.code,
          label: discount.label,
        };
        if (quote.discountMinor === 0) {
          quote.codeError = "That code doesn't apply to the tickets in your cart.";
          quote.discountCode = undefined;
        }
      }
    } else if (referral) {
      if (!codeIsLive({ startsAt: null, endsAt: null, active: referral.active })) {
        quote.codeError = "That referral code is no longer active.";
      } else {
        quote.discountMinor = applyRate(
          subtotalMinor,
          referral.discountType,
          referral.discountValue,
        );
        quote.commissionMinor = applyRate(
          subtotalMinor - quote.discountMinor,
          referral.commissionType,
          referral.commissionValue,
        );
        quote.referralCode = {
          id: referral.id,
          code: referral.code,
          ownerName: referral.ownerName,
        };
      }
    } else {
      quote.codeError = "We couldn't find that code.";
    }
  }

  const discounted = Math.max(0, subtotalMinor - quote.discountMinor);
  quote.feeMinor =
    Math.round((discounted * event.bookingFeeBps) / 10_000) +
    event.bookingFeeFlatMinor * ticketCount;
  quote.totalMinor = discounted + quote.feeMinor;
  return quote;
}

function validateDiscount(
  c: DiscountCode,
  quote: Quote,
  buyerPhone?: string | null,
): string | null {
  if (!codeIsLive(c)) return "That code has expired or is not active yet.";
  if (c.maxRedemptions != null && c.usedCount >= c.maxRedemptions)
    return "That code has been fully redeemed.";
  if (quote.ticketCount < c.minTickets)
    return `This code needs at least ${c.minTickets} ticket${c.minTickets > 1 ? "s" : ""}.`;
  if (quote.subtotalMinor < c.minOrderMinor)
    return `This code applies to orders above ₹${Math.round(c.minOrderMinor / 100)}.`;

  if (buyerPhone) {
    const used = db
      .select({ n: sql<number>`count(*)` })
      .from(orders)
      .where(
        and(
          eq(orders.discountCodeId, c.id),
          eq(orders.buyerPhone, buyerPhone),
          eq(orders.status, "paid"),
        ),
      )
      .get();
    if (Number(used?.n ?? 0) >= c.maxPerBuyer)
      return "You've already used this code.";
  }
  return null;
}
