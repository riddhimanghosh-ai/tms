/** End-to-end exercise of the booking core against the real database. */
import { eq } from "drizzle-orm";
import { db, sqlite } from "../src/db";
import { eventDates, events, seats, tickets, zones } from "../src/db/schema";
import { createPendingOrder, confirmOrder, failOrder } from "../src/lib/booking";
import { quoteCart } from "../src/lib/pricing";
import { zoneAvailability, unavailableSeatIds } from "../src/lib/inventory";
import { cartId } from "../src/lib/ids";
import { formatMinor } from "../src/lib/money";

const open = db.select().from(events).where(eq(events.layoutType, "open")).get()!;
const seated = db.select().from(events).where(eq(events.slug, "raas-in-the-round")).get()!;

const openZones = db.select().from(zones).where(eq(zones.eventId, open.id)).all();
const openNights = db.select().from(eventDates).where(eq(eventDates.eventId, open.id)).all();
const firstNight = openNights[0]?.id ?? null;
const seatedNightsAll = db.select().from(eventDates).where(eq(eventDates.eventId, seated.id)).all();
const firstSeatedNight = seatedNightsAll[0]?.id ?? null;
const z = openZones[3];

console.log("=== quote: plain ===");
let q = quoteCart({ event: open, lines: [{ zoneId: z.id, qty: 2 }] });
console.log(z.name, "x2", formatMinor(q.subtotalMinor), "fee", formatMinor(q.feeMinor), "total", formatMinor(q.totalMinor));

console.log("=== quote: EARLYBIRD (20%, capped ₹1000) ===");
q = quoteCart({ event: open, lines: [{ zoneId: z.id, qty: 2 }], code: "earlybird" });
console.log("discount", formatMinor(q.discountMinor), "total", formatMinor(q.totalMinor), q.codeError ?? "");

console.log("=== quote: GROUP10 needs 5 tickets ===");
q = quoteCart({ event: open, lines: [{ zoneId: z.id, qty: 2 }], code: "GROUP10" });
console.log("error:", q.codeError);
q = quoteCart({ event: open, lines: [{ zoneId: z.id, qty: 5 }], code: "GROUP10" });
console.log("with 5:", formatMinor(q.discountMinor), "off");

console.log("=== quote: referral RAHUL ===");
q = quoteCart({ event: open, lines: [{ zoneId: z.id, qty: 2 }], code: "rahul" });
console.log("discount", formatMinor(q.discountMinor), "commission", formatMinor(q.commissionMinor));

console.log("=== quote: bad code ===");
q = quoteCart({ event: open, lines: [{ zoneId: z.id, qty: 1 }], code: "NOPE" });
console.log("error:", q.codeError);

console.log("=== open-ground order ===");
const before = zoneAvailability(open.id, firstNight).get(z.id)!;
const o1 = createPendingOrder({
  event: open, cartId: cartId(), lines: [{ zoneId: z.id, qty: 3 }],
  code: "EARLYBIRD", showDateId: firstNight, buyerName: "Test Buyer", buyerPhone: "+919000000001",
});
const held = zoneAvailability(open.id, firstNight).get(z.id)!;
console.log("available before", before.available, "→ while held", held.available);
confirmOrder({ orderId: o1.orderId, paymentProvider: "mock", paymentRef: "t1" });
const after = zoneAvailability(open.id, firstNight).get(z.id)!;
const issued = db.select().from(tickets).where(eq(tickets.orderId, o1.orderId)).all();
console.log("after paid", after.available, "| tickets issued", issued.length, "| codes", issued.map((t) => t.code).join(","));

console.log("=== idempotent confirm ===");
confirmOrder({ orderId: o1.orderId, paymentProvider: "mock", paymentRef: "t1-again" });
console.log("tickets still", db.select().from(tickets).where(eq(tickets.orderId, o1.orderId)).all().length);

console.log("=== seated order + seat clash ===");
const freeSeats = db.select().from(seats).where(eq(seats.eventId, seated.id)).all()
  .filter((s) => !unavailableSeatIds(seated.id, firstSeatedNight).has(s.id)).slice(0, 2);
const seatZone = freeSeats[0].zoneId;
const o2 = createPendingOrder({
  event: seated, cartId: cartId(), lines: [{ zoneId: seatZone, qty: 2 }],
  seatIds: freeSeats.map((s) => s.id), showDateId: firstSeatedNight,
  buyerName: "Seat Buyer", buyerPhone: "+919000000002",
});
try {
  createPendingOrder({
    event: seated, cartId: cartId(), lines: [{ zoneId: seatZone, qty: 1 }],
    seatIds: [freeSeats[0].id], showDateId: firstSeatedNight,
    buyerName: "Racer", buyerPhone: "+919000000003",
  });
  console.log("!! clash NOT caught");
} catch (e) { console.log("clash caught:", (e as Error).message); }
confirmOrder({ orderId: o2.orderId, paymentProvider: "mock", paymentRef: "t2" });
const seatTickets = db.select().from(tickets).where(eq(tickets.orderId, o2.orderId)).all();
console.log("seats issued:", seatTickets.map((t) => t.seatLabel).join(", "));

