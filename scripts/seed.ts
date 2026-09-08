/**
 * Demo data: one organizer, two live events (open ground + seated), codes,
 * and ~3 weeks of backdated orders so the analytics screens have real curves.
 */
import { eq } from "drizzle-orm";
import { db, sqlite } from "../src/db";
import {
  discountCodes,
  events,
  orderItems,
  orders,
  organizers,
  pageViews,
  referralCodes,
  seats,
  tickets,
  zones,
} from "../src/db/schema";
import { hashPassword } from "../src/lib/auth";
import { ringSeatLabel, ringRowLabel, ringSizes } from "../src/lib/seat-layout";
import { id, orderPublicId, ticketCode } from "../src/lib/ids";

const DAY = 86400;
const now = Math.floor(Date.now() / 1000);

for (const t of [pageViews, tickets, orderItems, orders, referralCodes, discountCodes, seats, zones, events, organizers]) {
  db.delete(t).run();
}

const orgId = id();
db.insert(organizers)
  .values({
    id: orgId,
    slug: "rhythm-events",
    name: "Rhythm Events, Ahmedabad",
    email: "organiser@demo.in",
    passwordHash: hashPassword("demo1234"),
    phone: "+919876543210",
    supportPhone: "+919876543210",
    brandColor: "#e11d48",
  })
  .run();

/* ---------------------------------------------------------------- event 1 */
const garbaId = id();
db.insert(events)
  .values({
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
    terms: "Entry only with a valid QR pass. No refunds. Right of admission reserved.",
  })
  .run();

const garbaZones = [
  { name: "Season Pass — 9 Nights", price: 599900, cap: 500, admits: 1, color: "#a21caf", desc: "All nine nights, priority lane entry." },
  { name: "VIP Couple Entry", price: 249900, cap: 400, admits: 2, color: "#e11d48", desc: "Front arena access for two, includes dinner coupons." },
  { name: "Gold Entry", price: 129900, cap: 1500, admits: 1, color: "#f59e0b", desc: "Main arena, single entry." },
  { name: "General Entry", price: 59900, cap: 3000, admits: 1, color: "#0ea5e9", desc: "Open ground access." },
  { name: "Kids (under 10)", price: 19900, cap: 600, admits: 1, color: "#22c55e", desc: "Must be accompanied by an adult." },
];
const garbaZoneIds: string[] = [];
garbaZones.forEach((z, i) => {
  const zid = id();
  garbaZoneIds.push(zid);
  db.insert(zones)
    .values({
      id: zid,
      eventId: garbaId,
      name: z.name,
      description: z.desc,
      kind: "open",
      priceMinor: z.price,
      compareAtMinor: i === 0 ? 799900 : null,
      capacity: z.cap,
      admitsCount: z.admits,
      color: z.color,
      maxPerOrder: 10,
      sortOrder: i,
    })
    .run();
});

/* ---------------------------------------------------------------- event 2 */
const concertId = id();
db.insert(events)
  .values({
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
  })
  .run();

const seatedZones = [
  { name: "Platinum", price: 349900, rows: 4, cols: 14, color: "#a21caf", start: "A" },
  { name: "Gold", price: 199900, rows: 5, cols: 16, color: "#f59e0b", start: "E" },
  { name: "Silver", price: 99900, rows: 6, cols: 18, color: "#0ea5e9", start: "J" },
];
const concertZoneIds: string[] = [];
seatedZones.forEach((z, zi) => {
  const zid = id();
  concertZoneIds.push(zid);
  db.insert(zones)
    .values({
      id: zid,
      eventId: concertId,
      name: z.name,
      kind: "seated",
      shape: "grid",
      priceMinor: z.price,
      capacity: z.rows * z.cols,
      color: z.color,
      rows: z.rows,
      cols: z.cols,
      maxPerOrder: 6,
      sortOrder: zi,
    })
    .run();

  for (let r = 0; r < z.rows; r++) {
    const rowLabel = String.fromCharCode(z.start.charCodeAt(0) + r);
    for (let c = 1; c <= z.cols; c++) {
      db.insert(seats)
        .values({
          id: id(),
          zoneId: zid,
          eventId: concertId,
          rowLabel,
          seatNumber: c,
          label: `${rowLabel}${c}`,
          x: c,
          y: r,
        })
        .run();
    }
  }
});


/* ---------------------------------------------------------------- event 3 */
const akhadaId = id();
db.insert(events)
  .values({
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
    terms: "Traditional dress required. Entry only with a valid QR pass.",
  })
  .run();

