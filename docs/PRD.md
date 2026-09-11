# Product Requirements Document (PRD)

**Product:** Rasana — white-label ticket booking and event management system
**Repository:** https://github.com/riddhimanghosh-ai/tms
**Version:** 1.0 — 2026-09-11
**Audience:** an engineer or AI coding agent building this system from scratch, with no access to the existing codebase, who must produce a production-ready result.

This PRD documents the **current, already-built system** as the authoritative spec — behavior, data model, business logic, and every rule that affects correctness. It does not include source code; it describes precisely what the code must do, in enough detail to reimplement it faithfully. Where a companion BRD exists, this document is the technical counterpart — no user-persona or business-motivation narrative here beyond what's needed to justify a rule.

**How to read this document.** Sections 1–16 are the system rules: architecture, data model, and the logic that must be correct (pricing, inventory, gate scanning, payments). **Sections 17 and 18 are the behavioural specification** — every end-to-end user flow, every screen, every state — and are where to start if you are building the interface. The two halves are cross-referenced: a flow step in Section 17 points to the rule that governs it, and a screen in Section 18 points to the flow it implements.

---

## 1. System overview

Rasana is a **multi-tenant** SaaS application. One tenant = one **organizer** (an event company). Organizers create **events**, each of which sells **tickets** through **zones** (priced categories, which may be open-capacity or seat-mapped), optionally across multiple **nights**. Buyers complete a **checkout** that produces an **order**, which upon payment confirmation mints one **ticket** row per admission, each carrying a unique QR-scannable **code**. A **gate scanner** checks tickets in and out, with an optional **re-entry** mode described in full in Section 8.

