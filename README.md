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
| `/e/rhythm-events/navratri-nights-2026` | Open-ground landing page → priced categories |
| `/e/rhythm-events/dandiya-finale-live` | Reserved seating, straight rows |
| `/e/rhythm-events/raas-in-the-round` | Reserved seating, **concentric rings**, 3 nights |

The Navratri demo runs **nine nights**, so the buyer picks a night before
picking passes, and the "Season Pass" category covers all nine at once.

`pnpm db:reset` wipes the database and re-seeds it.
`pnpm check:booking` exercises the booking core — pricing, codes, holds,
oversell and seat-clash protection — against the real database.

---

## What's built

### The buyer journey

It is deliberately two steps, not one.

1. **Landing page** (`/e/<org>/<event>`) — hero, live countdown to doors, a
   scarcity strip built from real inventory ("Only 12 VIP left", "1,240 passes
   already booked", "Booking closes tomorrow"), event facts, description, a
   priced pass list, venue with a Maps link, and a CTA that follows the reader
   down the page on mobile.
2. **Booking page** (`/e/<org>/<event>/book`) — the picker, with a context rail
   that keeps the date, countdown and the three steps in view while choosing.

Embeds skip step 1 and mount the picker directly, since the organiser's own page
is already doing the selling.

- **Multi-night events.** A Garba run is nine nights sold separately, so nights
  are first-class: each has its own inventory, its own seat map state and its
  own sales figures. The same seat can be booked on Night 1 and Night 2. A
  category flagged as a **season pass** is sold once from a single pool and
  covers every night. Single-night events never show a night picker.
- **Three seating shapes, plus open ground.**
  *Rows & blocks* — straight numbered rows.
  *Concentric rings* — circles inside circles around a centre, any number of
  layers, each layer priceable separately.
  *Curved arc* — layers fanning around a stage, with an adjustable sweep.
  Shapes are per block, so one event can mix a ringed floor with tiered stands.
- **A stage you place.** Name the focal point (STAGE, SCREEN, DHOL, CENTRE…),
  put it top / bottom / left / right / centre, and draw it as a bar, a curved
  screen or a centre circle — with a live preview in settings.
- **Per-layer colours and descriptions.** Every ring or row can carry its own
  colour and a one-line note ("Right at the dhol — loudest, fastest ring"),
  which shows in the map legend and when a buyer hovers a seat.
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
  colour. Seated blocks pick a shape and get a **live preview that redraws as
  you type** — layers, seats in the first layer, growth per layer, empty centre,
  arc sweep and facing. Click any seat to block it. Regenerating a layout keeps
  every seat that's already sold, so a tweak can never orphan a booking.
- **Nights** — add one night, or a whole run of consecutive nights in one go.
  Pause a night without deleting it; per-night passes sold and gross are listed
  beside each. A night with sales can't be deleted, only paused.
- **Orders** — click any row to open its passes, message the buyer their pass
  link on WhatsApp, copy the order link, or **cancel and release the seats**
  (passes stop scanning, inventory returns, a limited-use code gets its
  redemption back).
- **Duplicate an event** — clones ticket types, seat layouts and codes into a
  fresh draft. Organisers run the same show every season.
- **Codes** — percentage, flat ₹, capped percentage, minimum tickets, minimum
  order, total redemption limit, per-phone limit, category-scoped, expiry, and
  hidden "special" passes for sponsors and guests. Referral codes carry a buyer
  discount *and* a promoter commission, each percentage or flat, with clicks,
  tickets, sales and commission tracked per promoter.
- **Orders & attendees** — searchable, filterable, CSV export for both.
- **Bulk seat editing** — block or unblock a whole row or ring from one chip,
  rather than clicking seats one at a time.
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
  lib/seat-layout.ts  seat and stage geometry — the single source the editor,
                      the buyer's picker and the seat generator all draw from
  components/
    date-time-field.tsx  a date input and a time input, not `datetime-local`
    nav.tsx              back button + breadcrumbs
    toast.tsx            action feedback
  components/
    charts.tsx        SVG charts on a CVD-validated categorical palette
    seat-map.tsx      one SVG renderer for grid, rings and arc layouts
    booking/          the buyer-facing widget, countdown and urgency strip
  app/
    e/[org]/[event]        landing page
    e/[org]/[event]/book   the booking step
    embed/…           bare booking surface for iframes
    embed.js          the loader script organisers paste
    admin/…           the dashboard
```

**Money** is stored as integer paise everywhere; nothing is a float.

**Seat geometry lives in one module.** `seat-layout.ts` turns a block's config
into positions in a fixed 1000×1000 viewBox. The seat generator, the organiser's
editor and the buyer's picker all call it, so what an organiser arranges is
pixel-for-pixel what a buyer taps — and the map scales to any width without
recomputing anything.

**Overselling** is prevented by `seat_holds`. Adding to a cart reserves
inventory for 8 minutes inside a transaction that re-checks availability, so
two simultaneous buyers can't claim the same seat or drain the last of a
category. Abandoning checkout releases the hold; expired holds are reaped
lazily on the next availability read.

**Dates are not `datetime-local`.** The native combined control refuses a
half-filled value and enforces it with a browser tooltip that can't be styled or
reworded — so a date typed without a time reads as an error rather than an
unfinished field. Two plain inputs validate independently, default the time to a
sensible evening slot, offer Today / Tomorrow / This Friday and 6–9 pm presets,
and echo the result back in words. A hidden field carries the combined value, so
nothing server-side changed.

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
- **Cancelling an order does not move money.** It voids the passes and releases
  the seats; the actual refund is issued in the payment gateway.
- **One login per organiser.** No staff accounts or roles; the gate PIN exists
  in the schema but the scanner currently sits behind the organiser login.
- **Seat holds assume a single node.** Correct for one server; a multi-instance
  deployment needs the holds moved to Postgres or Redis.
- **No rate limiting** on checkout or code-guessing.
