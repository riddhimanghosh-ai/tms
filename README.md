# Gathara — ticketing for live events

A white-label ticket booking and event management system built for Indian event
organisers: Garba and dandiya nights, ground events, and seated shows.

The organiser gets a full back office. Their buyers get a booking page that
lives on the organiser's own site (or a link they can WhatsApp) and never shows
a competitor's event.

---

## Run it locally

```bash
pnpm install
pnpm db:push      # create the SQLite schema
pnpm db:seed      # demo organiser, 2 events, codes, 3 weeks of sales
pnpm dev
```

Open http://localhost:3000

| Where | What |
|---|---|
| `/` | Marketing page for the product itself |
| `/admin/login` | Organiser dashboard — **organiser@demo.in / demo1234** |
| `/e/rhythm-events/navratri-nights-2026` | Open-ground booking page (priced categories) |
| `/e/rhythm-events/dandiya-finale-live` | Reserved-seating booking page (seat map) |

`pnpm db:reset` wipes the database and re-seeds it.
`pnpm check:booking` exercises the booking core — pricing, codes, holds,
oversell and seat-clash protection — against the real database.

---

## What's built

### Booking page (the buyer side)

- **Two admission models.** *Open ground* — priced categories with capacities
  and a quantity stepper. *Reserved seating* — a seat map per block, tap to pick.
  The organiser chooses per event; the same widget handles both.
- **Couple and family passes** — a category can admit more than one person per
  ticket, which the gate scanner shows on scan.
- **Codes at checkout** — discount codes and referral codes share one input box.
  Every price is recalculated on the server, so a tampered client can't change
  what it's charged.
- **Live scarcity** — "only 12 left" appears from real remaining inventory, and
  sold-out categories are disabled rather than hidden.
- **Passes with QR** — issued the moment payment confirms, shareable one by one
  (`/t/<code>`) so a buyer can forward a single pass to a friend.

### Embedding into the organiser's own site

Three options on the **Embed & share** tab, with a live preview:

```html
<div id="gathara-tickets"></div>
<script src="https://…/embed.js" data-event="rhythm-events/navratri-nights-2026"
        data-target="#gathara-tickets" async></script>
```

The script injects an iframe and keeps its height in sync with the form, so
there's no inner scrollbar. There's also a plain `<iframe>` snippet and a
"Book tickets" button for sites where pasting a script isn't possible. For
organisers with no website at all, the hosted page at `/e/<org>/<event>` is a
complete landing page, and the dashboard has a one-tap WhatsApp share.

### Dashboard (the organiser side)

- **Overview** — daily gross sales curve, revenue by ticket type, sell-through
  per category with a near-sold-out warning, promoter leaderboard, channel
  attribution, a money breakdown down to commission owed, and page→booking
  conversion.
- **Tickets & seating** — create categories or seating blocks, set price, "was"
  price, capacity, admits-per-ticket, per-order min/max, sales cut-off and
  colour. Seated blocks generate a seat grid; click any seat to block it.
  Regenerating a layout never orphans a seat that's already sold.
- **Codes** — percentage, flat ₹, capped percentage, minimum tickets, minimum
  order, total redemption limit, per-phone limit, category-scoped, expiry, and
  hidden "special" passes for sponsors and guests. Referral codes carry a buyer
  discount *and* a promoter commission, each percentage or flat, with clicks,
  tickets, sales and commission tracked per promoter.
- **Orders & attendees** — searchable, filterable, CSV export for both.
- **Check-in** — a gate scanner that reads QR codes with the phone camera
  (`BarcodeDetector`) or accepts a typed code. Duplicate scans are caught and
  labelled, and a live "inside right now" counter tracks arrivals.
- **Settings** — event details, cover image, convenience fee (percentage and/or
  flat per ticket), per-order limit, terms, and the gate PIN.

---

## How it's put together

```
src/
  db/schema.ts        organizers · events · zones · seats · seat_holds
                      discount_codes · referral_codes · orders · order_items
                      tickets · page_views
  lib/
    pricing.ts        the only place a cart price is decided
    inventory.ts      availability, seat holds, oversell protection
    booking.ts        pending order → payment → issued tickets
    payments.ts       provider seam (mock / Razorpay)
    analytics.ts      every dashboard number, in one pass
  components/
    charts.tsx        SVG charts on a CVD-validated categorical palette
    booking/          the buyer-facing widget and seat picker
  app/
    e/[org]/[event]   public landing page
    embed/…           bare booking surface for iframes
    embed.js          the loader script organisers paste
    admin/…           the dashboard
```

**Money** is stored as integer paise everywhere; nothing is a float.

**Overselling** is prevented by `seat_holds`. Adding to a cart reserves
inventory for 8 minutes inside a transaction that re-checks availability, so
two simultaneous buyers can't claim the same seat or drain the last of a
category. Abandoning checkout releases the hold; expired holds are reaped
lazily on the next availability read.

**Payment confirmation is idempotent** — a duplicated gateway callback will not
mint a second set of tickets.

### Payments

`PAYMENT_PROVIDER=mock` (the default) walks the buyer through a simulated
gateway so the entire flow — checkout, payment, passes, gate scan — works with
no keys and no network.

Switching to real payments is two environment variables:

```bash
PAYMENT_PROVIDER=razorpay
RAZORPAY_KEY_ID=…
RAZORPAY_KEY_SECRET=…
```

Razorpay is the default real provider because UPI is how this audience actually
pays. The signature on every callback is verified server-side before a ticket is
issued. Nothing outside `src/lib/payments.ts` knows which provider is active, so
adding Cashfree or PhonePe is one more branch in that file.

### Database

SQLite via Drizzle, so the whole thing runs from a single file with no services
to start. The schema is ordinary relational SQL — moving to Postgres is a
dialect change in `src/db/schema.ts` and `drizzle.config.ts`, not a rewrite.

---

## Not built yet

Worth knowing before this goes in front of a paying organiser:

- **WhatsApp delivery is a share link, not an API send.** Passes are shown on
  screen and shareable; automatic delivery needs a WhatsApp Business API
  provider (Gupshup, Interakt, Twilio).
- **No email/SMS sending**, no PDF ticket download.
- **No refunds or cancellations** from the dashboard — the schema supports the
  states, the UI doesn't drive them yet.
- **One login per organiser.** No staff accounts or roles; the gate PIN exists
  in the schema but the scanner currently sits behind the organiser login.
- **Seat holds assume a single node.** Correct for one server; a multi-instance
  deployment needs the holds moved to Postgres or Redis.
- **No rate limiting** on checkout or code-guessing.
