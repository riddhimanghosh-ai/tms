"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import {
  discountCodes,
  events,
  referralCodes,
  seats,
  tickets,
  zones,
} from "@/db/schema";
import { requireOrganizer } from "@/lib/auth";
import { id, slugify } from "@/lib/ids";
import { rupeesToMinor } from "@/lib/money";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const num = (f: FormData, k: string, d = 0) => {
  const v = Number(f.get(k));
  return Number.isFinite(v) ? v : d;
};
const ts = (f: FormData, k: string) => {
  const v = str(f, k);
  return v ? Math.floor(new Date(v).getTime() / 1000) : null;
};

/** Throws unless the signed-in organiser owns this event. */
async function ownedEvent(eventId: string) {
  const organizer = await requireOrganizer();
  const event = await db
    .select()
    .from(events)
    .where(and(eq(events.id, eventId), eq(events.organizerId, organizer.id)))
    .get();
  if (!event) throw new Error("Event not found.");
  return { organizer, event };
}

/* ------------------------------------------------------------------ events */

export async function createEvent(_prev: unknown, form: FormData) {
  const organizer = await requireOrganizer();

  const title = str(form, "title");
  if (!title) return { error: "Give your event a name." };
  const startsAt = ts(form, "startsAt");
  if (!startsAt) return { error: "Pick a start date and time." };

  let slug = slugify(title);
  while (
    await db
      .select()
      .from(events)
      .where(and(eq(events.organizerId, organizer.id), eq(events.slug, slug)))
      .get()
  ) {
    slug = `${slug}-${Math.floor(Math.random() * 900 + 100)}`;
  }

  const eventId = id();
  const layoutType = str(form, "layoutType") === "seated" ? "seated" : "open";

  await db.insert(events).values({
    id: eventId,
    organizerId: organizer.id,
    slug,
    title,
    tagline: str(form, "tagline") || null,
    venue: str(form, "venue") || null,
    city: str(form, "city") || null,
    startsAt,
    endsAt: ts(form, "endsAt"),
    layoutType,
    status: "draft",
    gatePin: String(Math.floor(1000 + Math.random() * 9000)),
  });

  // A brand-new event with no tickets can't sell, so seed one sensible tier.
  await db.insert(zones).values({
    id: id(),
    eventId,
    name: layoutType === "seated" ? "General" : "General Entry",
    kind: layoutType,
    priceMinor: 50000,
    capacity: layoutType === "seated" ? 0 : 500,
    color: "#3987e5",
    rows: layoutType === "seated" ? 10 : 0,
    cols: layoutType === "seated" ? 12 : 0,
  });

  redirect(`/admin/events/${eventId}/tickets`);
}

export async function updateEvent(_prev: unknown, form: FormData) {
  const eventId = str(form, "eventId");
  const { event } = await ownedEvent(eventId);

  await db
    .update(events)
    .set({
      title: str(form, "title") || event.title,
      tagline: str(form, "tagline") || null,
      description: str(form, "description") || null,
      venue: str(form, "venue") || null,
      city: str(form, "city") || null,
      address: str(form, "address") || null,
      coverImageUrl: str(form, "coverImageUrl") || null,
      startsAt: ts(form, "startsAt") ?? event.startsAt,
      endsAt: ts(form, "endsAt"),
      doorsOpenAt: ts(form, "doorsOpenAt"),
      bookingFeeBps: Math.round(num(form, "bookingFeePct") * 100),
      bookingFeeFlatMinor: rupeesToMinor(num(form, "bookingFeeFlat")),
      maxTicketsPerOrder: Math.max(1, num(form, "maxTicketsPerOrder", 10)),
      terms: str(form, "terms") || null,
      gatePin: str(form, "gatePin") || event.gatePin,
    })
    .where(eq(events.id, eventId));

  revalidatePath(`/admin/events/${eventId}`, "layout");
  return { ok: true as const, savedAt: Date.now() };
}

export async function setEventStatus(eventId: string, status: string) {
  await ownedEvent(eventId);
  await db.update(events).set({ status }).where(eq(events.id, eventId));
  revalidatePath(`/admin/events/${eventId}`, "layout");
}

export async function deleteEvent(eventId: string) {
  await ownedEvent(eventId);
  await db.delete(events).where(eq(events.id, eventId));
  redirect("/admin");
}

/* ------------------------------------------------------------------- zones */

