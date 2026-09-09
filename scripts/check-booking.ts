/** End-to-end exercise of the booking core against the real database. */
import { eq } from "drizzle-orm";
import { db, first, pool } from "../src/db";
import { eventDates, events, seats, tickets, zones } from "../src/db/schema";
import { confirmOrder, createPendingOrder, failOrder } from "../src/lib/booking";
import { quoteCart } from "../src/lib/pricing";
import { unavailableSeatIds, zoneAvailability } from "../src/lib/inventory";
import { cartId } from "../src/lib/ids";
import { formatMinor } from "../src/lib/money";

async function main() {
  const open = (await first(
    db.select().from(events).where(eq(events.slug, "navratri-nights-2026")),
  ))!;
  const seated = (await first(
    db.select().from(events).where(eq(events.slug, "raas-in-the-round")),
  ))!;

  const openZones = await db.select().from(zones).where(eq(zones.eventId, open.id));
  const openNights = await db.select().from(eventDates).where(eq(eventDates.eventId, open.id));
  const seatedNights = await db.select().from(eventDates).where(eq(eventDates.eventId, seated.id));
  const firstNight = openNights[0]?.id ?? null;
  const firstSeatedNight = seatedNights[0]?.id ?? null;

  const z = openZones.find((x) => x.name === "General Entry")!;
  const availOf = async (zoneId: string, night: string | null) =>
    (await zoneAvailability(open.id, night)).get(zoneId)!.available;

  console.log("=== quote: plain ===");
  let q = await quoteCart({ event: open, lines: [{ zoneId: z.id, qty: 2 }] });
  console.log(
    z.name,
    "x2",
    formatMinor(q.subtotalMinor),
    "fee",
    formatMinor(q.feeMinor),
    "total",
    formatMinor(q.totalMinor),
  );

  console.log("=== quote: EARLYBIRD (20%, capped) ===");
  q = await quoteCart({ event: open, lines: [{ zoneId: z.id, qty: 2 }], code: "earlybird" });
  console.log("discount", formatMinor(q.discountMinor), "total", formatMinor(q.totalMinor));

  console.log("=== quote: GROUP10 needs 5 tickets ===");
  q = await quoteCart({ event: open, lines: [{ zoneId: z.id, qty: 2 }], code: "GROUP10" });
  console.log("error:", q.codeError);
  q = await quoteCart({ event: open, lines: [{ zoneId: z.id, qty: 5 }], code: "GROUP10" });
  console.log("with 5:", formatMinor(q.discountMinor), "off");

  console.log("=== quote: referral RAHUL ===");
  q = await quoteCart({ event: open, lines: [{ zoneId: z.id, qty: 2 }], code: "rahul" });
  console.log("discount", formatMinor(q.discountMinor), "commission", formatMinor(q.commissionMinor));

  console.log("=== quote: bad code ===");
  q = await quoteCart({ event: open, lines: [{ zoneId: z.id, qty: 1 }], code: "NOPE" });
  console.log("error:", q.codeError);

  console.log("=== open-ground order ===");
  const before = await availOf(z.id, firstNight);
  const o1 = await createPendingOrder({
    event: open,
    cartId: cartId(),
    lines: [{ zoneId: z.id, qty: 3 }],
    code: "EARLYBIRD",
    showDateId: firstNight,
    buyerName: "Test Buyer",
    buyerPhone: "+919000000001",
  });
  const held = await availOf(z.id, firstNight);
  await confirmOrder({ orderId: o1.orderId, paymentProvider: "mock", paymentRef: "t1" });
  const after = await availOf(z.id, firstNight);
  const issued = await db.select().from(tickets).where(eq(tickets.orderId, o1.orderId));
  console.log(`available ${before} → held ${held} → paid ${after} | tickets ${issued.length}`);

  console.log("=== idempotent confirm ===");
  await confirmOrder({ orderId: o1.orderId, paymentProvider: "mock", paymentRef: "t1-again" });
  console.log(
    "tickets still",
    (await db.select().from(tickets).where(eq(tickets.orderId, o1.orderId))).length,
  );

  console.log("=== seated order + seat clash ===");
  const takenNow = await unavailableSeatIds(seated.id, firstSeatedNight);
  const freeSeats = (await db.select().from(seats).where(eq(seats.eventId, seated.id)))
    .filter((s) => !takenNow.has(s.id))
    .slice(0, 2);
  const seatZone = freeSeats[0].zoneId;
  const o2 = await createPendingOrder({
    event: seated,
    cartId: cartId(),
    lines: [{ zoneId: seatZone, qty: 2 }],
    seatIds: freeSeats.map((s) => s.id),
    showDateId: firstSeatedNight,
    buyerName: "Seat Buyer",
    buyerPhone: "+919000000002",
  });
  try {
    await createPendingOrder({
      event: seated,
      cartId: cartId(),
      lines: [{ zoneId: seatZone, qty: 1 }],
      seatIds: [freeSeats[0].id],
      showDateId: firstSeatedNight,
      buyerName: "Racer",
      buyerPhone: "+919000000003",
    });
    console.log("!! clash NOT caught");
  } catch (e) {
    console.log("clash caught:", (e as Error).message);
  }
  await confirmOrder({ orderId: o2.orderId, paymentProvider: "mock", paymentRef: "t2" });
  const seatTickets = await db.select().from(tickets).where(eq(tickets.orderId, o2.orderId));
  console.log("seats issued:", seatTickets.map((t) => t.seatLabel).join(", "));

  console.log("=== abandon releases inventory ===");
  const availA = await availOf(z.id, firstNight);
  const o3 = await createPendingOrder({
    event: open,
    cartId: cartId(),
    lines: [{ zoneId: z.id, qty: 4 }],
    showDateId: firstNight,
    buyerName: "Ghost",
    buyerPhone: "+919000000004",
  });
  const availB = await availOf(z.id, firstNight);
  await failOrder(o3.orderId, "cancelled");
  const availC = await availOf(z.id, firstNight);
  console.log(`${availA} → held ${availB} → released ${availC}`);

  console.log("=== oversell guard ===");
  const tiny = openZones.find((x) => x.name.startsWith("Kids"))!;
  const cap = await availOf(tiny.id, firstNight);
  try {
    await createPendingOrder({
      event: { ...open, maxTicketsPerOrder: 99999 },
      cartId: cartId(),
      lines: [{ zoneId: tiny.id, qty: cap + 1 }],
      showDateId: firstNight,
      buyerName: "Greedy",
      buyerPhone: "+919000000005",
    });
    console.log("!! oversell NOT caught");
  } catch (e) {
    console.log("oversell caught:", (e as Error).message);
  }

  console.log("=== per-order cap ===");
  try {
    await createPendingOrder({
      event: open,
      cartId: cartId(),
      lines: [{ zoneId: z.id, qty: open.maxTicketsPerOrder + 1 }],
      showDateId: firstNight,
      buyerName: "TooMany",
      buyerPhone: "+919000000006",
    });
    console.log("!! cap NOT enforced");
  } catch (e) {
    console.log("cap enforced:", (e as Error).message);
  }

  console.log("=== multi-night inventory ===");
  console.log(`${openNights.length} nights on "${open.title}"`);
  const perNight = openZones.find((x) => !x.allDates && x.name === "Gold Entry")!;
  const season = openZones.find((x) => x.allDates === 1)!;
  const n1 = openNights[0].id;
  const n2 = openNights[1].id;

  const b1 = await availOf(perNight.id, n1);
  const b2 = await availOf(perNight.id, n2);
  const nightOrder = await createPendingOrder({
    event: open,
    cartId: cartId(),
    lines: [{ zoneId: perNight.id, qty: 5 }],
    showDateId: n1,
    buyerName: "Night One",
    buyerPhone: "+919000000010",
  });
  await confirmOrder({ orderId: nightOrder.orderId, paymentProvider: "mock", paymentRef: "n1" });
  console.log(`night 1: ${b1} → ${await availOf(perNight.id, n1)} (expect −5)`);
  console.log(`night 2: ${b2} → ${await availOf(perNight.id, n2)} (expect unchanged)`);

  console.log("=== season pass spans every night ===");
  const sBefore = await availOf(season.id, n1);
  const seasonOrder = await createPendingOrder({
    event: open,
    cartId: cartId(),
    lines: [{ zoneId: season.id, qty: 2 }],
    showDateId: n1,
    buyerName: "Season Holder",
    buyerPhone: "+919000000011",
  });
  await confirmOrder({ orderId: seasonOrder.orderId, paymentProvider: "mock", paymentRef: "s1" });
  console.log(
    `season pass: ${sBefore} → night1 ${await availOf(season.id, n1)}, night2 ${await availOf(season.id, n2)} (both −2)`,
  );

  console.log("=== a night must be chosen on a multi-night event ===");
  try {
    await createPendingOrder({
      event: open,
      cartId: cartId(),
      lines: [{ zoneId: perNight.id, qty: 1 }],
      buyerName: "No Night",
      buyerPhone: "+919000000012",
    });
    console.log("!! missing night NOT caught");
  } catch (e) {
    console.log("caught:", (e as Error).message);
  }

  console.log("=== the same seat sells on two different nights ===");
  if (seatedNights.length > 1) {
    const takenN1 = await unavailableSeatIds(seated.id, seatedNights[0].id);
    const openSeat = (await db.select().from(seats).where(eq(seats.eventId, seated.id))).find(
      (s) => !takenN1.has(s.id),
    )!;
    const o = await createPendingOrder({
      event: seated,
      cartId: cartId(),
      lines: [{ zoneId: openSeat.zoneId, qty: 1 }],
      seatIds: [openSeat.id],
      showDateId: seatedNights[0].id,
      buyerName: "Seat N1",
      buyerPhone: "+919000000013",
    });
    await confirmOrder({ orderId: o.orderId, paymentProvider: "mock", paymentRef: "sn1" });
    const t1 = (await unavailableSeatIds(seated.id, seatedNights[0].id)).has(openSeat.id);
    const t2 = (await unavailableSeatIds(seated.id, seatedNights[1].id)).has(openSeat.id);
    console.log(`seat ${openSeat.label}: night 1 taken=${t1}, night 2 taken=${t2}`);
  }

  console.log("\nAll booking-core checks ran.");
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