Stack assumptions carried over from the existing build (follow unless there's a strong reason not to):
- **Framework:** Next.js (App Router), TypeScript throughout.
- **Database:** PostgreSQL, accessed via an ORM with SQL-level transaction support (the existing build uses Drizzle ORM). Use a **pooled/websocket connection**, not an HTTP-only serverless driver — **transactions are required** for oversell protection (see Section 6).
- **Auth:** first-party session cookies (no third-party auth provider required); password hashing with a salted, computationally-hard KDF (scrypt or equivalent — never plain SHA/MD5).
- **Money:** every monetary value is stored and computed as an **integer count of the smallest currency unit** (paise for INR). Never use floating point for money anywhere in the stack, including in transit to the client.
- **Time:** every timestamp is a **Unix integer (seconds)**, not a database-native timestamp type, and not a client-local `Date`. Display formatting converts to the venue's timezone at render time only (see Section 11).
- **Payments:** a provider-abstraction layer with two implementations: a **mock** provider (default, for demos/dev — simulates a gateway with no external calls or keys) and a **real** provider (Razorpay in the reference build, chosen because UPI dominates this payment corridor — architecture must allow swapping in another provider such as Cashfree/PhonePe by adding one branch to the provider module, not by touching calling code).
- **Deployment target:** Vercel-style serverless hosting is acceptable, but the DB access pattern must tolerate serverless connection churn (pooled connections), and any background reaping/cleanup must be designed to run **lazily on read** rather than assuming a persistent cron process (see Section 6.5) unless a real scheduler is provisioned.

---

## 2. Multi-tenancy & access model

- **Organizer** is the tenant boundary. Every event, zone, seat, order, ticket, code, and scan row is scoped to exactly one organizer (directly or transitively via its event).
- **One login per organizer**, no per-tenant roles/staff accounts in this version. All dashboard routes and all mutating server actions must verify the authenticated organizer owns the `eventId` (or other resource) being acted on before doing anything — never trust an ID from the client without an ownership check server-side.
- **Session:** server-side session record (id, organizerId, expiresAt) referenced by an httpOnly, `sameSite=lax`, `secure`-in-production cookie. Default session lifetime: 30 days. Session lookups must check `expiresAt` server-side on every request and delete+treat-as-signed-out if expired.
- **Password storage:** `scrypt(password, randomSalt)` with the salt stored alongside the hash (e.g. `salt:hash` in one column). Verify with a constant-time comparison (`timingSafeEqual` or equivalent) — never `===` on raw hash strings.
- **Gate access:** the schema reserves a per-event `gatePin` field for a lighter-weight gate-staff login, but the current build gates the scanner behind the **full organizer login**. A production build should decide explicitly whether to implement true PIN-based gate access (recommended — see Section 13 gaps) or keep it behind full login.

---

## 3. Data model

Define the following entities. Field names below are canonical; types are logical (map to actual column types per your ORM/DB). All `*Minor` fields are integer minor-currency-unit amounts. All `*At` / `at` fields are Unix-second integers unless noted.

### 3.1 `organizers`
| Field | Type | Notes |
|---|---|---|
| id | string PK | |
| slug | string | unique, used in public URLs (`/e/<slug>/...`) |
| name | string | |
| email | string | unique, login identifier |
| passwordHash | string | `salt:hash` |
| phone | string? | |
| logoUrl | string? | |
| brandColor | string | hex, default `#e11d48` |
| supportPhone | string? | |
| createdAt | int | |

### 3.2 `sessions`
id PK, organizerId FK→organizers (cascade delete), expiresAt, createdAt.

### 3.3 `events`
| Field | Notes |
|---|---|
| id, organizerId FK | |
| slug | unique per organizer (`(organizerId, slug)` unique index) |
| title, tagline?, description? | |
| venue?, city?, address? | |
| coverImageUrl? | |
| startsAt (int, required), endsAt?, doorsOpenAt? | |
| layoutType | `"open"` \| `"seated"` — drives whether zones are plain priced buckets or seat-mapped |
| status | `"draft"` \| `"published"` \| `"paused"` \| `"closed"` |
| currency | default `"INR"` |
| bookingFeeBps | integer basis points (250 = 2.5%), convenience fee % |
| bookingFeeFlatMinor | integer, flat per-ticket fee added on top of the % fee |
| maxTicketsPerOrder | default 10 |
| terms? | |
| highlights? | JSON string: `[{ "icon": string, "label": string }, …]` — icon row on landing page |
| listPublicly | 0/1 — include on the shared marketplace |
| gatePin? | reserved for lightweight gate login (see §2) |
| allowReentry | 0/1 — **the checkout/check-in re-entry feature; see Section 8** |
| reentryCooldownMins | int, 0 = no cooldown, else minimum minutes between an exit scan and the next accepted entry scan |
| stageLabel | default `"STAGE"` — free text focal-point label (STAGE, SCREEN, DHOL, CENTRE…) |
| stagePosition | `auto`\|`top`\|`bottom`\|`left`\|`right`\|`centre` |
| stageShape | `auto`\|`bar`\|`curve`\|`circle`\|`none` |
| createdAt | |

### 3.4 `event_dates` ("nights")
One row per night of a (possibly single-night) event. eventId FK, startsAt (required), endsAt?, label? (falls back to formatted date if absent), note?, active (0/1 — paused nights stay but stop selling), sortOrder.

Rule: a night that has any sold tickets **must not be deletable**, only pausable (`active=0`).

### 3.5 `zones` (priced categories / seating blocks)
| Field | Notes |
|---|---|
| id, eventId FK | |
| name, description? | |
| kind | `"open"` (priced bucket with a capacity number) \| `"seated"` (owns a seat grid; capacity is *derived* from its seat rows, never stored/trusted as a number) |
| shape | `"grid"` (straight rows) \| `"rings"` (concentric circles) \| `"arc"` (curved rows fanning around a stage) — only meaningful when `kind="seated"` |
| priceMinor, compareAtMinor? | compareAt is a cosmetic strike-through "was" price only |
| capacity | authoritative only for `kind="open"` |
| admitsCount | how many people one ticket of this zone admits (couple/family passes) |
| minPerOrder, maxPerOrder | per-order quantity bounds for this zone |
| color | hex |
| rows, cols | grid shape params |
| ringCount, ringStartSeats, ringSeatStep, arcSpanDeg, arcStartDeg, innerHolePct | rings/arc shape params — see Section 9 for exact geometry |
| allDates | 0/1 — **season pass**: sold from one shared pool, valid across every night of the event, rather than a per-night capacity (see Section 7.3) |
| layerColors?, layerNotes? | JSON arrays, one entry per ring/row layer, override `color`/`description` per layer |
| salesStartAt?, salesEndAt? | optional sale window |
| active, sortOrder | |

### 3.6 `seats`
One row per physical seat in a `kind="seated"` zone. zoneId FK, eventId FK (denormalized for query efficiency), rowLabel, seatNumber, label (unique per zone — `(zoneId, label)` unique index), status (`"available"`\|`"blocked"` — **"sold" is never stored here; it is always derived by checking for a non-cancelled ticket referencing the seat**), x/y (rendering coordinates in the shared geometry space, see Section 9), ringIndex, posInRing, ringSize (rings/arc bookkeeping).

### 3.7 `seat_holds` (short-lived reservations — the oversell guard)
id PK, eventId FK, seatId? FK (null for open-capacity holds), zoneId FK, qty (1 for a seat hold; N for an open-capacity hold reserving a slice of a bucket), cartId (groups every hold belonging to one checkout attempt), showDateId? FK (which night this hold applies to; null = single-night event), expiresAt.

Constraints: unique on `(seatId, showDateId)` — a given seat can only have one live hold per night. Indexes on cartId and eventId.

**Hold duration: 8 minutes** from creation. See Section 6 for the full reservation algorithm.

### 3.8 `discount_codes`
id, organizerId FK, eventId? FK (null = usable across every event of this organizer), code (case-insensitive match — compare uppercased), label?, type (`"percent"`\|`"flat"`, flat is minor-currency-units), value (whole percent, or minor units), maxDiscountMinor? (caps a percent discount), minTickets (default 1), minOrderMinor (default 0), maxRedemptions? (null = unlimited), maxPerBuyer (default 1, enforced per buyer phone number against **paid** orders only), usedCount, zoneId? (null = applies to whole cart; else discounts only that zone's share), kind (`"public"`\|`"special"` — special codes are not shown in any public UI, invite/sponsor-only), startsAt?, endsAt?, active, createdAt. Unique on `(organizerId, code)`.

### 3.9 `referral_codes` (promoter codes)
id, organizerId FK, eventId? FK, code, ownerName, ownerPhone?, discountType/discountValue (buyer-side discount), commissionType/commissionValue (promoter payout), clicks (incremented on landing-page hits carrying this code — implement this counter), active, createdAt. Unique on `(organizerId, code)`.

Discount codes and referral codes **share a single "code" input box at checkout** — the system must try a discount-code lookup first, then fall back to a referral-code lookup, never require the buyer to know which kind it is.

### 3.10 `orders`
id, publicId (short human-shareable reference, e.g. `GRB-8K2QD4` — format: 3-letter prefix + 6 alphanumerics, unique), eventId FK, organizerId FK, showDateId? FK (`onDelete: set null`), showDateLabel? (denormalized night label, so an order still reads correctly if a night is renamed later), buyerName, buyerPhone (required — used for per-buyer discount-code limits), buyerEmail?, subtotalMinor, discountMinor, feeMinor, totalMinor, commissionMinor, discountCodeId? FK, referralCodeId? FK, ticketCount, status (`"pending"`\|`"paid"`\|`"failed"`\|`"cancelled"`\|`"refunded"`), paymentProvider?, paymentRef?, channel (`"web"`\|`"whatsapp"`\|`"embed"`\|`"counter"`, default web), notes? (JSON scratch field — the reference build stores `{cartId, seatIds}` here to recover the reservation context at payment-confirm time), createdAt, paidAt?.

### 3.11 `order_items`
id, orderId FK, zoneId FK, zoneName (denormalized), qty, unitPriceMinor.

### 3.12 `tickets` (one row per admitted person/pass — the QR target)
id, code (unique, this is what the QR encodes — see Section 10 for format), orderId FK, eventId FK, zoneId FK, zoneName (denorm), seatId? FK (`onDelete: set null`), seatLabel? (denorm), showDateId? FK (`onDelete: set null`), showDateLabel? (denorm), showDateStartsAt? (denorm), holderName?, admitsCount (copied from the zone at issuance — a couple pass is worth 2 admits even if the zone's config later changes), status (`"valid"`\|`"checked_in"`\|`"cancelled"`), **inside** (0/1 — "1 while the holder is currently inside the venue," the field the re-entry feature toggles), **checkedInAt** (first-ever entry timestamp — kept forever even after later exits, so arrival-time analytics stay correct), checkedInBy?, **lastScanAt** (timestamp of the most recent scan of any direction — used for cooldown math), **entryCount** (how many times this pass has been used to *enter*, incremented on every accepted entry scan), createdAt.

### 3.13 `scans` (full audit trail of every gate movement)
id, ticketId FK (cascade), eventId FK (cascade), showDateId? FK (`set null`), direction (`"in"`\|`"out"`), at (int, default now), by? (free text — which gate/operator; reference build uses the literal `"gate"`).

This table is the append-only log; `tickets.inside`/`entryCount`/`lastScanAt` are a derived/cached current-state view over it, and must always be kept consistent with it inside the same transaction (see Section 8).

### 3.14 `page_views`
id, eventId FK, source (default `"web"`), referralCode? (attribution), createdAt. Used to compute conversion rate (orders ÷ views) on the dashboard.

---

## 4. Public surfaces (buyer-facing)

### 4.1 Three sales channels, one backend
1. **Marketplace** (`/`) — every event with `listPublicly=1`, searchable, filterable by city. Organizers can opt any individual event out while keeping the other two channels.
2. **Organizer's own landing page** (`/e/<organizerSlug>/<eventSlug>`) — fully branded, zero mention of other organizers or a competing marketplace. This is the link meant for WhatsApp/Instagram distribution.
3. **Embed** — a `<script>` loader (`/embed.js`) that a third-party site drops in:
   ```html
   <div id="rasana-tickets"></div>
   <script src=".../embed.js" data-event="orgSlug/eventSlug" data-target="#rasana-tickets" async></script>
   ```
   The script injects an iframe pointing at a bare booking surface (`/embed/<org>/<event>`) and must keep the iframe's height synced to its content (postMessage-based auto-resize) so there is never an inner scrollbar. Provide a plain `<iframe>` snippet and a "Book tickets" button/link snippet as fallbacks for sites where a script tag isn't practical. The embedded surface **skips the landing page** and mounts the booking picker directly — the host page is already doing the selling.

### 4.2 Landing page contents (`/e/<org>/<event>`)
Hero with cover image and tagline; a live countdown to `doorsOpenAt` (fallback `startsAt`); a **scarcity strip** built from real, currently-queried inventory numbers — never hardcoded or randomly generated — e.g. "Only 12 VIP left," "1,240 passes already booked," and a "booking closes" message derived from the earliest `salesEndAt` across zones; event facts (date, venue with a maps link, description); the `highlights` icon row; the list of priced zones/categories with live per-zone availability; a CTA that follows the reader down the page on mobile (sticky bottom bar). Record a `page_views` row on load, capturing `source` and any referral code present in the URL.

### 4.3 Booking page (`/e/<org>/<event>/book`)
A persistent context rail (date, countdown, 3-step indicator) beside the actual picker. Steps, in order:

1. **Night picker** — shown only if the event has more than one active night. Each night shows its own remaining-capacity signal (see Section 7.2's `nightsFreeCapacity` batching requirement — do not issue one availability query per night; batch it).
2. **Category/seat picker** — for `layoutType="open"` events, a quantity stepper per zone respecting `minPerOrder`/`maxPerOrder` and live `available` count (sold-out zones render disabled, not hidden). For `layoutType="seated"` events, a visual seat map (Section 9) where the buyer clicks individual seats; already-sold or currently-held-by-someone-else seats are visibly unselectable.
3. **Details & code** — buyer name, phone (required), email (optional); a single input for a discount **or** referral code, with the recalculated price shown immediately from a **server-computed** quote (never compute the displayed total client-side from raw zone prices — always round-trip through the pricing engine in Section 5, because that same call is what checkout enforces).
4. **Checkout** — hands off to the payment provider (Section 12), then to a confirmation/pass screen.

### 4.4 Digital pass (`/t/<code>`)
A public, unauthenticated page for a single ticket: shows the QR code, holder name, zone/seat, night, and admits count. This is the URL a buyer forwards to a friend to hand off one pass out of a group booking. It must not leak other tickets from the same order.

### 4.5 Order status pages
`/order/<publicId>` — buyer-facing order summary/status.
`/pay/<publicId>` — the payment step/redirect target.

---

## 5. Pricing engine — single source of truth

**Rule zero:** exactly one function computes what a cart costs, and both the checkout-preview UI and the order-creation path call it. A client-supplied price or discount amount is never trusted or persisted directly.

Given `{ event, lines: [{zoneId, qty}], code?, buyerPhone? }`:

1. Load the event's zones; build line items with `unitPriceMinor` and `lineTotalMinor = unitPriceMinor × qty` **read fresh from the zone row**, ignoring any price the client may have sent.
2. `subtotalMinor = Σ lineTotalMinor`.
3. If a `code` was supplied:
   a. Case-insensitively look up a **discount code** scoped to this organizer and (this event OR event-agnostic). If found, validate it (see below); on success compute the discount.
   b. Else, look up a **referral code** the same way; if found and active, compute both the buyer discount and the promoter commission.
   c. Else, set a `codeError` ("We couldn't find that code.") — **do not throw**; a cart with an invalid code still prices correctly at full price, with the error surfaced for the UI to show. (Order creation, however, *does* reject an unresolvable/invalid code — see step 6.)
4. **Discount validation** (discount codes only) must reject with a specific, buyer-facing reason when: the code is inactive, or outside its `startsAt`/`endsAt` window; `usedCount >= maxRedemptions` (when set); `ticketCount < minTickets`; `subtotalMinor < minOrderMinor`; or the buyer's phone number already has `maxPerBuyer` **paid** orders using this code.
5. **Discount amount:** `percent` → `round(base × value / 100)`; `flat` → `value` as-is; then clamp to `[0, min(cap, base)]` where `base` is the whole subtotal for an event-wide code, or just that one zone's line total for a **zone-scoped** code (`discountCodes.zoneId` set). If a zone-scoped code resolves to zero because the cart doesn't contain that zone, treat it as "doesn't apply" (clear the discount, set a `codeError`), not as a silent zero discount.
6. **Referral amount:** buyer discount computed the same way against the full subtotal; commission computed the same way against `(subtotal − discount)`.
7. **Fees:** `feeMinor = round((subtotal − discount) × bookingFeeBps / 10000) + bookingFeeFlatMinor × ticketCount`.
8. `totalMinor = (subtotal − discount) + feeMinor`.
9. Order creation (Section 6) calls this same function and **rejects the order** if a non-empty code string was supplied but resolved to a `codeError` — a buyer cannot silently proceed at full price when they typed a code they expected to work; they must clear the field or fix the code.

---

## 6. Inventory, holds, and oversell prevention

This is the correctness-critical subsystem. Two buyers racing for the same seat, or the last N units of an open category, must never both succeed.

### 6.1 Availability computation
For a given event (and, where relevant, a specific night):
- **Open zones:** `available = max(0, capacity − sold − held)`.
- **Seated zones:** `capacity` is **never** a stored/trusted number — it is `count(seats where zoneId = z and status = 'available')` computed live. `sold`/`held` follow the same shape.
- **Season-pass zones** (`allDates=1`): sold/held are summed **across every night** (no `showDateId` filter) — they draw from one shared pool, not a per-night one.
- **Non-season zones on a multi-night event:** sold/held are filtered to the specific `showDateId` being queried — the same physical seat/slot resets each night.
- `sold` = count of non-cancelled tickets for that zone (and night, if applicable).
- `held` = sum of live (`expiresAt > now`) `seat_holds.qty` for that zone (and night, if applicable).

Batch this per-night computation efficiently for a multi-night landing/night-picker page: never issue one query per night when N nights' worth of numbers are needed together; fetch zones/sold/held/seat-counts once and aggregate in memory per night.

### 6.2 Hold lifecycle
- **Hold duration: 8 minutes.**
- Reaping expired holds is **lazy**: run a `delete from seat_holds where expiresAt < now()` at the top of every availability read and every hold-creation call. Do not require a scheduled job for correctness in a single-instance deployment, though a real cron sweep is a reasonable addition, not a replacement.
- Adding items to a cart (or changing the cart) **replaces** that cart's existing holds: delete all holds for `cartId`, delete all globally-expired holds, then re-create.
- Abandoning checkout (leaving the page, letting the timer run out) simply lets the hold expire; also provide an explicit "release cart" path that deletes a cart's holds immediately (e.g. when a user navigates back to change their selection).

### 6.3 Reserving inventory (must run inside one DB transaction)
Given `{ eventId, cartId, showDateId?, seatIds[], openQty: [{zoneId, qty}] }`:
1. Delete this cart's existing holds; delete globally-expired holds.
2. **Seated items:** re-check, *inside the transaction*, which of the requested `seatIds` are currently sold or held-by-someone-else for this event/night. If any requested seat is now taken, **abort the whole reservation** with an error naming the specific seat labels that were just taken, so the UI can prompt the buyer to pick others — do not partially reserve. Otherwise insert one hold row per seat (`qty=1`), with a **deterministic id** derived from `(seatId, showDateId)` so a retried/duplicate call is idempotent rather than creating a second hold row for the same seat.
3. **Open-capacity items:** for each `{zoneId, qty}`, recompute that zone's live availability **inside the same transaction** and reject with "Not enough tickets left in that category" if `available < qty`. Otherwise insert one hold row for `(cartId, zoneId)` reserving `qty`.
4. This whole sequence must be one atomic transaction — the availability check and the insert cannot be two round-trips that another request can interleave between.

### 6.4 Order creation
1. Reject an empty cart.
2. Determine the **night**: if the event has multiple active nights and none was specified, reject ("Please choose which night you're coming"); if exactly one night exists, use it implicitly; if a specified night has already started/passed, reject.
3. Reject if total ticket quantity exceeds `event.maxTicketsPerOrder`.
4. For seated events, reject unless the number of `seatIds` supplied exactly equals the total ticket quantity.
5. Compute the quote (Section 5); reject if a supplied code produced a `codeError`.
6. Call the hold-reservation transaction (6.3); propagate its errors verbatim (they're already buyer-facing).
7. Create the `orders` row with `status="pending"` and every priced field from the quote (never recompute later from anything except this same quote), plus `order_items` rows, plus a `notes` JSON blob capturing at minimum `{cartId, seatIds}` so payment confirmation can recover context without re-deriving it from client input.

### 6.5 Payment confirmation → ticket minting (must be idempotent)
1. Load the order inside a transaction. If already `"paid"`, **return successfully without re-minting anything** (a duplicated gateway webhook must be a safe no-op, not a double-issue).
2. If not `"pending"`, reject (an order that failed/was cancelled cannot be paid after the fact through this path).
3. For each order item, mint `qty` ticket rows. For seated items, consume the specific held seat IDs from the order's stored `notes.seatIds`, matched to the correct zone; each minted ticket carries the seat's `label` denormalized. `admitsCount` is copied from the zone's **current** config at mint time.
4. Generate a unique, hard-to-guess `code` per ticket (Section 10).
5. If the order used a discount code, increment its `usedCount`.
6. Flip the order to `status="paid"`, set `paidAt`, record `paymentProvider`/`paymentRef`.
7. **Release the cart's seat holds** — they're now superseded by real tickets, and holding them would double-count against availability.
8. All of the above happens in one transaction.

### 6.6 Order failure / cancellation before payment
`failOrder(orderId, reason)`: no-op if already paid; otherwise release the cart's holds and set the order's status to the given reason (`"failed"` or `"cancelled"`).

### 6.7 Cancelling a paid order (organizer-initiated, from the dashboard)
- Voids every ticket on the order (`status="cancelled"` — cancelled tickets must fail every future scan check and must be excluded from every "sold"/inventory count from that point on).
- Releases the seats/open-capacity back to sale.
- If a limited-use discount code was applied, give back its redemption (decrement `usedCount`).
- **Does not move money.** This system only voids the booking; the operator must separately issue the refund inside the payment gateway. Make this limitation explicit in the UI so an organizer doesn't assume the buyer was refunded automatically.

---

## 7. Multi-night events & season passes

- An event with more than one `event_dates` row is multi-night; the buyer must pick a night before selecting tickets (Section 4.3, step 1).
- A **single-night event never shows a night picker** — treat its one row as implicit.
- A night can be **paused** (`active=0`) without deleting it — it stops appearing for new sales but existing tickets against it remain valid. A night with any sold tickets **cannot be deleted**, only paused.
- Organizers can add **one night at a time, or generate a whole consecutive run** (e.g. "9 nights starting Oct 1") in a single setup action.
- A **season-pass zone** (`allDates=1`) is sold once from a single shared pool and its ticket admits the holder on **every** night of the event — it is not per-night inventory and must never be double-decremented per night (see 6.1/6.3 for the exact aggregation rule). A regular (non-season) zone's capacity is independent per night — the same physical seat/label can be legitimately sold on Night 1 and again, to a different buyer, on Night 2.

---

## 8. Check-in / check-out / re-entry (gate scanning) — full specification

This is the feature explicitly required by this PRD's brief: allow an attendee who has already checked in to **leave the venue and come back in** without being wrongly rejected as a duplicate, while still catching genuine duplicate/fraudulent re-use.

### 8.1 Per-event toggle
Each event has `allowReentry` (0/1) and `reentryCooldownMins` (integer, 0–240, 0 = no cooldown). These are organizer-configurable per event, changeable at any time (not locked after publish), and default to **off** (`allowReentry=0`, `reentryCooldownMins=0`) — i.e. strict single-entry, matching pre-existing expectations, unless explicitly turned on.

### 8.2 The core state machine
Every ticket carries: `inside` (0/1 — currently inside right now), `status` (`valid` → `checked_in` once first admitted; never reverts except via the undo path), `checkedInAt` (first admission ever, immutable once set), `lastScanAt` (most recent scan of either direction), `entryCount` (times admitted, incremented only on accepted **entry** scans).

Scan endpoint contract: `scanTicket(eventId, rawCode, mode)` where `mode ∈ {"auto", "in", "out"}` — `"auto"` lets the gate infer direction from the ticket's current state; `"in"`/`"out"` let an operator run a lane that is dedicated to one direction only (useful for physically separated entry/exit gates).

Normalize the scanned code (trim, uppercase, strip whitespace) before lookup. Look up the ticket by `(code, eventId)` — a code from a different event must not match.

**Resolution order, given a found, non-cancelled ticket:**

1. **Ticket not found for this event** → `status: "invalid"`, message "Not a valid pass."
2. **Ticket status is `"cancelled"`** → `status: "invalid"`, message "Pass cancelled" ("This booking was refunded.") — regardless of `allowReentry`.
3. **If `event.allowReentry` is OFF** (the strict, pre-existing behavior): a ticket that is already `inside=1` (or already `status="checked_in"`) on any further scan → `status: "duplicate"`, "Already scanned," showing the original `checkedInAt` time. Otherwise, admit: set `status="checked_in"`, `inside=1`, `checkedInAt = now` (first time only), `lastScanAt = now`, `entryCount += 1`; log a `scans` row with `direction="in"`. Result: `status: "in"`, message `"Admit {admitsCount}"`.
4. **If `event.allowReentry` is ON:**
   - Determine intended direction: `wantsOut = (mode === "out") OR (mode === "auto" AND ticket.inside === 1)`. In other words, in auto mode, scanning a pass that is currently inside is interpreted as an exit; scanning one that is currently outside is interpreted as an entry attempt.
   - **Exit path (`wantsOut`):** if the ticket is **not** currently inside, this is a **duplicate**, not a valid exit — return `status: "duplicate"`, "Already outside" ("This pass isn't currently inside the venue."). Otherwise: set `inside=0`, `lastScanAt=now`; insert a `scans` row with `direction="out"`. Result: `status: "out"`, message "Checked out" ("Scan again on the way back in."). **`entryCount` is not touched on exit** — it only counts entries.
   - **Entry path (not `wantsOut`):**
     - If already `inside=1` → `status: "duplicate"`, "Already inside," showing the time of `lastScanAt ?? checkedInAt`.
     - Else, if `reentryCooldownMins > 0` **and** there is a `lastScanAt` on record: compute `waited = now − lastScanAt`; if `waited < reentryCooldownMins × 60`, **reject** with `status: "cooldown"`, message "Too soon to re-enter," detail stating how long ago they left and how many more minutes to wait (`ceil((needed − waited) / 60)`). This is a distinct status from `"duplicate"` — the UI must present it differently (it's a "not yet," not a "no").
     - Otherwise, **admit**: set `status="checked_in"`, `inside=1`, `checkedInAt` preserved if already set (else `= now`), `lastScanAt = now`, `entryCount += 1`; insert a `scans` row with `direction="in"`. Message is `"Welcome back"` with a detail of `"Re-entry #{entryCount}"` when `entryCount > 0` before this scan, else the normal `"Admit {admitsCount}"` for a first-ever entry.
5. Every branch above returns a consistent `ticket` summary object (id, code, holderName, zoneName, seatLabel, admitsCount, showDateLabel, entryCount, inside) reflecting the **post-scan** state, so the gate UI can render a full confirmation card, not just a status word.

### 8.3 Result vocabulary (must be exactly these distinguishable states, each rendered differently in the UI)
`"in"` (success, admitted/re-admitted) · `"out"` (success, checked out) · `"duplicate"` (rejected — already in the state the requested action assumes it isn't) · `"cooldown"` (rejected but temporary — a specific wait time is given) · `"invalid"` (rejected — no such pass, or cancelled) · `"error"` (rejected — malformed/empty input).

### 8.4 Live counters
The check-in screen must show, computed live from `tickets` (excluding cancelled):
- **Expected** = `Σ admitsCount` across all non-cancelled tickets for the event.
- **Inside** = `Σ admitsCount` where `inside=1`.
- **Arrived (ever)** = `Σ admitsCount` where `entryCount > 0`.

With `allowReentry` on, **Inside ≠ Arrived** is expected and meaningful (people who checked in and then stepped out show up in Arrived but not Inside) — the UI must show both, not collapse them into one number, and must label them so an organizer understands why they can differ.

### 8.5 Gate activity log
Show the most recent scans (event-scoped, newest first, joined to ticket for holder/zone/seat/code), each tagged `in`/`out` and timestamped. This is the operational audit trail an organizer reviews to resolve disputes ("I definitely scanned in").

### 8.6 Undo last scan
Because a busy gate will mis-scan, provide `undoLastScan(ticketId, eventId)`:
1. Load this ticket's scan history, newest first.
2. Delete the single most recent scan row.
3. Recompute the ticket's derived state from what's now the most recent remaining scan (the "previous" one): `inside = 1 if previous.direction === "in" else 0`, `lastScanAt = previous.at` (or `null` if no scans remain at all — in which case also reset `status` back to `"valid"` and clear `checkedInAt`/`checkedInBy`). Decrement `entryCount` by 1 **only if** the scan being undone was itself a `direction="in"` scan (never let it go below 0).
4. This must not simply flip a boolean — it must be derived from the real remaining history, so undoing works correctly no matter how many exits/entries preceded it.

### 8.7 Auto / Entry-only / Exit-only lanes
The scanner UI must support three modes mapping directly to the `mode` parameter above: **Auto** (infer direction from ticket state — one gate handling both directions), **Entry-only**, **Exit-only** (two physically separate gates, each locked to one direction so an operator can't accidentally scan an entering guest as an exit or vice versa). Entry-only and Exit-only must still surface the same duplicate/cooldown/invalid outcomes as auto mode — they only constrain the assumed intent, not the validation.

### 8.8 Scanner input
The scanner must accept a QR code read via the device camera (browser-native barcode detection API, or an equivalent client-side QR decode library, e.g. reading the code text via a canvas/video frame) **and** a manually typed code, for when a camera isn't available or a QR won't scan. Both paths call the same `scanTicket` function — camera decoding is purely a UI convenience for populating the same string input that a manual entry would.

---

## 9. Seat geometry (seated events)

All seat-shape math must live in **one shared module/function** called by three different consumers: (a) the seat-generation routine that creates `seats` rows when an organizer saves a zone's layout config, (b) the organizer's layout editor (live preview as they type), and (c) the buyer's seat picker. **This is a hard requirement, not a style preference** — if the geometry is duplicated across these three call sites, an organizer's editor preview will drift from what a buyer actually sees, which is an unacceptable trust break in a booking product. Render everything in a **fixed, resolution-independent coordinate space** (the reference build uses a `1000×1000` viewBox) so the map scales to any container width with no recomputation.

Three shapes, selected per zone:
- **`grid`** — `rows × cols` straight numbered seats.
- **`rings`** — `ringCount` concentric circles around a centre point; layer 0 (innermost) starts with `ringStartSeats` seats and each subsequent layer adds `ringSeatStep` more; `innerHolePct` (0–90) controls how much of the radius is left empty at the centre (for a dance floor, stage-adjacent gap, etc.).
- **`arc`** — same layer/seat-growth math as rings, but swept across `arcSpanDeg` degrees starting at `arcStartDeg`, rather than a full 360°, so rows fan toward a stage instead of surrounding a centre.

A **stage/focal point** is drawn per event using `stageLabel`/`stagePosition`/`stageShape`, independent of any one zone, and must have a live preview in the settings/editor UI as the organizer changes these fields.

**Regenerating a layout must never orphan a sold seat.** If an organizer edits a zone's shape parameters after seats have already sold, the regeneration routine must recognize and keep every seat that has a ticket against it (by matching on the stable `label`, or an equivalent stable identity), only adding/removing/repositioning the unsold remainder. A regeneration that would delete or renumber an already-sold seat's row is a correctness bug.

Per-layer customization: `layerColors` and `layerNotes` are JSON arrays indexed by ring/row layer, shown in the map legend and as a hover/tap tooltip on a seat (e.g. "Right at the dhol — loudest, fastest ring"), falling back to the zone's single `color`/`description` when absent.

Organizer bulk actions: block/unblock an entire row or ring in one action (one chip/click), not seat-by-seat, in addition to per-seat toggling.

---

## 10. Identifiers & codes

- **Order public ID:** short, human-shareable, e.g. `GRB`-style 3-letter prefix + 6 alphanumeric characters, globally unique.
- **Ticket code:** the string encoded into the QR and typed manually at the gate — must be unique across the whole system (not just per event), unguessable enough to prevent trivial enumeration (do not use a sequential integer), and normalized identically on generation and on lookup (uppercase, no separators, so a human re-typing it from a screenshot isn't tripped up by case or stray spaces).
- **QR payload:** encode the ticket `code` (or a URL containing it, e.g. `/t/<code>`) — whichever you choose, the gate scanner's decode step must extract exactly the same normalized code string that `scanTicket` expects.

---

## 11. Time handling

- Store every timestamp as a **Unix integer (seconds)**. Do not use a database timestamp/timestamptz column as the source of truth for business timestamps used in comparisons — integer math (`now - lastScanAt`, `startsAt < now`, day-bucketing via integer division) must be simple and portable.
- **Never use a native `datetime-local` input** for organizer-facing date/time entry. It refuses a half-filled value via an unstylable, unreword-able browser tooltip, which makes a date typed without a time look like a silent error rather than an incomplete field. Use **two independent inputs** (a date field and a time field) that validate independently, default the time to a sensible evening slot for this domain (events run at night), offer quick presets (Today / Tomorrow / This Friday, and common evening times), and echo the combined result back in plain words for the organizer to confirm. Combine them into one stored integer server-side (e.g. via one hidden field carrying the computed value) so the rest of the system only ever sees a single timestamp.
- **Render every date/time in the venue's own timezone**, not the server's or the visiting browser's — an event in Ahmedabad must show Ahmedabad-local times to an organizer in London checking the dashboard remotely, and to a buyer anywhere. Store the venue's timezone (or infer it from a required venue/city field) and use it consistently for every rendered date across the landing page, booking flow, passes, and dashboard.

---

## 12. Payments

- **Provider abstraction:** one module exposing `activeProvider()`, `createIntent(...)`, `verifyCallback(...)`. Selection is via environment configuration (`PAYMENT_PROVIDER` = `mock` default, or `razorpay` when both it and its key are configured) — **no other code in the system may know or branch on which provider is active.**
- **Mock provider:** simulates a full gateway round-trip with zero external calls and zero keys required, so the entire flow (checkout → pay → ticket issuance → gate scan) is testable/demoable offline. `verifyCallback` always succeeds for mock.
- **Real provider (Razorpay in the reference build):** `createIntent` creates a real order via the provider's API (amount in minor units, currency, a receipt id equal to our order's public ID, buyer name/phone as notes) and returns whatever the client-side checkout widget needs (key id, order id, amount, currency, prefill fields). `verifyCallback` **must cryptographically verify** the callback's signature server-side (HMAC-SHA256 of `order_id|payment_id` keyed with the provider secret, compared to the signature the provider sent) **before** any ticket is minted — a client-side "payment succeeded" message must never be trusted on its own.
- Swapping providers must be achievable by adding one more branch to this module and setting environment variables — it must require zero changes to checkout UI, order creation, or ticket minting code.

---

## 13. Organizer dashboard

### 13.1 Overview / analytics
For a selectable window (7 / 30 / 90 days / all-time) plus a "previous period" comparison, compute — in as few round-trips to the database as possible (issue independent reads concurrently rather than sequentially; the reference build fires roughly a dozen queries in parallel per page load because sequential network round-trips to a remote Postgres are the actual latency budget here):
- Totals: paid order count, tickets sold, gross revenue, net (subtotal − discounts), discounts given, fees collected, commission owed, average order value.
- Period-over-period % deltas for gross revenue and tickets sold (null when there's no prior-period baseline to compare against, not a divide-by-zero or a misleading 0%).
- **Daily sales curve** — zero-filled for quiet days (a day with no orders must appear as 0, not be omitted, or the trend line lies).
- **Revenue/sales by ticket type (zone)**, each showing sold vs. capacity vs. remaining, with a near-sold-out visual warning.
- **Sales by channel** (web / whatsapp / embed / counter).
- **Promoter/referral leaderboard**: per referral code, clicks, orders, tickets, gross, commission owed — sorted by gross descending.
- **Checked-in count**, page view count, and **conversion % = paid orders ÷ page views**.
- **Sell-through % = total sold ÷ total capacity** across all zones.
- Days-to-go until the event starts.

A cross-event **organizer home/summary** rolls up total orders/tickets/gross across every event the organizer owns.

### 13.2 Event setup / management
- **Guided setup wizard**: Details → Venue & layout → Categories → Nights → Publish, with a stepper that reflects genuinely completed steps (not just "visited"). Nothing in this wizard is a one-way door — every field it sets remains editable afterward from the same screens or from a general Settings page, and a partial-form submit from any one step must only patch the fields that step actually submitted (must not blank out fields set by other steps).
- **Tickets & seating:** create/edit zones (open or seated), price, "was" price, capacity (open only), admits-per-ticket, per-order min/max, sales cutoff window, color. Seated zones get the shape editor with the **live preview** described in Section 9.
- **Nights:** add one or generate a consecutive run; pause without deleting; per-night sold/gross figures next to each; deletion blocked once a night has sales (Section 7).
- **Orders:** searchable/filterable list; click through to an order's tickets; message the buyer their pass link (e.g. via a WhatsApp deep link — not an automated send, see Section 15); copy the order's shareable link; **cancel and release** (Section 6.7).
- **Duplicate event:** clone an event's zones, seat layouts, and codes into a new draft event — explicitly **excluding** orders, tickets, and sales counters, since organizers re-run the same show every season and want a clean slate, not last season's bookings.
- **Codes:** full CRUD for discount codes and referral codes as specified in Sections 3.8/3.9/5.
- **Attendees:** searchable/filterable list of ticket holders; CSV export. Orders list also supports CSV export.
- **Bulk seat editing:** block/unblock a whole row or ring at once (Section 9).
- **Check-in:** the gate scanner screen (Section 8).
- **Settings:** event details, cover image, convenience fee (%, flat, or both), per-order ticket limit, terms text, gate PIN, and the re-entry toggle + cooldown (Section 8.1).
- **Embed & share tab:** the three embed snippets from Section 4.1, with a live preview, plus a one-tap WhatsApp share of the event's public link.

---

## 14. Non-functional requirements

- **No floating-point money**, anywhere, including API payloads to the browser — the browser must format an integer minor-unit amount for display, never receive or send a float.
- **Server is the sole pricing authority.** Every total shown to a buyer before payment must come from the same function used at order-creation time; a client must never be able to submit an arbitrary total and have it accepted.
- **Transactional correctness for inventory** is a hard requirement — reproduce the exact hold/recheck/insert sequencing in Section 6.3 inside real database transactions, not application-level locks, since serverless deployments may run multiple instances concurrently.
- **Idempotent payment confirmation** (Section 6.5) — a webhook or callback that fires twice must never mint tickets twice.
- **Postgres-specific correctness notes** (carry these forward if targeting Postgres): `GROUP BY` expression matching is textual — a bound query parameter will not match another bound parameter used in a different place in the same query, so a literal bucket-size constant (e.g. `86400` for daily bucketing) must be written inline in the SQL rather than passed as a parameter if it needs to match a `GROUP BY` on the same expression. When grouping by one table's primary key, columns pulled in from a *joined* table must still be listed explicitly in the `GROUP BY` (or aggregated) — grouping by the primary key alone does not implicitly cover joined columns.
- **Bulk data seeding** (demo data, migrations) should batch inserts (e.g. chunks of a few hundred rows) rather than looping one insert per row — a per-row loop that's fine locally can become a very slow job across a network-hosted database.
- **No rate limiting exists in the reference build** on checkout or discount-code guessing — a production build should add rate limiting on both (repeated failed-code attempts, and repeated order-creation attempts from one source) as a hardening item; treat this as an explicit gap, not an implicit assumption of safety.

---

## 15. Explicit non-goals for this version (do not build unless separately requested)

- Automated ticket delivery via WhatsApp Business API, SMS, or email send — the system only produces a shareable link/page per pass; wiring an actual send-API (e.g. Gupshup/Interakt/Twilio) is future work.
- PDF ticket generation/download.
- Actually moving money on cancellation/refund — cancellation only voids the ticket and releases inventory; the refund itself happens in the payment gateway, outside this system.
- Multiple staff logins, roles, or permissions per organizer account.
- A scheduled/cron-based hold-reaping job — lazy reaping-on-read (Section 6.5) is the specified behavior; add a scheduler only as a reliability improvement, not a required replacement.
- Rate limiting (called out as a gap in Section 14, not in scope to design here beyond flagging it).

---

## 16. Acceptance checklist (high-signal correctness tests to build against)

- Two simultaneous checkouts for the same last seat: exactly one succeeds, the other receives a clear "just taken" error naming the seat.
- Two simultaneous checkouts for the last N units of an open category where combined demand exceeds N: total tickets issued never exceeds N.
- A discount code at its `maxRedemptions` limit is rejected on the next attempt, even under concurrent requests.
- A duplicated payment-gateway callback for the same order never results in more than one full set of tickets.
- With `allowReentry=0`: scanning a valid, not-yet-scanned ticket admits it; scanning it again is a `duplicate`, never a silent success.
- With `allowReentry=1` and no cooldown: scan in → `in`; scan again (same code) → `out`; scan again → `in` (`entryCount` now 2, message "Welcome back"); repeat indefinitely with correct state each time.
- With `allowReentry=1` and `reentryCooldownMins=30`: check out, then attempt re-entry 10 minutes later → `cooldown` with "~20 more min" messaging, ticket remains `inside=0`; attempt again after the full cooldown has elapsed → succeeds (`in`).
- `undoLastScan` after a check-out correctly restores `inside=1` (back to the prior "in" state), not just flips a flag blindly, and correctly walks back further than one step if called repeatedly.
- A season-pass ticket (`allDates=1`) shows as available/consumable capacity identically across every night of the event from a single pool, never double-charged against per-night capacity.
- Regenerating a seated zone's layout after some seats are sold preserves every sold seat's identity (no orphaned ticket pointing at a seat that no longer exists).
- A cancelled order's tickets fail every scan attempt with `invalid`/"Pass cancelled," and its seats/capacity immediately show as available again.

---

## 17. User flows (end-to-end)

Sections 17 and 18 are the behavioural companion to the rules above: Section 17 specifies **what happens, in what order, to whom**; Section 18 specifies **every screen** that implements it. Together they are sufficient to build the full interface without further design input. Where a step has a correctness rule attached, it cross-references the governing section rather than restating it.

### 17.1 Actors and entry points

| Actor | Authenticated? | Entry points | Primary surface |
|---|---|---|---|
| Buyer | No | Marketplace, direct event link (WhatsApp/Instagram), embedded widget on organiser's site, forwarded pass link | Landing page → booking flow |
| Organiser | Yes (email + password, 30-day session) | `/admin/login` | Dashboard |
| Gate staff | Yes (currently via organiser login; see §2) | `/admin/events/<id>/checkin` | Scanner |
| Promoter | No (no login in this version) | Shares a referral code; results visible to the organiser only | N/A — appears in organiser's dashboard |

### 17.2 Buyer flow — discovery to pass in hand (happy path)

```
 [Marketplace]                [Direct link / WhatsApp]        [Embed on org's site]
       |                                |                              |
       +--------------> [Landing page /e/<org>/<event>] <--------------+
                                        |                              |
                        (record page_view + referral attribution)      | (skips landing)
                                        v                              |
                              [Booking /e/<org>/<event>/book] <--------+
                                        |
             +--------------------------+--------------------------+
             |                          |                          |
     Step 1: Night picker      Step 2: Category / seat    Step 3: Details + code
     (multi-night only)        (open qty OR seat map)     (name, phone, email, code)
             |                          |                          |
             +--------------------------+--------------------------+
                                        v
                        [Server: quote cart -> hold inventory (8 min)
                                 -> create PENDING order]   (§5, §6.3, §6.4)
                                        v
                              [Payment /pay/<publicId>]
                                        v
                     [Server: verify signature -> mint tickets
                      -> release holds -> mark order PAID]  (§6.5, §12)
                                        v
                        [Order confirmation /order/<publicId>]
                                        v
                    [Individual pass /t/<code>  — one per admission]
```

**Step detail:**

| # | Step | User does | System does | Governing rule |
|---|---|---|---|---|
| 1 | Arrive at landing page | Reads event story, sees countdown and scarcity strip | Writes a `page_views` row with `source` and any referral code in the URL; increments that referral code's `clicks`; queries live inventory for the scarcity strip | §4.2 |
| 2 | Tap primary CTA | Moves to booking page | Carries night/zone preselection through if the CTA was tier-specific | §4.3 |
| 3 | Pick a night | Selects one night | Only shown when >1 active night exists; each night shows its own remaining capacity, batched in one query set across all nights | §4.3, §6.1 |
| 4 | Pick tickets | Open events: quantity stepper per zone. Seated events: taps seats on the map | Enforces `minPerOrder`/`maxPerOrder` per zone and `maxTicketsPerOrder` for the event; sold-out zones render disabled, not hidden; taken seats render unselectable | §4.3, §6.4 |
| 5 | Enter details and (optional) code | Name, phone (required), email (optional), one code box | Every keystroke-committed code change re-quotes **server-side**; the displayed total is always the server's number | §5 |
| 6 | Submit | Confirms and proceeds | Re-quotes, reserves inventory in one transaction (8-minute hold), writes a `pending` order, redirects to payment | §6.3, §6.4 |
| 7 | Pay | Completes gateway payment | Verifies the callback signature server-side **before** minting anything; mints one ticket per admission; releases the holds; marks the order paid; idempotent against duplicate callbacks | §6.5, §12 |
| 8 | Receive passes | Views passes on screen | Renders one QR per ticket, each with its own shareable `/t/<code>` link | §4.4, §10 |
| 9 | Distribute | Forwards individual pass links to friends | Each pass page is independently viewable and must not leak the rest of the order | §4.4 |

### 17.3 Buyer flow — arrival, exit and re-entry at the venue

This is the flow the re-entry feature exists for. Both variants must be built; which one runs is decided by the event's `allowReentry` flag (§8.1).

**Variant A — re-entry OFF (strict single entry):**

```
[Buyer shows QR] -> [Scan] -> ticket.inside == 0 ?
                                 |-- yes -> ADMIT: status=checked_in, inside=1,
                                 |          checkedInAt=now, entryCount+1, log scan(in)
                                 |          -> screen: "Admit N"  (green)
                                 `-- no  -> REJECT: "Already scanned", show original entry time
                                            -> screen: duplicate (red). No state change.
```

**Variant B — re-entry ON (the checkout / check-in cycle):**

```
                  first scan                 scan on the way out
[valid, outside] ------------> [INSIDE] -----------------------> [OUTSIDE, entered before]
       ^                          |                                        |
       |                          | scan again while inside                | scan on the way back
       |                          v                                        v
       |                  REJECT "Already inside"                 cooldown elapsed?
       |                  (no state change)                        |            |
       |                                                        no |            | yes
       |                                                           v            v
       |                                              REJECT "Too soon      ADMIT "Welcome back"
       |                                              to re-enter"          entryCount+1, inside=1
       |                                              (+ minutes left)      log scan(in)
       |                                                                            |
       `----------------------------- repeat any number of times -------------------'
```

**Step-by-step, with the exact state written:**

| # | Event at the gate | Mode | Precondition | System writes | Result shown |
|---|---|---|---|---|---|
| 1 | Attendee arrives, shows QR | Auto or Entry | `inside=0`, `entryCount=0` | `status=checked_in`, `inside=1`, `checkedInAt=now`, `lastScanAt=now`, `entryCount=1`, `scans(direction=in)` | `in` — "Admit {admitsCount}" |
| 2 | Attendee steps out, shows same QR | Auto or Exit | `inside=1` | `inside=0`, `lastScanAt=now`, `scans(direction=out)`. `entryCount` untouched, `checkedInAt` untouched | `out` — "Checked out · Scan again on the way back in" |
| 3 | Attendee returns, shows same QR | Auto or Entry | `inside=0`, cooldown satisfied | `inside=1`, `lastScanAt=now`, `entryCount+1`, `scans(direction=in)`. `checkedInAt` preserved from step 1 | `in` — "Welcome back · Re-entry #N" |
| 3a | Attendee returns too soon | Auto or Entry | `inside=0`, `now - lastScanAt < reentryCooldownMins × 60` | **Nothing** | `cooldown` — "Too soon to re-enter · left X min ago, wait Y more min" |
| 4 | Steps 2–3 repeat | — | — | One `scans` row per movement, forever | — |
| E1 | Pass scanned twice on entry | Auto or Entry | `inside=1` | Nothing | `duplicate` — "Already inside", shows last entry time |
| E2 | Pass scanned on exit while already out | Exit | `inside=0` | Nothing | `duplicate` — "Already outside" |
| E3 | Cancelled/refunded booking | Any | `status=cancelled` | Nothing | `invalid` — "Pass cancelled" |
| E4 | Code from another event, or nonsense | Any | no match on `(code, eventId)` | Nothing | `invalid` — "Not a valid pass" |
| E5 | Staff mis-scanned | — | any | Deletes the newest `scans` row and recomputes `inside`/`status`/`lastScanAt`/`entryCount` from the remaining history | Undo confirmation |

Full rule set, including the auto-mode direction inference and the exact undo semantics, is Section 8.

### 17.4 Organiser flow — from signup to a live, selling event

```
[Signup/Login] -> [Dashboard home] -> [New event]
                                           |
                                           v
    +-------------------- 5-step guided setup (nothing is one-way) -------------------+
    | 1 Details      title, tagline, description, cover, date/time, venue, city       |
    | 2 Venue&layout open ground OR seated; shape (grid/rings/arc); stage label,      |
    |                position, shape; live preview redraws as fields change           |
    | 3 Categories   name, price, compare-at, capacity or seat block, admits-per-      |
    |                ticket, min/max per order, colour, sales window, season-pass flag |
    | 4 Nights       single night, or generate a consecutive run; label each; pause    |
    |                without deleting                                                  |
    | 5 Publish      marketplace listing on/off, fees, per-order cap, terms, gate PIN,  |
    |                re-entry toggle + cooldown  -> status: draft -> published          |
    +---------------------------------------------------------------------------------+
                                           |
                  +------------------------+------------------------+
                  v                        v                        v
          [Share link/WhatsApp]      [Embed snippet]        [Marketplace listing]
                  |                        |                        |
                  +------------------------+------------------------+
                                           v
                                   [Sales come in]
                                           |
                      [Edit anything at any time: price, capacity,
                       layout, dates, copy — see §13.2 partial-patch rule]
```

The stepper marks steps genuinely complete (not merely visited), and a partial submit from any one step patches only the fields that step submitted — it must never blank fields owned by another step (§13.2).

### 17.5 Organiser flow — event day

```
Before doors:  [Overview] check sell-through per tier, near-sold-out warnings
                    |
Doors open:    [Check-in screen] pick lane mode: Auto | Entry-only | Exit-only
                    |
During:        scan ... scan ... scan     +--> live counters: Expected / Inside / Arrived
                    |                     +--> gate activity log (in/out, newest first)
                    |                     +--> undo last scan when mis-scanned
                    |
Concurrently:  [Overview] live sales curve, channel mix, promoter leaderboard
               [Orders]   look up a walk-up buyer, resend a pass link on WhatsApp,
                          cancel + release a seat back to sale
                    |
After:         [Attendees] CSV export; [Orders] CSV export; [Overview] final numbers
               [Duplicate event] clone zones, layouts and codes into next season's draft
```

With re-entry on, **Inside** and **Arrived** legitimately differ and must both be shown and labelled (§8.4).

### 17.6 Promoter flow

1. Organiser creates a referral code (owner name, owner phone, buyer discount, promoter commission) in **Codes**.
2. Promoter shares the code, or a landing-page link carrying it.
3. A landing-page hit carrying the code increments that code's `clicks` and attributes the `page_views` row.
4. A buyer enters the code in the same single code box used for discount codes; the buyer sees their discount, and the order stores `referralCodeId` and the computed `commissionMinor` (§5).
5. The organiser sees clicks, orders, tickets, gross and commission owed per promoter on the leaderboard, sorted by gross (§13.1).

There is no promoter login in this version — all promoter reporting is inside the organiser's dashboard.

### 17.7 Exception and edge-case flows

| Scenario | Where it surfaces | Required behaviour |
|---|---|---|
| Seat taken by another buyer mid-selection | Booking, on submit | Whole reservation aborts; error names the specific seat labels that were just taken; buyer returns to the map with their other choices intact (§6.3) |
| Open category runs out mid-selection | Booking, on submit | "Not enough tickets left in that category"; zone re-renders with its new live count (§6.3) |
| 8-minute hold expires while the buyer is on the payment page | Payment | Payment may still complete; ticket minting re-validates. If the hold is gone and inventory no longer exists, the order must not mint tickets it cannot honour — fail the order and surface a refundable-state message rather than overselling (§6.2, §6.5) |
| Buyer abandons checkout | Silent | Hold expires after 8 minutes and is reaped lazily on the next availability read; no manual cleanup needed (§6.2) |
| Payment fails or is cancelled | Payment | `failOrder`: release the cart's holds, set order status `failed`/`cancelled`; inventory returns immediately (§6.6) |
| Duplicate gateway callback | Server-side only | Second call is a safe no-op returning the already-paid order; never mints a second set of tickets (§6.5) |
| Invalid / expired / over-redeemed code | Booking, details step | Cart still prices at full price with a specific buyer-facing reason shown; submitting **with** the bad code still in the box is rejected rather than silently charging full price (§5) |
| Organiser cancels a paid order | Orders → order detail | Tickets voided (fail every future scan), inventory released, limited-use code redemption given back; **money is not moved** — the UI must say the refund has to be issued in the gateway (§6.7) |
| Organiser edits a seated layout after sales | Tickets & seating | Regeneration preserves every sold seat's identity; unsold seats may be added/removed/repositioned (§9) |
| Night already started | Booking | Rejected at order creation: "That night has already passed" (§6.4) |
| Multi-night event, no night chosen | Booking | Rejected: "Please choose which night you're coming" (§6.4) |

---

## 18. Screen-by-screen specification

### 18.1 Route map

| Route | Audience | Auth | Purpose |
|---|---|---|---|
| `/` | Buyer | No | Marketplace — all publicly listed events, search + city filter |
| `/e/<org>/<event>` | Buyer | No | Branded event landing page |
| `/e/<org>/<event>/book` | Buyer | No | Booking flow (night → tickets → details) |
| `/embed/<org>/<event>` | Buyer | No | Bare booking surface for iframe embedding |
| `/embed.js` | Host site | No | Loader script that injects the iframe and syncs its height |
| `/pay/<publicId>` | Buyer | No | Payment hand-off / gateway return |
| `/order/<publicId>` | Buyer | No | Order confirmation and status |
| `/t/<code>` | Buyer | No | A single pass, with QR — the shareable unit |
| `/admin/signup`, `/admin/login` | Organiser | No | Account creation and sign-in |
| `/admin` | Organiser | Yes | Home — cross-event roll-up and event list |
| `/admin/events/new` | Organiser | Yes | Create event |
| `/admin/events/<id>` | Organiser | Yes | Overview / analytics |
| `/admin/events/<id>/setup` | Organiser | Yes | 5-step guided setup wizard |
| `/admin/events/<id>/tickets` | Organiser | Yes | Ticket categories and seating blocks (+ layout editor) |
| `/admin/events/<id>/dates` | Organiser | Yes | Nights |
| `/admin/events/<id>/orders` | Organiser | Yes | Orders list and order detail |
| `/admin/events/<id>/attendees` | Organiser | Yes | Attendee list and export |
| `/admin/events/<id>/codes` | Organiser | Yes | Discount and referral codes |
| `/admin/events/<id>/checkin` | Gate staff | Yes | Scanner + live counters + activity log |
| `/admin/events/<id>/embed` | Organiser | Yes | Embed snippets, preview, WhatsApp share |
| `/admin/events/<id>/settings` | Organiser | Yes | Event settings, fees, terms, gate PIN, re-entry |
| `/api/events/<id>/export` | Organiser | Yes | CSV export endpoint |

### 18.2 Buyer screens

**S1 — Marketplace (`/`)**
- *Shows:* every event with `listPublicly=1` and `status=published`; per card: cover, title, date in venue timezone, venue/city, from-price.
- *Controls:* free-text search, city filter.
- *States:* loading skeleton; empty ("no events match") distinct from zero-events-at-all; error.
- *Exits:* card → S2.

**S2 — Event landing page (`/e/<org>/<event>`)**
- *Regions, in order:* hero (cover, title, tagline); live countdown to `doorsOpenAt ?? startsAt`; scarcity strip from **real** inventory ("Only 12 VIP left", "1,240 passes already booked", "Booking closes tomorrow"); event facts (date/time in venue timezone, venue with maps link); `highlights` icon row; description; priced category list with live availability and sold-out disabling; terms; sticky mobile CTA that follows the reader.
- *Branding:* organiser's logo and `brandColor`; **no competitor events anywhere on this page**.
- *On load:* write a `page_views` row (source + referral attribution); increment referral `clicks` when a code is present.
- *States:* event not found (404); draft/unpublished (404 or "not on sale"); paused ("booking closed"); past event; all categories sold out.
- *Exits:* CTA → S3.

**S3 — Booking (`/e/<org>/<event>/book`)**
Persistent context rail throughout: event name, chosen date, countdown, 3-step indicator.
- **S3a Night picker** — only when >1 active night. Each night: label (or date), start time, remaining-capacity signal, sold-out/paused state. One selection required before proceeding.
- **S3b Ticket picker (open)** — one row per zone: name, description, price (with struck-through `compareAtMinor` when set), admits-per-ticket badge for couple/family passes, live "only N left", quantity stepper bounded by `minPerOrder`/`maxPerOrder` and remaining stock. Sold-out zones **disabled and visible**, never hidden.
- **S3b′ Seat picker (seated)** — SVG seat map rendered from the shared geometry module (§9) so it is pixel-identical to the organiser's editor: per-layer colours, legend, layer note on hover/tap, taken seats unselectable, selected seats highlighted with a running count and subtotal. Zoom/pan on mobile.
- **S3c Details + code** — name, phone (required, validated), email (optional); one code box accepting **either** a discount or a referral code; server-computed price breakdown (subtotal, discount, convenience fee, total) that re-quotes on every code change; code errors shown inline with the specific reason.
- *Timer:* once inventory is held, show the 8-minute hold countdown.
- *States:* seat-clash error naming specific seats; category-exhausted error; over-limit error; invalid-code error; expired-hold recovery.
- *Exits:* submit → S4.

**S4 — Payment (`/pay/<publicId>`)**
- Mock provider: a simulated gateway page with success/fail buttons, no keys required. Real provider: the gateway's own checkout widget, prefilled with buyer name/phone/email.
- *States:* success → S5; failure/cancel → order marked failed, holds released, path back to S3; already-paid → S5 directly.

**S5 — Order confirmation (`/order/<publicId>`)**
- Order reference (`publicId`), buyer details, night, line items, full price breakdown, and every issued pass with its QR and its own `/t/<code>` link. Share affordances (WhatsApp per pass).
- *States:* pending (payment not yet confirmed — poll or refresh), paid, failed, cancelled.

**S6 — Single pass (`/t/<code>`)**
- Large QR, holder name, zone, seat label, night, admits count, event name/venue/time. Must be legible at arm's length on a dim phone screen at a gate — high contrast, large QR, no dependency on dark mode.
- **Must not expose any other ticket in the same order.**
- *States:* valid; cancelled ("this pass is no longer valid"); not found.

**S7 — Embedded booking surface (`/embed/<org>/<event>`)**
- The S3 picker only, with no landing-page selling content and no outer chrome; posts height changes to the parent so the host page's iframe never scrolls internally.

### 18.3 Organiser screens

**A1 — Login / Signup** — email + password; server-side session cookie (§2). Errors must not disclose whether an email exists.

**A2 — Home (`/admin`)** — cross-event roll-up (orders, tickets, gross); event list with status chips (draft/published/paused/closed), date, sold count; "New event"; per-event quick links.

**A3 — Overview / analytics (`/admin/events/<id>`)**
- Date-range control (7 / 30 / 90 days / all time), held in the URL so a view is shareable and survives refresh.
- Four headline tiles — tickets sold, revenue, attendees, conversion — each with a period-over-period delta (blank, not "0%", when there is no prior baseline).
- Daily sales curve, zero-filled for quiet days.
- Revenue share by ticket type; sales-by-source donut (web / whatsapp / embed / counter).
- Sell-through per tier with near-sold-out warning.
- Promoter leaderboard (clicks, orders, tickets, gross, commission owed), sorted by gross.
- Money breakdown down to commission owed; days-to-go.
- *States:* no sales yet (explain what will appear, don't render empty charts); event in the past.

**A4 — Guided setup (`/admin/events/<id>/setup`)** — the five steps of §17.4 with a stepper reflecting genuine completion; every step re-enterable; partial-patch semantics (§13.2).

**A5 — Tickets & seating (`/admin/events/<id>/tickets`)**
- List of zones with name, kind, price, capacity/seats, sold, remaining, colour, active toggle, sort order.
- Create/edit form: name, description, price, compare-at, capacity (open) or seat-block config (seated), admits-per-ticket, min/max per order, sales window, colour, season-pass flag.
- **Layout editor (seated):** shape selector (grid / rings / arc) with shape-specific fields — rows/cols, or layer count, seats in first layer, growth per layer, inner hole %, arc sweep and start angle — plus stage label/position/shape. A **live preview that redraws as the organiser types**, rendered by the same geometry module the buyer's map uses.
- Per-layer colour and note editors.
- Seat actions: click a seat to block/unblock; bulk block/unblock an entire row or ring from one control.
- *Guardrail:* regenerating a layout must visibly preserve sold seats, and the UI should say so before applying (§9).

**A6 — Nights (`/admin/events/<id>/dates`)** — list with label, date/time, active state, passes sold and gross per night; add one night; generate a consecutive run; pause/resume; delete blocked with an explanation once a night has sales.

**A7 — Orders (`/admin/events/<id>/orders`)** — searchable/filterable table (reference, buyer, phone, night, tickets, total, status, channel, time). Row → detail panel: line items, price breakdown, every issued pass, WhatsApp the buyer their pass link, copy order link, and **cancel + release** with an explicit warning that money is not refunded here (§6.7). CSV export.

**A8 — Attendees (`/admin/events/<id>/attendees`)** — one row per ticket: holder, zone, seat, night, code, check-in state (`inside` / arrived / not arrived), entry count. Searchable, filterable, CSV export.

**A9 — Codes (`/admin/events/<id>/codes`)** — two tables. *Discount codes:* code, type (% / flat / capped %), value, min tickets, min order, redemption limit, per-phone limit, zone scope, public vs. special (hidden), window, used count. *Referral codes:* code, owner name/phone, buyer discount, promoter commission, clicks, tickets, gross, commission. Create/edit/delete both.

**A10 — Check-in / gate scanner (`/admin/events/<id>/checkin`)** — specified in full below (§18.4).

**A11 — Embed & share (`/admin/events/<id>/embed`)** — the three snippets (script loader, plain iframe, button link) with copy buttons and a live preview of the embedded widget; one-tap WhatsApp share of the public link.

**A12 — Settings (`/admin/events/<id>/settings`)** — event details, cover image, convenience fee (% and/or flat per ticket), per-order ticket limit, terms, marketplace listing toggle, gate PIN, stage configuration with preview, and the **re-entry toggle plus cooldown minutes** (0–240). Duplicate-event action. Status transitions (publish / pause / close).

### 18.4 Gate scanner screen (detailed)

The single most time-critical screen in the product: it is used by non-technical staff, one-handed, in poor light, with a queue waiting.

**Layout**
- *Primary (left / full width on mobile):* camera viewfinder with a scan target overlay; a manual code entry field beneath it ("can't scan? type the code"); a lane-mode selector — **Auto · Entry only · Exit only** — with the current mode always visible, never hidden in a menu.
- *Counters, always on screen:* **Expected**, **Inside**, **Arrived** (§8.4). When re-entry is on, `Inside` and `Arrived` must be labelled so the difference is self-explanatory ("inside right now" vs "arrived at some point").
- *Secondary (right rail / below on mobile):* gate activity — last ~15 scans, newest first, each with holder name, zone, seat, code, an `in`/`out` tag and a timestamp.

**Result card — one per scan, must be readable at a glance from a metre away**

| Result | Colour treatment | Headline | Detail line | Extra |
|---|---|---|---|---|
| `in` (first entry) | Green, largest | "Admit {admitsCount}" | holder, zone, seat, night | Admit count is the number staff act on for couple/family passes |
| `in` (re-entry) | Green | "Welcome back" | "Re-entry #N" | — |
| `out` | Neutral/blue | "Checked out" | "Scan again on the way back in" | — |
| `duplicate` | Red | "Already inside" / "Already outside" | time of the last relevant scan | Offer **Undo last scan** |
| `cooldown` | Amber | "Too soon to re-enter" | "Left X min ago · wait Y more min" | Distinct from red — it is a "not yet", not a "no" |
| `invalid` | Red | "Not a valid pass" / "Pass cancelled" | reason | — |
| `error` | Neutral | "Scan or type a code" | — | — |

**Behaviours**
- Camera decoding is a convenience over the same string input a human would type; both paths call the identical server action (§8.8).
- Codes are normalised (trim, uppercase, strip whitespace) before lookup, so a re-typed code from a screenshot works.
- **Undo last scan** is available directly on the result card and in the activity log, and recomputes state from real scan history rather than flipping a flag (§8.6).
- The counters and the activity log refresh after every scan.
- Rapid consecutive scans must not double-submit the same code (debounce the decoder on an unchanged frame result).
- The screen must remain usable with an intermittent connection: surface a clear failure rather than a silent no-op, since a staff member who believes a scan succeeded will wave through an unscanned guest.

### 18.5 Cross-cutting UI requirements

- **Every screen** needs explicit loading, empty, error and success states — an empty table must explain what will fill it, not render a bare header.
- **Mobile first** for all buyer screens and the scanner; the organiser dashboard must be usable on a phone for event-day tasks (overview, orders, check-in) even if layout editing assumes a larger screen.
- **All dates and times** render in the venue's timezone, everywhere, for everyone (§11).
- **All money** renders from integer minor units with correct INR formatting (₹ and Indian digit grouping); never a float (§14).
- **Date/time entry** uses the two-field pattern with presets, never `datetime-local` (§11).
- **Destructive actions** (cancel order, delete code, delete night, regenerate layout) require confirmation and state their consequence in plain words — especially cancellation, which must say the refund is not issued by this system (§6.7).
- **Accessibility:** seat maps need a non-visual alternative (a list of available seats per layer with labels and prices); colour is never the only carrier of meaning in the scanner results or seat legend; all interactive targets meet minimum touch-target size.