export async function saveZone(_prev: unknown, form: FormData) {
  const eventId = str(form, "eventId");
  const { event } = await ownedEvent(eventId);
  const zoneId = str(form, "zoneId");
  const name = str(form, "name");
  if (!name) return { error: "Name this ticket type." };

  const kind = event.layoutType === "seated" ? "seated" : "open";
  const rows = Math.max(0, num(form, "rows"));
  const cols = Math.max(0, num(form, "cols"));

  const values = {
    eventId,
    name,
    description: str(form, "description") || null,
    kind,
    priceMinor: rupeesToMinor(num(form, "price")),
    compareAtMinor: num(form, "compareAt") ? rupeesToMinor(num(form, "compareAt")) : null,
    capacity: kind === "seated" ? rows * cols : Math.max(0, num(form, "capacity")),
    admitsCount: Math.max(1, num(form, "admitsCount", 1)),
    minPerOrder: Math.max(1, num(form, "minPerOrder", 1)),
    maxPerOrder: Math.max(1, num(form, "maxPerOrder", 10)),
    color: str(form, "color") || "#3987e5",
    rows,
    cols,
    salesEndAt: ts(form, "salesEndAt"),
    active: form.get("active") ? 1 : 0,
    sortOrder: num(form, "sortOrder"),
  };

  const targetId = zoneId || id();
  if (zoneId) {
    await db.update(zones).set(values).where(eq(zones.id, zoneId));
  } else {
    await db.insert(zones).values({ id: targetId, ...values });
  }

  if (kind === "seated") await regenerateSeats(targetId, eventId, rows, cols, str(form, "rowStart") || "A");

  revalidatePath(`/admin/events/${eventId}/tickets`);
  return { ok: true as const, savedAt: Date.now() };
}

/**
 * Rebuilds a zone's seat grid. Seats already attached to a ticket are kept so
 * a layout tweak can never orphan someone's booking.
 */
async function regenerateSeats(
  zoneId: string,
  eventId: string,
  rows: number,
  cols: number,
  rowStart: string,
) {
  const existing = db.select().from(seats).where(eq(seats.zoneId, zoneId)).all();
  const sold = new Set(
    db
      .select({ seatId: tickets.seatId })
      .from(tickets)
      .where(eq(tickets.zoneId, zoneId))
      .all()
      .map((t) => t.seatId)
      .filter(Boolean) as string[],
  );

  const wanted = new Set<string>();
  for (let r = 0; r < rows; r++) {
    const rowLabel = String.fromCharCode(rowStart.charCodeAt(0) + r);
    for (let c = 1; c <= cols; c++) wanted.add(`${rowLabel}${c}`);
  }

  for (const seat of existing) {
    if (!wanted.has(seat.label) && !sold.has(seat.id)) {
      db.delete(seats).where(eq(seats.id, seat.id)).run();
    }
  }

  const have = new Set(existing.map((s) => s.label));
  for (let r = 0; r < rows; r++) {
    const rowLabel = String.fromCharCode(rowStart.charCodeAt(0) + r);
    for (let c = 1; c <= cols; c++) {
      const label = `${rowLabel}${c}`;
      if (have.has(label)) continue;
      db.insert(seats)
        .values({ id: id(), zoneId, eventId, rowLabel, seatNumber: c, label, x: c, y: r })
        .run();
    }
  }
}

export async function deleteZone(zoneId: string) {
  const zone = await db.select().from(zones).where(eq(zones.id, zoneId)).get();
  if (!zone) return;
  await ownedEvent(zone.eventId);
  const sold = await db
    .select()
    .from(tickets)
    .where(eq(tickets.zoneId, zoneId))
    .get();
  if (sold) throw new Error("This ticket type already has sales and can't be deleted.");
  await db.delete(zones).where(eq(zones.id, zoneId));
  revalidatePath(`/admin/events/${zone.eventId}/tickets`);
}

export async function toggleSeatBlock(seatId: string) {
  const seat = await db.select().from(seats).where(eq(seats.id, seatId)).get();
  if (!seat) return;
  await ownedEvent(seat.eventId);
  await db
    .update(seats)
    .set({ status: seat.status === "blocked" ? "available" : "blocked" })
    .where(eq(seats.id, seatId));
  revalidatePath(`/admin/events/${seat.eventId}/tickets`);
}

/* ------------------------------------------------------------------- codes */

