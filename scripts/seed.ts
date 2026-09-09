/**
 * Demo data: one organiser, three events (a nine-night open ground, a seated
 * hall, a ringed arena), codes, and ~3 weeks of backdated orders so the
 * analytics screens have real curves.
 *
 * Rows are accumulated and inserted in chunks. Postgres is over the network,
 * so a per-row insert loop turns a two-second seed into a twenty-minute one.
 */

import { db, pool } from "../src/db";
import {
  discountCodes,
  eventDates,
  events,
  orderItems,
  orders,
  organizers,
  pageViews,
  referralCodes,
  scans,
  seats,
  tickets,
  zones,
} from "../src/db/schema";
import { hashPassword } from "../src/lib/auth";
import { id, orderPublicId, ticketCode } from "../src/lib/ids";
import { ringSeatLabel, ringRowLabel, ringSizes } from "../src/lib/seat-layout";

const DAY = 86400;
const now = Math.floor(Date.now() / 1000);

/** Postgres caps a statement at 65535 parameters; 400 rows stays well clear. */
async function insertMany<T extends Record<string, unknown>>(
  table: Parameters<typeof db.insert>[0],
  rows: T[],
  chunk = 400,
) {
  for (let i = 0; i < rows.length; i += chunk) {
    await db.insert(table).values(rows.slice(i, i + chunk) as never);
  }
}

const firstNames = ["Aarav","Diya","Kabir","Meera","Rohan","Ananya","Vivaan","Isha","Arjun","Nisha","Dev","Riya","Karan","Sneha","Yash","Pooja","Manav","Tara","Neel","Jiya"];
const lastNames = ["Patel","Shah","Desai","Mehta","Joshi","Trivedi","Chauhan","Parmar","Rana","Bhatt"];
const rand = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];

