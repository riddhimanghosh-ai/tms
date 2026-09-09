"use server";

import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db, first } from "@/db";
import {
  discountCodes,
  eventDates,
  events,
  orderItems,
  orders,
  referralCodes,
  scans,

  seats,
  tickets,
  zones,
} from "@/db/schema";
import { requireOrganizer } from "@/lib/auth";
import { id, slugify } from "@/lib/ids";
import { rupeesToMinor } from "@/lib/money";
import { timeOnly } from "@/lib/datetime";
import { packHighlights, type Highlight, type HighlightIcon } from "@/lib/highlights";
import {
  ringSeatLabel,
  ringRowLabel,
  ringSizes,
  type RingConfig,
  type ZoneShape,
} from "@/lib/seat-layout";

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
  const event = await first(db
    .select()
    .from(events)
    .where(and(eq(events.id, eventId), eq(events.organizerId, organizer.id)))
    );
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
    await first(db
      .select()
      .from(events)
      .where(and(eq(events.organizerId, organizer.id), eq(events.slug, slug)))
      )
  ) {
    slug = `${slug}-${Math.floor(Math.random() * 900 + 100)}`;
  }

  const eventId = id();

  // One picker on the create screen chooses both the admission model and the
  // shape of the first block, so a new event is never left un-sellable.
  const template = str(form, "venueLayout") || "open";
  const seated = template !== "open";
  const shape: ZoneShape =
    template === "rings" ? "rings" : template === "arc" ? "arc" : "grid";

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
    layoutType: seated ? "seated" : "open",
    status: "draft",
    gatePin: String(Math.floor(1000 + Math.random() * 9000)),
  });

  const zoneId = id();
  const ring: RingConfig = {
    shape,
    ringCount: seated && shape !== "grid" ? 6 : 0,
    ringStartSeats: 12,
    ringSeatStep: 6,
    arcSpanDeg: shape === "arc" ? 200 : 360,
    arcStartDeg: shape === "arc" ? 260 : 0,
    innerHolePct: 35,
  };
  const rows = shape === "grid" && seated ? 8 : 0;
  const cols = shape === "grid" && seated ? 14 : 0;
  const seatTotal = seated
    ? shape === "grid"
      ? rows * cols
      : ringSizes(ring).reduce((n, x) => n + x, 0)
    : 500;

  await db.insert(zones).values({
    id: zoneId,
    eventId,
    name: seated ? "General" : "General Entry",
    kind: seated ? "seated" : "open",
    shape,
    priceMinor: 50000,
    capacity: seatTotal,
    color: "#3987e5",
    rows,
    cols,
    ringCount: ring.ringCount,
    ringStartSeats: ring.ringStartSeats,
    ringSeatStep: ring.ringSeatStep,
    arcSpanDeg: ring.arcSpanDeg,
    arcStartDeg: ring.arcStartDeg,
    innerHolePct: ring.innerHolePct,
  });

  if (seated) {
    await regenerateSeats({ zoneId, eventId, shape, rows, cols, rowStart: "A", ring });
  }

  // Even a one-off show gets a night row, so nothing downstream special-cases it.
  await db.insert(eventDates).values({
    id: id(),
    eventId,
    startsAt,
    endsAt: ts(form, "endsAt"),
    sortOrder: 0,
  });

  redirect(`/admin/events/${eventId}/setup?step=venue`);
}

/**
 * Patches only the fields a form actually submitted. The settings page and the
 * setup wizard's steps post different subsets, and a partial form must never
 * blank out what it doesn't show.
 */