export async function saveDiscountCode(_prev: unknown, form: FormData) {
  const eventId = str(form, "eventId");
  const { organizer } = await ownedEvent(eventId);
  const code = str(form, "code").toUpperCase();
  if (!code) return { error: "Enter a code." };

  const codeId = str(form, "codeId");
  const values = {
    organizerId: organizer.id,
    eventId: form.get("allEvents") ? null : eventId,
    code,
    label: str(form, "label") || null,
    type: str(form, "type") === "flat" ? "flat" : "percent",
    value:
      str(form, "type") === "flat"
        ? rupeesToMinor(num(form, "value"))
        : Math.min(100, Math.max(0, num(form, "value"))),
    maxDiscountMinor: num(form, "maxDiscount") ? rupeesToMinor(num(form, "maxDiscount")) : null,
    minTickets: Math.max(1, num(form, "minTickets", 1)),
    minOrderMinor: rupeesToMinor(num(form, "minOrder")),
    maxRedemptions: num(form, "maxRedemptions") || null,
    maxPerBuyer: Math.max(1, num(form, "maxPerBuyer", 1)),
    zoneId: str(form, "zoneId") || null,
    kind: str(form, "kind") === "special" ? "special" : "public",
    endsAt: ts(form, "endsAt"),
    active: form.get("active") ? 1 : 0,
  };

  try {
    if (codeId) {
      await db.update(discountCodes).set(values).where(eq(discountCodes.id, codeId));
    } else {
      await db.insert(discountCodes).values({ id: id(), ...values });
    }
  } catch {
    return { error: "You already have a code with that name." };
  }

  revalidatePath(`/admin/events/${eventId}/codes`);
  return { ok: true as const, savedAt: Date.now() };
}

export async function saveReferralCode(_prev: unknown, form: FormData) {
  const eventId = str(form, "eventId");
  const { organizer } = await ownedEvent(eventId);
  const code = str(form, "code").toUpperCase();
  const ownerName = str(form, "ownerName");
  if (!code || !ownerName) return { error: "A code and a promoter name are required." };

  const codeId = str(form, "codeId");
  const values = {
    organizerId: organizer.id,
    eventId,
    code,
    ownerName,
    ownerPhone: str(form, "ownerPhone") || null,
    discountType: str(form, "discountType") === "percent" ? "percent" : "flat",
    discountValue:
      str(form, "discountType") === "percent"
        ? num(form, "discountValue")
        : rupeesToMinor(num(form, "discountValue")),
    commissionType: str(form, "commissionType") === "flat" ? "flat" : "percent",
    commissionValue:
      str(form, "commissionType") === "flat"
        ? rupeesToMinor(num(form, "commissionValue"))
        : num(form, "commissionValue"),
    active: form.get("active") ? 1 : 0,
  };

  try {
    if (codeId) {
      await db.update(referralCodes).set(values).where(eq(referralCodes.id, codeId));
    } else {
      await db.insert(referralCodes).values({ id: id(), ...values });
    }
  } catch {
    return { error: "You already have a code with that name." };
  }

  revalidatePath(`/admin/events/${eventId}/codes`);
  return { ok: true as const, savedAt: Date.now() };
}

export async function deleteCode(kind: "discount" | "referral", codeId: string, eventId: string) {
  await ownedEvent(eventId);
  if (kind === "discount") {
    await db.delete(discountCodes).where(eq(discountCodes.id, codeId));
  } else {
    await db.delete(referralCodes).where(eq(referralCodes.id, codeId));
  }
  revalidatePath(`/admin/events/${eventId}/codes`);
}

/* ---------------------------------------------------------------- check-in */

export async function checkInTicket(eventId: string, rawCode: string) {
  await ownedEvent(eventId);
  const code = rawCode.trim().toUpperCase().replace(/\s+/g, "");
  if (!code) return { status: "error" as const, message: "Scan or type a code." };

  const ticket = await db
    .select()
    .from(tickets)
    .where(and(eq(tickets.code, code), eq(tickets.eventId, eventId)))
    .get();

  if (!ticket)
    return { status: "invalid" as const, message: "Not a valid pass for this event." };
  if (ticket.status === "cancelled")
    return { status: "invalid" as const, message: "This pass was cancelled.", ticket };
  if (ticket.status === "checked_in") {
    return {
      status: "duplicate" as const,
      message: `Already scanned at ${new Date((ticket.checkedInAt ?? 0) * 1000).toLocaleTimeString("en-IN")}.`,
      ticket,
    };
  }

  await db
    .update(tickets)
    .set({ status: "checked_in", checkedInAt: Math.floor(Date.now() / 1000), checkedInBy: "gate" })
    .where(eq(tickets.id, ticket.id));

  revalidatePath(`/admin/events/${eventId}/checkin`);
  return {
    status: "ok" as const,
    message: `Admit ${ticket.admitsCount}`,
    ticket: { ...ticket, status: "checked_in" as const },
  };
}

export async function undoCheckIn(ticketId: string, eventId: string) {
  await ownedEvent(eventId);
  await db
    .update(tickets)
    .set({ status: "valid", checkedInAt: null, checkedInBy: null })
    .where(eq(tickets.id, ticketId));
  revalidatePath(`/admin/events/${eventId}/checkin`);
}