console.log("=== abandon releases inventory ===");
const availA = zoneAvailability(open.id, firstNight).get(z.id)!.available;
const o3 = createPendingOrder({
  event: open, cartId: cartId(), lines: [{ zoneId: z.id, qty: 4 }],
  showDateId: firstNight, buyerName: "Ghost", buyerPhone: "+919000000004",
});
const availB = zoneAvailability(open.id, firstNight).get(z.id)!.available;
failOrder(o3.orderId, "cancelled");
const availC = zoneAvailability(open.id, firstNight).get(z.id)!.available;
console.log(`${availA} → held ${availB} → released ${availC}`);

console.log("=== oversell guard ===");
const tiny = openZones[4];
const cap = zoneAvailability(open.id, firstNight).get(tiny.id)!.available;
try {
  createPendingOrder({
    event: { ...open, maxTicketsPerOrder: 99999 }, cartId: cartId(),
    lines: [{ zoneId: tiny.id, qty: cap + 1 }],
    showDateId: firstNight, buyerName: "Greedy", buyerPhone: "+919000000005",
  });
  console.log("!! oversell NOT caught");
} catch (e) { console.log("oversell caught:", (e as Error).message); }

console.log("=== per-order cap ===");
try {
  createPendingOrder({
    event: open, cartId: cartId(), lines: [{ zoneId: z.id, qty: open.maxTicketsPerOrder + 1 }],
    showDateId: firstNight, buyerName: "TooMany", buyerPhone: "+919000000006",
  });
  console.log("!! cap NOT enforced");
} catch (e) { console.log("cap enforced:", (e as Error).message); }

console.log("=== multi-night inventory ===");
const nights = openNights;
console.log(`${nights.length} nights on "${open.title}"`);

const perNightZone = openZones.find((z) => !z.allDates)!;
const seasonZone = openZones.find((z) => z.allDates)!;

const n1 = nights[0].id;
const n2 = nights[1].id;
const before1 = zoneAvailability(open.id, n1).get(perNightZone.id)!.available;
const before2 = zoneAvailability(open.id, n2).get(perNightZone.id)!.available;

const nightOrder = createPendingOrder({
  event: open, cartId: cartId(), lines: [{ zoneId: perNightZone.id, qty: 5 }],
  showDateId: n1, buyerName: "Night One", buyerPhone: "+919000000010",
});
confirmOrder({ orderId: nightOrder.orderId, paymentProvider: "mock", paymentRef: "n1" });

const after1 = zoneAvailability(open.id, n1).get(perNightZone.id)!.available;
const after2 = zoneAvailability(open.id, n2).get(perNightZone.id)!.available;
console.log(`night 1: ${before1} -> ${after1} (expect -5)`);
console.log(`night 2: ${before2} -> ${after2} (expect unchanged)`);

console.log("=== season pass spans every night ===");
const seasonBefore = zoneAvailability(open.id, n1).get(seasonZone.id)!.available;
const seasonOrder = createPendingOrder({
  event: open, cartId: cartId(), lines: [{ zoneId: seasonZone.id, qty: 2 }],
  showDateId: n1, buyerName: "Season Holder", buyerPhone: "+919000000011",
});
confirmOrder({ orderId: seasonOrder.orderId, paymentProvider: "mock", paymentRef: "s1" });
const seasonN1 = zoneAvailability(open.id, n1).get(seasonZone.id)!.available;
const seasonN2 = zoneAvailability(open.id, n2).get(seasonZone.id)!.available;
console.log(`season pass: ${seasonBefore} -> night1 ${seasonN1}, night2 ${seasonN2} (both -2)`);

console.log("=== a night must be chosen on a multi-night event ===");
try {
  createPendingOrder({
    event: open, cartId: cartId(), lines: [{ zoneId: perNightZone.id, qty: 1 }],
    buyerName: "No Night", buyerPhone: "+919000000012",
  });
  console.log("!! missing night NOT caught");
} catch (e) { console.log("caught:", (e as Error).message); }

console.log("=== the same seat sells on two different nights ===");
const seatedNights = seatedNightsAll;
if (seatedNights.length > 1) {
  const openSeat = db.select().from(seats).where(eq(seats.eventId, seated.id)).all()
    .find((s) => !unavailableSeatIds(seated.id, seatedNights[0].id).has(s.id))!;
  const o = createPendingOrder({
    event: seated, cartId: cartId(), lines: [{ zoneId: openSeat.zoneId, qty: 1 }],
    seatIds: [openSeat.id], showDateId: seatedNights[0].id,
    buyerName: "Seat N1", buyerPhone: "+919000000013",
  });
  confirmOrder({ orderId: o.orderId, paymentProvider: "mock", paymentRef: "sn1" });
  const takenN1 = unavailableSeatIds(seated.id, seatedNights[0].id).has(openSeat.id);
  const takenN2 = unavailableSeatIds(seated.id, seatedNights[1].id).has(openSeat.id);
  console.log(`seat ${openSeat.label}: night 1 taken=${takenN1}, night 2 taken=${takenN2}`);
} else {
  console.log("(the seated demo event has one night — skipped)");
}

console.log("\nAll booking-core checks ran.");
sqlite.close();