export async function updateEvent(_prev: unknown, form: FormData) {
  const eventId = str(form, "eventId");
  const { event } = await ownedEvent(eventId);

  const has = (key: string) => form.has(key);
  const patch: Record<string, unknown> = {};

  if (has("title")) patch.title = str(form, "title") || event.title;
  if (has("tagline")) patch.tagline = str(form, "tagline") || null;
  if (has("description")) patch.description = str(form, "description") || null;
  if (has("venue")) patch.venue = str(form, "venue") || null;
  if (has("city")) patch.city = str(form, "city") || null;
  if (has("address")) patch.address = str(form, "address") || null;
  if (has("coverImageUrl")) patch.coverImageUrl = str(form, "coverImageUrl") || null;
  if (has("startsAt")) patch.startsAt = ts(form, "startsAt") ?? event.startsAt;
  if (has("endsAt")) patch.endsAt = ts(form, "endsAt");
  if (has("doorsOpenAt")) patch.doorsOpenAt = ts(form, "doorsOpenAt");
  if (has("bookingFeePct")) patch.bookingFeeBps = Math.round(num(form, "bookingFeePct") * 100);
  if (has("bookingFeeFlat")) patch.bookingFeeFlatMinor = rupeesToMinor(num(form, "bookingFeeFlat"));
  if (has("maxTicketsPerOrder"))
    patch.maxTicketsPerOrder = Math.max(1, num(form, "maxTicketsPerOrder", 10));
  if (has("terms")) patch.terms = str(form, "terms") || null;
  if (has("gatePin")) patch.gatePin = str(form, "gatePin") || event.gatePin;
  if (has("stageLabel")) patch.stageLabel = str(form, "stageLabel") || "STAGE";
  if (has("stagePosition")) patch.stagePosition = str(form, "stagePosition") || "auto";
  if (has("stageShape")) patch.stageShape = str(form, "stageShape") || "auto";

  // Checkboxes only appear in the payload when ticked, so they need a marker
  // field to tell "unticked" apart from "this form doesn't manage it".
  if (has("reentrySection")) {
    patch.allowReentry = form.get("allowReentry") ? 1 : 0;
    patch.reentryCooldownMins = Math.max(0, Math.min(240, num(form, "reentryCooldownMins")));
  }
  if (has("listingSection")) patch.listPublicly = form.get("listPublicly") ? 1 : 0;
  if (has("highlightsSection")) {
    patch.highlights = packHighlights(
      form.getAll("highlightIcon").map((icon, i) => ({
        icon: String(icon) as HighlightIcon,
        label: String(form.getAll("highlightLabel")[i] ?? "").trim(),
      })) as Highlight[],
    );
  }

  if (Object.keys(patch).length) {
    await db.update(events).set(patch).where(eq(events.id, eventId));
  }

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
  const rawShape = str(form, "shape");
  const shape: ZoneShape =
    rawShape === "rings" || rawShape === "arc" ? rawShape : "grid";

  const rows = Math.max(0, Math.min(60, num(form, "rows")));
  const cols = Math.max(0, Math.min(80, num(form, "cols")));

  const ring: RingConfig = {
    shape,
    ringCount: Math.max(0, Math.min(40, num(form, "ringCount"))),
    ringStartSeats: Math.max(1, Math.min(200, num(form, "ringStartSeats", 12))),
    ringSeatStep: Math.max(0, Math.min(60, num(form, "ringSeatStep", 6))),
    arcSpanDeg: Math.max(10, Math.min(360, num(form, "arcSpanDeg", 360))),
    arcStartDeg: ((num(form, "arcStartDeg") % 360) + 360) % 360,
    innerHolePct: Math.max(0, Math.min(90, num(form, "innerHolePct", 35))),
  };

  const seatTotal =
    kind !== "seated" ? 0 : shape === "grid" ? rows * cols : ringSizes(ring).reduce((n, x) => n + x, 0);

  if (kind === "seated" && seatTotal === 0)
    return { error: "This block has no seats yet — set its size below." };
  if (seatTotal > 4000)
    return { error: "That's over 4,000 seats in one block. Split it into a few blocks." };

  const values = {
    eventId,
    name,
    description: str(form, "description") || null,
    kind,
    shape,
    priceMinor: rupeesToMinor(num(form, "price")),
    compareAtMinor: num(form, "compareAt") ? rupeesToMinor(num(form, "compareAt")) : null,
    capacity: kind === "seated" ? seatTotal : Math.max(0, num(form, "capacity")),
    admitsCount: Math.max(1, num(form, "admitsCount", 1)),
    minPerOrder: Math.max(1, num(form, "minPerOrder", 1)),
    maxPerOrder: Math.max(1, num(form, "maxPerOrder", 10)),
    color: str(form, "color") || "#3987e5",
    allDates: form.get("allDates") ? 1 : 0,
    layerColors: packLayerList(form.getAll("layerColor")),
    layerNotes: packLayerList(form.getAll("layerNote")),
    rows,
    cols,
    ringCount: ring.ringCount,
    ringStartSeats: ring.ringStartSeats,
    ringSeatStep: ring.ringSeatStep,
    arcSpanDeg: ring.arcSpanDeg,
    arcStartDeg: ring.arcStartDeg,
    innerHolePct: ring.innerHolePct,
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

  if (kind === "seated") {
    await regenerateSeats({
      zoneId: targetId,
      eventId,
      shape,
      rows,
      cols,
      rowStart: str(form, "rowStart") || "A",
      ring,
    });
  }

  revalidatePath(`/admin/events/${eventId}/tickets`);
  return { ok: true as const, savedAt: Date.now() };
}

/**
 * Per-layer colours and notes arrive as repeated fields. Store them as JSON,
 * and store nothing at all when every entry is blank.
 */
function packLayerList(values: FormDataEntryValue[]) {
  const list = values.map((v) => String(v ?? "").trim());
  while (list.length && !list[list.length - 1]) list.pop();
  return list.some(Boolean) ? JSON.stringify(list) : null;
}

type SeatSpec = {
  label: string;
  rowLabel: string;
  seatNumber: number;
  x: number;
  y: number;
  ringIndex: number;
  posInRing: number;
  ringSize: number;
};

/** The seats a zone's current configuration should contain. */
function plannedSeats(args: {
  shape: ZoneShape;
  rows: number;
  cols: number;
  rowStart: string;
  ring: RingConfig;
}): SeatSpec[] {
  const { shape, rows, cols, rowStart, ring } = args;
  const out: SeatSpec[] = [];

  if (shape === "grid") {
    for (let r = 0; r < rows; r++) {
      const rowLabel = String.fromCharCode(rowStart.charCodeAt(0) + r);
      for (let c = 1; c <= cols; c++) {
        out.push({
          label: `${rowLabel}${c}`,
          rowLabel,
          seatNumber: c,
          x: c,
          y: r,
          ringIndex: 0,
          posInRing: 0,
          ringSize: 0,
        });
      }
    }
    return out;
  }

  ringSizes(ring).forEach((size, ringIndex) => {
    for (let pos = 0; pos < size; pos++) {
      out.push({
        label: ringSeatLabel(ringIndex, pos),
        rowLabel: ringRowLabel(ringIndex),
        seatNumber: pos + 1,
        x: pos,
        y: ringIndex,
        ringIndex,
        posInRing: pos,
        ringSize: size,
      });
    }
  });
  return out;
}

/**
 * Rebuilds a zone's seats to match its configuration. Seats already attached
 * to a ticket are kept, so changing a layout can never orphan a booking.
 */
async function regenerateSeats(args: {
  zoneId: string;
  eventId: string;
  shape: ZoneShape;
  rows: number;
  cols: number;
  rowStart: string;
  ring: RingConfig;
}) {
  const { zoneId, eventId } = args;
  const existing = await db.select().from(seats).where(eq(seats.zoneId, zoneId));
  const sold = new Set(
    (await db.select({ seatId: tickets.seatId }).from(tickets).where(eq(tickets.zoneId, zoneId)))
      .map((t) => t.seatId)
      .filter(Boolean) as string[],
  );

  const planned = plannedSeats(args);
  const wanted = new Map(planned.map((p) => [p.label, p]));
  const have = new Map(existing.map((s) => [s.label, s]));

  db.transaction(async (tx) => {
    for (const seat of existing) {
      if (!wanted.has(seat.label) && !sold.has(seat.id)) {
        await tx.delete(seats).where(eq(seats.id, seat.id));
      }
    }

    for (const spec of planned) {
      const current = have.get(spec.label);
      if (current) {
        // Geometry can shift when a layer is resized; keep the seat, move it.
        await tx.update(seats)
          .set({
            rowLabel: spec.rowLabel,
            seatNumber: spec.seatNumber,
            x: spec.x,
            y: spec.y,
            ringIndex: spec.ringIndex,
            posInRing: spec.posInRing,
            ringSize: spec.ringSize,
          })
          .where(eq(seats.id, current.id))
          ;
        continue;
      }
      await tx.insert(seats)
        .values({ id: id(), zoneId, eventId, status: "available", ...spec })
        ;
    }
  });
}

export async function deleteZone(zoneId: string) {
  const zone = await first(db.select().from(zones).where(eq(zones.id, zoneId)));
  if (!zone) return;
  await ownedEvent(zone.eventId);
  const sold = await first(db
    .select()
    .from(tickets)
    .where(eq(tickets.zoneId, zoneId))
    );
  if (sold) throw new Error("This ticket type already has sales and can't be deleted.");
  await db.delete(zones).where(eq(zones.id, zoneId));
  revalidatePath(`/admin/events/${zone.eventId}/tickets`);
}

export async function toggleSeatBlock(seatId: string) {
  const seat = await first(db.select().from(seats).where(eq(seats.id, seatId)));
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

export type ScanMode = "auto" | "in" | "out";

export type ScanResult = {
  status: "in" | "out" | "duplicate" | "invalid" | "error" | "cooldown";
  message: string;
  detail?: string;
  ticket?: {
    id: string;
    code: string;
    holderName: string | null;
    zoneName: string;
    seatLabel: string | null;
    admitsCount: number;
    showDateLabel: string | null;
    entryCount: number;
    inside: number;
  };
};

/**
 * One entry point for the gate.
 *
 * With re-entry off an event behaves as before: first scan admits, any later
 * scan is a duplicate. With it on the same QR toggles — scan on the way out,
 * scan again on the way back — so a pass is a membership for the night rather
 * than a one-shot token. `mode` lets a lane be dedicated to entry or exit;
 * "auto" reads the pass's current state.
 */
export async function scanTicket(
  eventId: string,
  rawCode: string,
  mode: ScanMode = "auto",
): Promise<ScanResult> {
  const { event } = await ownedEvent(eventId);
  const code = rawCode.trim().toUpperCase().replace(/\s+/g, "");
  if (!code) return { status: "error", message: "Scan or type a code." };

  const ticket = await first(db
    .select()
    .from(tickets)
    .where(and(eq(tickets.code, code), eq(tickets.eventId, eventId)))
    );

  if (!ticket)
    return { status: "invalid", message: "Not a valid pass", detail: "No such code for this event." };

  const summary = {
    id: ticket.id,
    code: ticket.code,
    holderName: ticket.holderName,
    zoneName: ticket.zoneName,
    seatLabel: ticket.seatLabel,
    admitsCount: ticket.admitsCount,
    showDateLabel: ticket.showDateLabel,
    entryCount: ticket.entryCount,
    inside: ticket.inside,
  };

  if (ticket.status === "cancelled")
    return { status: "invalid", message: "Pass cancelled", detail: "This booking was refunded.", ticket: summary };

  const now = Math.floor(Date.now() / 1000);
  const reentry = event.allowReentry === 1;

  // Without re-entry the old contract holds: one scan, then it's spent.
  if (!reentry) {
    if (ticket.inside || ticket.status === "checked_in") {
      return {
        status: "duplicate",
        message: "Already scanned",
        detail: `Entered at ${stampTime(ticket.checkedInAt)}.`,
        ticket: summary,
      };
    }
    await admit(ticket.id, eventId, ticket.showDateId, now, ticket.checkedInAt);
    revalidatePath(`/admin/events/${eventId}/checkin`);
    return {
      status: "in",
      message: `Admit ${ticket.admitsCount}`,
      ticket: { ...summary, inside: 1, entryCount: ticket.entryCount + 1 },
    };
  }

  const wantsOut = mode === "out" || (mode === "auto" && ticket.inside === 1);

  if (wantsOut) {
    if (!ticket.inside) {
      return {
        status: "duplicate",
        message: "Already outside",
        detail: "This pass isn't currently inside the venue.",
        ticket: summary,
      };
    }
    db.transaction(async (tx) => {
      await tx.update(tickets)
        .set({ inside: 0, lastScanAt: now })
        .where(eq(tickets.id, ticket.id))
        ;
      await tx.insert(scans)
        .values({ id: id(), ticketId: ticket.id, eventId, showDateId: ticket.showDateId, direction: "out", at: now, by: "gate" })
        ;
    });
    revalidatePath(`/admin/events/${eventId}/checkin`);
    return {
      status: "out",
      message: "Checked out",
      detail: "Scan again on the way back in.",
      ticket: { ...summary, inside: 0 },
    };
  }

  if (ticket.inside) {
    return {
      status: "duplicate",
      message: "Already inside",
      detail: `Entered at ${stampTime(ticket.lastScanAt ?? ticket.checkedInAt)}.`,
      ticket: summary,
    };
  }

  // A cooldown stops one pass being handed back over the fence immediately.
  if (event.reentryCooldownMins > 0 && ticket.lastScanAt) {
    const waited = now - ticket.lastScanAt;
    const needed = event.reentryCooldownMins * 60;
    if (waited < needed) {
      const mins = Math.ceil((needed - waited) / 60);
      return {
        status: "cooldown",
        message: "Too soon to re-enter",
        detail: `This pass left ${Math.floor(waited / 60)} min ago. Wait ${mins} more min.`,
        ticket: summary,
      };
    }
  }

  await admit(ticket.id, eventId, ticket.showDateId, now, ticket.checkedInAt);
  revalidatePath(`/admin/events/${eventId}/checkin`);
  return {
    status: "in",
    message: ticket.entryCount > 0 ? "Welcome back" : `Admit ${ticket.admitsCount}`,
    detail: ticket.entryCount > 0 ? `Re-entry #${ticket.entryCount + 1}` : undefined,
    ticket: { ...summary, inside: 1, entryCount: ticket.entryCount + 1 },
  };
}

function stampTime(ts: number | null) {
  return ts ? timeOnly(ts) : "—";
}

async function admit(
  ticketId: string,
  eventId: string,
  showDateId: string | null,
  now: number,
  firstEntry: number | null,
) {
  db.transaction(async (tx) => {
    await tx.update(tickets)
      .set({
        status: "checked_in",
        inside: 1,
        checkedInAt: firstEntry ?? now,
        checkedInBy: "gate",
        lastScanAt: now,
        entryCount: sql`${tickets.entryCount} + 1`,
      })
      .where(eq(tickets.id, ticketId))
      ;
    await tx.insert(scans)
      .values({ id: id(), ticketId, eventId, showDateId, direction: "in", at: now, by: "gate" })
      ;
  });
}

/** Reverses the most recent scan — the fix for a mis-scan at a busy gate. */
export async function undoLastScan(ticketId: string, eventId: string) {
  await ownedEvent(eventId);

  const history = await db
    .select()
    .from(scans)
    .where(eq(scans.ticketId, ticketId))
    .orderBy(desc(scans.at))
    ;

  const last = history[0];
  const previous = history[1];

  db.transaction(async (tx) => {
    if (last) tx.delete(scans).where(eq(scans.id, last.id));

    const nowInside = previous ? (previous.direction === "in" ? 1 : 0) : 0;
    await tx.update(tickets)
      .set({
        inside: nowInside,
        status: previous ? "checked_in" : "valid",
        checkedInAt: previous ? undefined : null,
        checkedInBy: previous ? undefined : null,
        lastScanAt: previous?.at ?? null,
        entryCount: sql`greatest(0, ${tickets.entryCount} - ${last?.direction === "in" ? 1 : 0})`,
      })
      .where(eq(tickets.id, ticketId))
      ;
  });

  revalidatePath(`/admin/events/${eventId}/checkin`);
}

/* --------------------------------------------------------------- duplicate */

/**
 * Clones an event with its ticket types, seat layouts and codes — organisers
 * run the same show every season and shouldn't rebuild it each time. Orders,
 * tickets and sales counters are deliberately left behind.
 */
export async function duplicateEvent(eventId: string) {
  const { organizer, event } = await ownedEvent(eventId);

  let slug = `${event.slug}-copy`;
  while (
    await first(db
      .select()
      .from(events)
      .where(and(eq(events.organizerId, organizer.id), eq(events.slug, slug)))
      )
  ) {
    slug = `${event.slug}-copy-${Math.floor(Math.random() * 900 + 100)}`;
  }

  const newId = id();
  const sourceZones = await db.select().from(zones).where(eq(zones.eventId, eventId));
  const sourceDiscounts = await db
    .select()
    .from(discountCodes)
    .where(eq(discountCodes.eventId, eventId))
    ;
  const sourceReferrals = await db
    .select()
    .from(referralCodes)
    .where(eq(referralCodes.eventId, eventId))
    ;

  db.transaction(async (tx) => {
    await tx.insert(events)
      .values({
        ...event,
        id: newId,
        slug,
        title: `${event.title} (copy)`,
        status: "draft",
        createdAt: Math.floor(Date.now() / 1000),
      })
      ;

    const zoneIdMap = new Map<string, string>();
    for (const zone of sourceZones) {
      const zoneId = id();
      zoneIdMap.set(zone.id, zoneId);
      await tx.insert(zones).values({ ...zone, id: zoneId, eventId: newId });
    }

    for (const code of sourceDiscounts) {
      await tx.insert(discountCodes)
        .values({
          ...code,
          id: id(),
          eventId: newId,
          // A copy starts its redemption count fresh.
          usedCount: 0,
          zoneId: code.zoneId ? (zoneIdMap.get(code.zoneId) ?? null) : null,
          code: `${code.code}-2`,
        })
        ;
    }

    for (const code of sourceReferrals) {
      await tx.insert(referralCodes)
        .values({ ...code, id: id(), eventId: newId, clicks: 0, code: `${code.code}-2` })
        ;
    }
  });

  // Seats are regenerated from each zone's own configuration.
  for (const zone of sourceZones) {
    if (zone.kind !== "seated") continue;
    const copied = await first(db
      .select()
      .from(zones)
      .where(and(eq(zones.eventId, newId), eq(zones.name, zone.name)))
      );
    if (!copied) continue;
    await regenerateSeats({
      zoneId: copied.id,
      eventId: newId,
      shape: zone.shape as ZoneShape,
      rows: zone.rows,
      cols: zone.cols,
      rowStart: "A",
      ring: {
        shape: zone.shape as ZoneShape,
        ringCount: zone.ringCount,
        ringStartSeats: zone.ringStartSeats,
        ringSeatStep: zone.ringSeatStep,
        arcSpanDeg: zone.arcSpanDeg,
        arcStartDeg: zone.arcStartDeg,
        innerHolePct: zone.innerHolePct,
      },
    });
  }

  redirect(`/admin/events/${newId}/settings`);
}

/* ------------------------------------------------------------ seat editing */

/** Block or unblock a whole row or ring in one action. */
export async function setSeatsBlocked(
  eventId: string,
  seatIds: string[],
  blocked: boolean,
) {
  await ownedEvent(eventId);
  if (!seatIds.length) return { changed: 0 };

  const sold = new Set(
    (
      await db
        .select({ seatId: tickets.seatId })
        .from(tickets)
        .where(and(eq(tickets.eventId, eventId), inArray(tickets.seatId, seatIds)))
        
    )
      .map((t) => t.seatId)
      .filter(Boolean) as string[],
  );

  const editable = seatIds.filter((sid) => !sold.has(sid));
  if (editable.length) {
    await db
      .update(seats)
      .set({ status: blocked ? "blocked" : "available" })
      .where(and(eq(seats.eventId, eventId), inArray(seats.id, editable)));
  }

  revalidatePath(`/admin/events/${eventId}/tickets`);
  return { changed: editable.length, skipped: seatIds.length - editable.length };
}

/* ---------------------------------------------------------------- orders */

/**
 * Cancels a paid order: passes stop scanning and the seats or capacity return
 * to the pool immediately, since availability counts non-cancelled tickets.
 */
export async function cancelOrder(orderId: string, reason: "refunded" | "cancelled") {
  const order = await first(db.select().from(orders).where(eq(orders.id, orderId)));
  if (!order) throw new Error("Order not found.");
  await ownedEvent(order.eventId);

  db.transaction(async (tx) => {
    await tx.update(tickets).set({ status: "cancelled" }).where(eq(tickets.orderId, orderId));
    await tx.update(orders).set({ status: reason }).where(eq(orders.id, orderId));

    // Give a limited-use code its redemption back.
    if (order.discountCodeId && order.status === "paid") {
      await tx.update(discountCodes)
        .set({ usedCount: sql`greatest(0, ${discountCodes.usedCount} - 1)` })
        .where(eq(discountCodes.id, order.discountCodeId))
        ;
    }
  });

  revalidatePath(`/admin/events/${order.eventId}`, "layout");
  return { ok: true as const };
}

/** Full detail for the order drawer — items, passes and their entry state. */
export async function orderDetail(orderId: string) {
  const order = await first(db.select().from(orders).where(eq(orders.id, orderId)));
  if (!order) throw new Error("Order not found.");
  await ownedEvent(order.eventId);

  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, orderId));
  const passes = await db.select().from(tickets).where(eq(tickets.orderId, orderId));

  return {
    order,
    items: items.map((i) => ({
      zoneName: i.zoneName,
      qty: i.qty,
      unitPriceMinor: i.unitPriceMinor,
    })),
    passes: passes.map((t) => ({
      id: t.id,
      code: t.code,
      zoneName: t.zoneName,
      seatLabel: t.seatLabel,
      status: t.status,
      checkedInAt: t.checkedInAt,
      admitsCount: t.admitsCount,
    })),
  };
}