async function main() {
  for (const t of [scans, pageViews, tickets, orderItems, orders, referralCodes, discountCodes, seats, zones, eventDates, events, organizers]) {
    await db.delete(t);
  }

  const orgId = id();
  await db.insert(organizers).values({
    id: orgId,
    slug: "rhythm-events",
    name: "Rhythm Events, Ahmedabad",
    email: "organiser@demo.in",
    passwordHash: hashPassword("demo1234"),
    phone: "+919876543210",
    supportPhone: "+919876543210",
    brandColor: "#e11d48",
  });

  const zoneRows: (typeof zones.$inferInsert)[] = [];
  const seatRows: (typeof seats.$inferInsert)[] = [];
  const nightRows: (typeof eventDates.$inferInsert)[] = [];

  /* -------------------------------------------------------------- event 1 */
  const garbaId = id();
  await db.insert(events).values({
    id: garbaId,
    organizerId: orgId,
    slug: "navratri-nights-2026",
    title: "Navratri Nights 2026",
    tagline: "9 nights. Live dhol. Ahmedabad's biggest ground.",
    description:
      "Nine nights of non-stop Garba with live orchestra, traditional food stalls and a 40,000 sq ft open ground. Dress code: traditional.",
    venue: "Sardar Patel Ground",
    city: "Ahmedabad",
    address: "Sardar Patel Ground, S.G. Highway, Ahmedabad, Gujarat",
    startsAt: now + 21 * DAY,
    endsAt: now + 30 * DAY,
    doorsOpenAt: now + 21 * DAY - 3600,
    layoutType: "open",
    status: "published",
    bookingFeeBps: 250,
    bookingFeeFlatMinor: 1000,
    maxTicketsPerOrder: 10,
    gatePin: "4321",
    allowReentry: 1,
    reentryCooldownMins: 10,
    coverImageUrl:
      "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=1600&q=70",
    highlights: JSON.stringify([
      { icon: "music", label: "Live Music" },
      { icon: "dance", label: "Traditional Vibes" },
      { icon: "star", label: "Special Artists" },
      { icon: "food", label: "Food Stalls" },
    ]),
    stageLabel: "DHOL",
    stagePosition: "centre",
    stageShape: "circle",
    terms: "Entry only with a valid QR pass. No refunds. Right of admission reserved.",
  });

  const garbaNightIds: string[] = [];
  for (let n = 0; n < 9; n++) {
    const nid = id();
    garbaNightIds.push(nid);
    nightRows.push({
      id: nid,
      eventId: garbaId,
      startsAt: now + (21 + n) * DAY,
      label: n === 8 ? "Night 9 — Finale" : `Night ${n + 1}`,
      note: n === 0 ? "Opening night — live orchestra from 8 pm" : null,
      sortOrder: n,
    });
  }

  const garbaZoneIds: string[] = [];
  [
    { name: "Season Pass — 9 Nights", price: 599900, cap: 500, admits: 1, color: "#a21caf", desc: "All nine nights, priority lane entry." },
    { name: "VIP Couple Entry", price: 249900, cap: 400, admits: 2, color: "#e11d48", desc: "Front arena access for two, includes dinner coupons." },
    { name: "Gold Entry", price: 129900, cap: 1500, admits: 1, color: "#f59e0b", desc: "Main arena, single entry." },
    { name: "General Entry", price: 59900, cap: 3000, admits: 1, color: "#0ea5e9", desc: "Open ground access." },
    { name: "Kids (under 10)", price: 19900, cap: 600, admits: 1, color: "#22c55e", desc: "Must be accompanied by an adult." },
  ].forEach((z, i) => {
    const zid = id();
    garbaZoneIds.push(zid);
    zoneRows.push({
      id: zid, eventId: garbaId, name: z.name, description: z.desc, kind: "open",
      priceMinor: z.price, compareAtMinor: i === 0 ? 799900 : null, capacity: z.cap,
      admitsCount: z.admits, allDates: i === 0 ? 1 : 0, color: z.color, maxPerOrder: 10, sortOrder: i,
    });
  });

  /* -------------------------------------------------------------- event 2 */
  const concertId = id();
  await db.insert(events).values({
    id: concertId,
    organizerId: orgId,
    slug: "dandiya-finale-live",
    title: "Dandiya Finale — Live in Concert",
    tagline: "One night. Indoor auditorium. Reserved seating.",
    description: "The closing night moves indoors. Every seat reserved.",
    venue: "Tagore Hall",
    city: "Ahmedabad",
    startsAt: now + 34 * DAY,
    layoutType: "seated",
    status: "published",
    bookingFeeBps: 300,
    maxTicketsPerOrder: 6,
    gatePin: "1122",
    highlights: JSON.stringify([
      { icon: "star", label: "Reserved Seating" },
      { icon: "ac", label: "Air Conditioned" },
      { icon: "music", label: "Live Orchestra" },
    ]),
    stageLabel: "STAGE",
    stagePosition: "top",
    stageShape: "curve",
  });
  const concertNightId = id();
  nightRows.push({ id: concertNightId, eventId: concertId, startsAt: now + 34 * DAY, sortOrder: 0 });

  const concertZoneIds: string[] = [];
  [
    { name: "Platinum", price: 349900, rows: 4, cols: 14, color: "#a21caf", start: "A" },
    { name: "Gold", price: 199900, rows: 5, cols: 16, color: "#f59e0b", start: "E" },
    { name: "Silver", price: 99900, rows: 6, cols: 18, color: "#0ea5e9", start: "J" },
  ].forEach((z, zi) => {
    const zid = id();
    concertZoneIds.push(zid);
    zoneRows.push({
      id: zid, eventId: concertId, name: z.name, kind: "seated", shape: "grid",
      priceMinor: z.price, capacity: z.rows * z.cols, color: z.color,
      rows: z.rows, cols: z.cols, maxPerOrder: 6, sortOrder: zi,
    });
    for (let r = 0; r < z.rows; r++) {
      const rowLabel = String.fromCharCode(z.start.charCodeAt(0) + r);
      for (let c = 1; c <= z.cols; c++) {
        seatRows.push({
          id: id(), zoneId: zid, eventId: concertId, rowLabel, seatNumber: c,
          label: `${rowLabel}${c}`, x: c, y: r,
        });
      }
    }
  });

  /* -------------------------------------------------------------- event 3 */
  const akhadaId = id();
  await db.insert(events).values({
    id: akhadaId,
    organizerId: orgId,
    slug: "raas-in-the-round",
    title: "Raas in the Round",
    tagline: "Centre stage. Rings of dancers. One unbroken circle.",
    description:
      "A single circular arena with the dhol at the centre and dancers in concentric rings. Inner rings are closest to the drums; outer rings have the most room to move.",
    venue: "Riverfront Arena",
    city: "Ahmedabad",
    address: "Sabarmati Riverfront, Ahmedabad, Gujarat",
    startsAt: now + 27 * DAY,
    layoutType: "seated",
    status: "published",
    bookingFeeBps: 200,
    maxTicketsPerOrder: 8,
    gatePin: "7788",
    allowReentry: 1,
    highlights: JSON.stringify([
      { icon: "dance", label: "In The Round" },
      { icon: "music", label: "Centre Dhol" },
      { icon: "food", label: "Food Stalls" },
      { icon: "family", label: "Family Friendly" },
    ]),
    stageLabel: "DHOL",
    stagePosition: "centre",
    stageShape: "circle",
    terms: "Traditional dress required. Entry only with a valid QR pass.",
  });

  const akhadaNightIds: string[] = [];
  for (let n = 0; n < 3; n++) {
    const nid = id();
    akhadaNightIds.push(nid);
    nightRows.push({ id: nid, eventId: akhadaId, startsAt: now + (27 + n) * DAY, label: `Night ${n + 1}`, sortOrder: n });
  }

  const akhadaZoneIds: string[] = [];
  [
    { name: "Inner Circle", price: 449900, ringCount: 3, start: 14, step: 8, hole: 22, color: "#d55181",
      layerColors: ["#e66767", "#d55181", "#9085e9"],
      layerNotes: ["Right at the dhol — loudest, fastest ring", "Second ring, still shoulder to shoulder with the drums", "Last of the inner ring, easier to step out of"] },
    { name: "Middle Rings", price: 249900, ringCount: 4, start: 44, step: 10, hole: 46, color: "#c98500",
      layerColors: ["#c98500", "#d95926", "", ""],
      layerNotes: ["Best balance of sound and space", "Room to turn properly", "", ""] },
    { name: "Outer Rings", price: 129900, ringCount: 4, start: 90, step: 14, hole: 70, color: "#199e70",
      layerColors: [], layerNotes: ["Widest circle — easiest for beginners"] },
  ].forEach((z, zi) => {
    const zid = id();
    akhadaZoneIds.push(zid);
    const cfg = { shape: "rings" as const, ringCount: z.ringCount, ringStartSeats: z.start, ringSeatStep: z.step, arcSpanDeg: 360, arcStartDeg: 0, innerHolePct: z.hole };
    const sizes = ringSizes(cfg);
    zoneRows.push({
      id: zid, eventId: akhadaId, name: z.name, kind: "seated", shape: "rings",
      priceMinor: z.price, capacity: sizes.reduce((n, x) => n + x, 0), color: z.color, maxPerOrder: 8,
      layerColors: z.layerColors.some(Boolean) ? JSON.stringify(z.layerColors) : null,
      layerNotes: z.layerNotes.some(Boolean) ? JSON.stringify(z.layerNotes) : null,
      ringCount: cfg.ringCount, ringStartSeats: cfg.ringStartSeats, ringSeatStep: cfg.ringSeatStep,
      arcSpanDeg: cfg.arcSpanDeg, arcStartDeg: cfg.arcStartDeg, innerHolePct: cfg.innerHolePct, sortOrder: zi,
    });
    sizes.forEach((size, ringIndex) => {
      for (let pos = 0; pos < size; pos++) {
        seatRows.push({
          id: id(), zoneId: zid, eventId: akhadaId, rowLabel: ringRowLabel(ringIndex),
          seatNumber: pos + 1, label: ringSeatLabel(ringIndex, pos),
          x: pos, y: ringIndex, ringIndex, posInRing: pos, ringSize: size,
        });
      }
    });
  });

  await insertMany(eventDates, nightRows);
  await insertMany(zones, zoneRows);
  await insertMany(seats, seatRows);

  /* ---------------------------------------------------------------- codes */
  const discountIds: Record<string, string> = {};
  const discountRows = [
    { code: "EARLYBIRD", label: "Early bird 20%", type: "percent", value: 20, max: 500, cap: 100000, kind: "public", eventId: garbaId },
    { code: "GARBA100", label: "₹100 off", type: "flat", value: 10000, max: null, cap: null, kind: "public", eventId: garbaId },
    { code: "SPONSOR", label: "Sponsor comp — 100%", type: "percent", value: 100, max: 50, cap: null, kind: "special", eventId: null },
    { code: "GROUP10", label: "10% off groups of 5+", type: "percent", value: 10, max: null, cap: null, kind: "public", eventId: null, minTickets: 5 },
  ].map((c) => {
    const cid = id();
    discountIds[c.code] = cid;
    return {
      id: cid, organizerId: orgId, eventId: c.eventId, code: c.code, label: c.label,
      type: c.type, value: c.value, maxDiscountMinor: c.cap, maxRedemptions: c.max,
      minTickets: (c as { minTickets?: number }).minTickets ?? 1,
      maxPerBuyer: c.kind === "special" ? 5 : 1, kind: c.kind, endsAt: now + 20 * DAY,
    };
  });
  await insertMany(discountCodes, discountRows);

  const referralIds: Record<string, string> = {};
  const referralRows = [
    { code: "RAHUL", name: "Rahul Shah", phone: "+919820011223" },
    { code: "PRIYA", name: "Priya Desai", phone: "+919820044556" },
    { code: "DJKARAN", name: "DJ Karan", phone: "+919820077889" },
  ].map((r) => {
    const rid = id();
    referralIds[r.code] = rid;
    return {
      id: rid, organizerId: orgId, eventId: garbaId, code: r.code, ownerName: r.name,
      ownerPhone: r.phone, discountType: "flat", discountValue: 5000,
      commissionType: "percent", commissionValue: 10,
      clicks: 40 + Math.floor(Math.random() * 400),
    };
  });
  await insertMany(referralCodes, referralRows);

  /* --------------------------------------------------- backdated orders */
  const zoneById = new Map(zoneRows.map((z) => [z.id as string, z]));
  const eventById = new Map([
    [garbaId, { bookingFeeBps: 250, bookingFeeFlatMinor: 1000 }],
    [concertId, { bookingFeeBps: 300, bookingFeeFlatMinor: 0 }],
    [akhadaId, { bookingFeeBps: 200, bookingFeeFlatMinor: 0 }],
  ]);
  const nightById = new Map(nightRows.map((n) => [n.id as string, n]));
  // Keyed by zone + night: the same seat is sellable on every night.
  const freeSeats = new Map<string, (typeof seats.$inferInsert)[]>();

  const orderBatch: (typeof orders.$inferInsert)[] = [];
  const itemBatch: (typeof orderItems.$inferInsert)[] = [];
  const ticketBatch: (typeof tickets.$inferInsert)[] = [];
  const viewBatch: (typeof pageViews.$inferInsert)[] = [];

  function makeOrder(eventId: string, zoneIds: string[], daysAgo: number, seated: boolean, nightIds: string[]) {
    const zoneId = rand(zoneIds);
    const zone = zoneById.get(zoneId)!;
    const nightId = zone.allDates ? null : nightIds.length ? rand(nightIds) : null;
    const night = nightId ? nightById.get(nightId) : null;

    const qty = seated ? 1 + Math.floor(Math.random() * 3) : 1 + Math.floor(Math.random() * 4);
    const buyer = `${rand(firstNames)} ${rand(lastNames)}`;
    const phone = `+9198${Math.floor(10000000 + Math.random() * 89999999)}`;
    const createdAt = now - daysAgo * DAY - Math.floor(Math.random() * DAY);

    const price = zone.priceMinor ?? 0;
    const subtotal = price * qty;
    const useDiscount = Math.random() < 0.22;
    const useReferral = !useDiscount && Math.random() < 0.25;
    const discountCodeId = useDiscount ? discountIds.EARLYBIRD : null;
    const referralCodeId = useReferral ? referralIds[rand(Object.keys(referralIds))] : null;
    const discount = useDiscount ? Math.min(Math.round(subtotal * 0.2), 100000) : useReferral ? 5000 : 0;
    const ev = eventById.get(eventId)!;
    const fee = Math.round(((subtotal - discount) * ev.bookingFeeBps) / 10000) + ev.bookingFeeFlatMinor * qty;
    const total = subtotal - discount + fee;
    const commission = referralCodeId ? Math.round((subtotal - discount) * 0.1) : 0;

    const oid = id();
    orderBatch.push({
      id: oid, publicId: orderPublicId(), eventId, organizerId: orgId,
      showDateId: nightId, showDateLabel: night?.label ?? null,
      buyerName: buyer, buyerPhone: phone,
      buyerEmail: `${buyer.split(" ")[0].toLowerCase()}@example.in`,
      subtotalMinor: subtotal, discountMinor: discount, feeMinor: fee, totalMinor: total,
      commissionMinor: commission, discountCodeId, referralCodeId, ticketCount: qty,
      status: "paid", paymentProvider: "mock", paymentRef: `mock_${oid.slice(0, 8)}`,
      channel: rand(["web", "web", "embed", "whatsapp"]), createdAt, paidAt: createdAt + 120,
    });
    itemBatch.push({ id: id(), orderId: oid, zoneId, zoneName: zone.name as string, qty, unitPriceMinor: price });

    for (let i = 0; i < qty; i++) {
      let seatId: string | null = null;
      let seatLabel: string | null = null;
      if (seated) {
        const key = `${zoneId}:${nightId ?? "single"}`;
        if (!freeSeats.has(key)) freeSeats.set(key, seatRows.filter((s) => s.zoneId === zoneId).slice());
        const seat = freeSeats.get(key)!.pop();
        if (!seat) break;
        seatId = seat.id as string;
        seatLabel = seat.label as string;
      }
      ticketBatch.push({
        id: id(), code: ticketCode(), orderId: oid, eventId, zoneId,
        zoneName: zone.name as string, seatId, seatLabel,
        showDateId: nightId, showDateLabel: night?.label ?? null,
        showDateStartsAt: night?.startsAt ?? null,
        holderName: buyer, admitsCount: zone.admitsCount ?? 1, status: "valid", createdAt,
      });
    }
  }

  // Sales ramp up as the event approaches — the shape organisers actually see.
  for (let daysAgo = 21; daysAgo >= 0; daysAgo--) {
    const heat = Math.round(2 + (21 - daysAgo) * 0.9 + Math.random() * 4);
    for (let i = 0; i < heat; i++) makeOrder(garbaId, garbaZoneIds, daysAgo, false, garbaNightIds);
    for (let i = 0; i < Math.round(heat / 3); i++) makeOrder(concertId, concertZoneIds, daysAgo, true, [concertNightId]);
    for (let i = 0; i < Math.round(heat / 4); i++) makeOrder(akhadaId, akhadaZoneIds, daysAgo, true, akhadaNightIds);

    for (let v = 0; v < heat * 7; v++) {
      viewBatch.push({
        id: id(),
        eventId: Math.random() < 0.6 ? garbaId : Math.random() < 0.5 ? concertId : akhadaId,
        source: rand(["web", "embed", "whatsapp"]),
        createdAt: now - daysAgo * DAY - Math.floor(Math.random() * DAY),
      });
    }
  }

  await insertMany(orders, orderBatch);
  await insertMany(orderItems, itemBatch);

  // Put a realistic slice of the crowd through the gate, before the insert so
  // the tickets and their scan rows go in as two batches, not two per person.
  const scanBatch: (typeof scans.$inferInsert)[] = [];
  for (const t of ticketBatch) {
    if (Math.random() > 0.28) continue;
    const enteredAt = now - Math.floor(Math.random() * 3600);
    const steppedOut = Math.random() < 0.18;
    Object.assign(t, {
      status: "checked_in",
      inside: steppedOut ? 0 : 1,
      checkedInAt: enteredAt,
      checkedInBy: "gate",
      lastScanAt: steppedOut ? enteredAt + 900 : enteredAt,
      entryCount: 1,
    });
    scanBatch.push({ id: id(), ticketId: t.id as string, eventId: t.eventId as string, showDateId: t.showDateId ?? null, direction: "in", at: enteredAt, by: "gate" });
    if (steppedOut) {
      scanBatch.push({ id: id(), ticketId: t.id as string, eventId: t.eventId as string, showDateId: t.showDateId ?? null, direction: "out", at: enteredAt + 900, by: "gate" });
    }
  }

  await insertMany(tickets, ticketBatch);
  await insertMany(scans, scanBatch);
  await insertMany(pageViews, viewBatch);

  console.log("Seeded:", {
    events: 3,
    nights: nightRows.length,
    zones: zoneRows.length,
    seats: seatRows.length,
    orders: orderBatch.length,
    tickets: ticketBatch.length,
    scans: scanBatch.length,
  });
  console.log("Login → organiser@demo.in / demo1234");
  await pool.end();
}

main().catch(async (err) => {
  console.error(err);
  await pool.end();
  process.exit(1);
});