const ringZones = [
  { name: "Inner Circle", price: 449900, ringCount: 3, start: 14, step: 8, hole: 22, color: "#d55181" },
  { name: "Middle Rings", price: 249900, ringCount: 4, start: 44, step: 10, hole: 46, color: "#c98500" },
  { name: "Outer Rings", price: 129900, ringCount: 4, start: 90, step: 14, hole: 70, color: "#199e70" },
];
const akhadaZoneIds: string[] = [];
ringZones.forEach((z, zi) => {
  const zid = id();
  akhadaZoneIds.push(zid);
  const cfg = {
    shape: "rings" as const,
    ringCount: z.ringCount,
    ringStartSeats: z.start,
    ringSeatStep: z.step,
    arcSpanDeg: 360,
    arcStartDeg: 0,
    innerHolePct: z.hole,
  };
  const sizes = ringSizes(cfg);
  db.insert(zones)
    .values({
      id: zid,
      eventId: akhadaId,
      name: z.name,
      kind: "seated",
      shape: "rings",
      priceMinor: z.price,
      capacity: sizes.reduce((n, x) => n + x, 0),
      color: z.color,
      maxPerOrder: 8,
      ringCount: cfg.ringCount,
      ringStartSeats: cfg.ringStartSeats,
      ringSeatStep: cfg.ringSeatStep,
      arcSpanDeg: cfg.arcSpanDeg,
      arcStartDeg: cfg.arcStartDeg,
      innerHolePct: cfg.innerHolePct,
      sortOrder: zi,
    })
    .run();

  sizes.forEach((size, ringIndex) => {
    for (let pos = 0; pos < size; pos++) {
      db.insert(seats)
        .values({
          id: id(),
          zoneId: zid,
          eventId: akhadaId,
          rowLabel: ringRowLabel(ringIndex),
          seatNumber: pos + 1,
          label: ringSeatLabel(ringIndex, pos),
          x: pos,
          y: ringIndex,
          ringIndex,
          posInRing: pos,
          ringSize: size,
        })
        .run();
    }
  });
});

/* ----------------------------------------------------------------- codes */
const codes = [
  { code: "EARLYBIRD", label: "Early bird 20%", type: "percent", value: 20, max: 500, cap: 100000, kind: "public", eventId: garbaId },
  { code: "GARBA100", label: "₹100 off", type: "flat", value: 10000, max: null, cap: null, kind: "public", eventId: garbaId },
  { code: "SPONSOR", label: "Sponsor comp — 100%", type: "percent", value: 100, max: 50, cap: null, kind: "special", eventId: null },
  { code: "GROUP10", label: "10% off groups of 5+", type: "percent", value: 10, max: null, cap: null, kind: "public", eventId: null, minTickets: 5 },
];
const discountIds: Record<string, string> = {};
for (const c of codes) {
  const cid = id();
  discountIds[c.code] = cid;
  db.insert(discountCodes)
    .values({
      id: cid,
      organizerId: orgId,
      eventId: c.eventId,
      code: c.code,
      label: c.label,
      type: c.type,
      value: c.value,
      maxDiscountMinor: c.cap,
      maxRedemptions: c.max,
      minTickets: (c as { minTickets?: number }).minTickets ?? 1,
      maxPerBuyer: c.kind === "special" ? 5 : 1,
      kind: c.kind,
      endsAt: now + 20 * DAY,
    })
    .run();
}

const referrers = [
  { code: "RAHUL", name: "Rahul Shah", phone: "+919820011223" },
  { code: "PRIYA", name: "Priya Desai", phone: "+919820044556" },
  { code: "DJKARAN", name: "DJ Karan", phone: "+919820077889" },
];
const referralIds: Record<string, string> = {};
for (const r of referrers) {
  const rid = id();
  referralIds[r.code] = rid;
  db.insert(referralCodes)
    .values({
      id: rid,
      organizerId: orgId,
      eventId: garbaId,
      code: r.code,
      ownerName: r.name,
      ownerPhone: r.phone,
      discountType: "flat",
      discountValue: 5000,
      commissionType: "percent",
      commissionValue: 10,
      clicks: 40 + Math.floor(Math.random() * 400),
    })
    .run();
}

/* ------------------------------------------------------- backdated orders */
const firstNames = ["Aarav","Diya","Kabir","Meera","Rohan","Ananya","Vivaan","Isha","Arjun","Nisha","Dev","Riya","Karan","Sneha","Yash","Pooja","Manav","Tara","Neel","Jiya"];
const lastNames = ["Patel","Shah","Desai","Mehta","Joshi","Trivedi","Chauhan","Parmar","Rana","Bhatt"];
const rand = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];