/* ------------------------------------------------------------------ nights */

/**
 * Multi-night events are the norm here — a Navratri run is nine nights sold
 * separately. Inventory, seats and passes are all scoped to the night, so a
 * single-night event simply has one row and the buyer never sees a picker.
 */
export async function addEventDate(_prev: unknown, form: FormData) {
  const eventId = str(form, "eventId");
  await ownedEvent(eventId);

  const startsAt = ts(form, "startsAt");
  if (!startsAt) return { error: "Pick a date and time for this night." };

  const existing = await db
    .select()
    .from(eventDates)
    .where(eq(eventDates.eventId, eventId))
    ;

  if (existing.some((n) => n.startsAt === startsAt))
    return { error: "That night is already on the list." };

  await db.insert(eventDates).values({
    id: id(),
    eventId,
    startsAt,
    endsAt: ts(form, "endsAt"),
    label: str(form, "label") || null,
    note: str(form, "note") || null,
    sortOrder: existing.length,
  });

  revalidatePath(`/admin/events/${eventId}/dates`);
  return { ok: true as const, savedAt: Date.now() };
}

/** Adds a run of consecutive nights in one go — nine taps become one. */
export async function addNightRun(_prev: unknown, form: FormData) {
  const eventId = str(form, "eventId");
  const { event } = await ownedEvent(eventId);

  const startsAt = ts(form, "startsAt") ?? event.startsAt;
  const count = Math.max(1, Math.min(60, num(form, "count", 9)));
  const prefix = str(form, "prefix") || "Night";

  const existing = await db
    .select()
    .from(eventDates)
    .where(eq(eventDates.eventId, eventId))
    ;
  const taken = new Set(existing.map((n) => n.startsAt));

  const rows = [];
  for (let i = 0; i < count; i++) {
    const at = startsAt + i * 86400;
    if (taken.has(at)) continue;
    rows.push({
      id: id(),
      eventId,
      startsAt: at,
      label: `${prefix} ${existing.length + rows.length + 1}`,
      sortOrder: existing.length + rows.length,
    });
  }

  if (rows.length) await db.insert(eventDates).values(rows);

  revalidatePath(`/admin/events/${eventId}/dates`);
  return { ok: true as const, added: rows.length, savedAt: Date.now() };
}

export async function updateEventDate(_prev: unknown, form: FormData) {
  const eventId = str(form, "eventId");
  await ownedEvent(eventId);
  const dateId = str(form, "dateId");
  const startsAt = ts(form, "startsAt");
  if (!dateId || !startsAt) return { error: "Pick a date and time for this night." };

  await db
    .update(eventDates)
    .set({
      startsAt,
      endsAt: ts(form, "endsAt"),
      label: str(form, "label") || null,
      note: str(form, "note") || null,
      active: form.get("active") ? 1 : 0,
    })
    .where(and(eq(eventDates.id, dateId), eq(eventDates.eventId, eventId)));

  revalidatePath(`/admin/events/${eventId}/dates`);
  return { ok: true as const, savedAt: Date.now() };
}

export async function deleteEventDate(dateId: string, eventId: string) {
  await ownedEvent(eventId);

  const soldOnNight = await first(db
    .select({ n: sql<number>`count(*)` })
    .from(tickets)
    .where(and(eq(tickets.eventId, eventId), eq(tickets.showDateId, dateId)))
    );

  if (Number(soldOnNight?.n ?? 0) > 0)
    throw new Error("Passes have been sold for this night — pause it instead of deleting it.");

  await db.delete(eventDates).where(eq(eventDates.id, dateId));
  revalidatePath(`/admin/events/${eventId}/dates`);
}

export async function setEventDateActive(dateId: string, eventId: string, active: boolean) {
  await ownedEvent(eventId);
  await db
    .update(eventDates)
    .set({ active: active ? 1 : 0 })
    .where(and(eq(eventDates.id, dateId), eq(eventDates.eventId, eventId)));
  revalidatePath(`/admin/events/${eventId}/dates`);
}