const zoneRows = db.select().from(zones).all();
const zoneById = new Map(zoneRows.map((z) => [z.id, z]));
const seatRows = db.select().from(seats).all();
const freeSeats = new Map<string, typeof seatRows>();
for (const s of seatRows) {
  if (!freeSeats.has(s.zoneId)) freeSeats.set(s.zoneId, []);
  freeSeats.get(s.zoneId)!.push(s);
}

function makeOrder(eventId: string, zoneIds: string[], daysAgo: number, seated: boolean) {
  const zoneId = rand(zoneIds);
  const zone = zoneById.get(zoneId)!;
  const qty = seated ? 1 + Math.floor(Math.random() * 3) : 1 + Math.floor(Math.random() * 4);
  const buyer = `${rand(firstNames)} ${rand(lastNames)}`;
  const phone = `+9198${Math.floor(10000000 + Math.random() * 89999999)}`;
  const createdAt = now - daysAgo * DAY - Math.floor(Math.random() * DAY);

  const subtotal = zone.priceMinor * qty;
  const useDiscount = Math.random() < 0.22;
  const useReferral = !useDiscount && Math.random() < 0.25;
  const discountCodeId = useDiscount ? discountIds.EARLYBIRD : null;
  const referralCodeId = useReferral ? referralIds[rand(Object.keys(referralIds))] : null;
  const discount = useDiscount
    ? Math.min(Math.round(subtotal * 0.2), 100000)
    : useReferral
      ? 5000
      : 0;
  const ev = db.select().from(events).where(eq(events.id, eventId)).get()!;
  const fee =
    Math.round(((subtotal - discount) * ev.bookingFeeBps) / 10000) +
    ev.bookingFeeFlatMinor * qty;
  const total = subtotal - discount + fee;
  const commission = referralCodeId ? Math.round((subtotal - discount) * 0.1) : 0;

  const oid = id();
  db.insert(orders)
    .values({
      id: oid,
      publicId: orderPublicId(),
      eventId,
      organizerId: orgId,
      buyerName: buyer,
      buyerPhone: phone,
      buyerEmail: `${buyer.split(" ")[0].toLowerCase()}@example.in`,
      subtotalMinor: subtotal,
      discountMinor: discount,
      feeMinor: fee,
      totalMinor: total,
      commissionMinor: commission,
      discountCodeId,
      referralCodeId,
      ticketCount: qty,
      status: "paid",
      paymentProvider: "mock",
      paymentRef: `mock_${oid.slice(0, 8)}`,
      channel: rand(["web", "web", "embed", "whatsapp"]),
      createdAt,
      paidAt: createdAt + 120,
    })
    .run();

  db.insert(orderItems)
    .values({ id: id(), orderId: oid, zoneId, zoneName: zone.name, qty, unitPriceMinor: zone.priceMinor })
    .run();

  for (let i = 0; i < qty; i++) {
    let seatId: string | null = null;
    let seatLabel: string | null = null;
    if (seated) {
      const pool = freeSeats.get(zoneId) ?? [];
      const seat = pool.pop();
      if (!seat) break;
      seatId = seat.id;
      seatLabel = seat.label;
    }
    db.insert(tickets)
      .values({
        id: id(),
        code: ticketCode(),
        orderId: oid,
        eventId,
        zoneId,
        zoneName: zone.name,
        seatId,
        seatLabel,
        holderName: buyer,
        admitsCount: zone.admitsCount,
        status: "valid",
        createdAt,
      })
      .run();
  }
}

// Sales ramp up as the event approaches — the shape organisers actually see.
for (let daysAgo = 21; daysAgo >= 0; daysAgo--) {
  const heat = Math.round(2 + (21 - daysAgo) * 0.9 + Math.random() * 4);
  for (let i = 0; i < heat; i++) makeOrder(garbaId, garbaZoneIds, daysAgo, false);
  for (let i = 0; i < Math.round(heat / 3); i++)
    makeOrder(concertId, concertZoneIds, daysAgo, true);
  for (let i = 0; i < Math.round(heat / 4); i++)
    makeOrder(akhadaId, akhadaZoneIds, daysAgo, true);

  for (let v = 0; v < heat * 7; v++) {
    db.insert(pageViews)
      .values({
        id: id(),
        eventId: Math.random() < 0.6 ? garbaId : Math.random() < 0.5 ? concertId : akhadaId,
        source: rand(["web", "embed", "whatsapp"]),
        createdAt: now - daysAgo * DAY - Math.floor(Math.random() * DAY),
      })
      .run();
  }
}

const counts = {
  orders: db.select().from(orders).all().length,
  tickets: db.select().from(tickets).all().length,
};
console.log("Seeded:", counts);
console.log("Login → organiser@demo.in / demo1234");
sqlite.close();
