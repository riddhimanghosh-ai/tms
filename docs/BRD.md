# Business Requirements Document (BRD)

**Product:** Rasana — ticketing for live events
**Repository:** https://github.com/riddhimanghosh-ai/tms
**Document owner:** Riddhiman Ghosh
**Version:** 1.0 — 2026-09-11

---

## 1. Purpose of this document

This BRD describes the *business* problem Rasana solves, who it solves it for, and how people actually move through it — with no technology, code, or system design in it. It is the reference for anyone deciding what the product should do. The companion **PRD** covers how it is built.

---

## 2. Background & problem statement

Event organisers in India running ground events (Garba/dandiya nights, festivals, live shows) currently rely on a patchwork of WhatsApp broadcasts, spreadsheets, third-party ticketing platforms that plaster a competitor's brand on the organiser's own event page, and manual guest-list checks at the door. This creates four recurring problems:

1. **Brand dilution.** Generic ticketing platforms show other organisers' events next to (or instead of) the one the buyer came to book, and take a cut while doing it.
2. **No control over seating or pricing structure.** Ground events with concentric floor layouts, tiered stands, or multi-night runs don't fit a simple "GA / VIP" ticket type.
3. **Manual, error-prone door management.** Guest lists on paper or spreadsheets can't stop duplicate entry, can't tell an organiser how many people are inside right now, and can't handle someone stepping out and coming back without either re-admitting fraudulently or turning away a genuine ticket holder.
4. **No visibility into what's actually selling.** Organisers find out an event undersold, or a category oversold, only after the fact.

## 3. Business goals

- Give an organiser a **fully branded** booking experience — their own link, their own site, their own WhatsApp share — with no competitor exposure.
- Support the **seating realities of Indian ground events**: multi-night runs, concentric rings around a dance floor, curved stands, season passes, couple/family admission.
- Replace manual door lists with a **reliable, fast, fraud-resistant check-in process**, including safe handling of attendees who leave and return.
- Give organisers a **real-time, trustworthy picture** of sales, revenue, promoter performance and attendance — not a spreadsheet reconciled after the event.
- Keep every **price and discount decision authoritative and tamper-proof**, so what a buyer is charged is never something their browser can influence.

## 4. Scope

### In scope
- Event creation and configuration (single events and multi-night runs)
- Three ways an event is sold: the shared marketplace, the organiser's own branded page, and an embed on the organiser's own website
- Seat/zone-based and open-capacity ticket sales
- Discount codes and promoter referral codes with commission tracking
- Checkout and payment (mock provider for demos; Razorpay for real transactions)
- Digital passes with QR codes
- Gate check-in, **including check-out and re-entry** for attendees who leave the venue and return
- Organiser dashboard: sales analytics, orders, attendees, seating/pricing management, codes, settings

### Out of scope (explicitly, for this version)
- Automated ticket delivery via WhatsApp/SMS/email (today it is a shareable link the organiser or buyer sends manually)
- Refund processing (the tool voids a booking and frees the seat; moving the money back happens in the payment gateway, outside this tool)
- Multiple staff logins or role-based permissions per organiser (one login per organiser account)
- Any assistance with international payment methods or currencies beyond INR

## 5. User personas

### 5.1 The Organiser (primary business user)
A person or small team running one or more paid live events — most often festive-season Garba/dandiya series, but also single-night concerts or ground shows. They are commercially savvy about their own event (pricing tiers, seating, promoters) but are not a technical operator. They need to set up an event once, adjust it as sales come in, hand a working scanner to gate staff on the night, and see how the event performed.

**Needs:** fast setup, full control over pricing/seating without needing a developer, a booking link they can put on WhatsApp/Instagram immediately, confidence that the numbers on the dashboard are real, and a door process gate staff can run with zero training beyond "point the camera."

### 5.2 The Buyer (ticket purchaser / attendee)
Someone who wants to attend one or more nights of an event, sometimes with a group, sometimes wanting a specific seat or floor position (e.g., closest to the dhol). They discover the event via a WhatsApp forward, an Instagram bio link, or by browsing the Rasana marketplace.

**Needs:** clear pricing and availability before committing, a simple two-step decision (pick a night, pick a category/seat), confidence the price shown is the price charged, a pass they can screenshot or forward to whoever is holding the phone at the gate, and — crucially — the ability to step out during the event (food, parking, a phone call) and get back in without being treated as a fraud attempt.

### 5.3 The Promoter / Affiliate
An individual (often a dance instructor, influencer, or community connector) who drives ticket sales in exchange for a commission, using a personal referral code.

**Needs:** a code they can hand out that gives their audience a discount, visibility into how many clicks/sales/commission they've generated, and trust that the commission is calculated correctly and automatically.

### 5.4 Gate Staff
Whoever is standing at the entrance on the night, often not the organiser themselves and not necessarily tech-comfortable. They may rotate through several people over the course of a long event.

**Needs:** a single, obvious screen — point the phone camera at a QR code, get an immediate and unambiguous "let them in" / "don't let them in" / "already used" signal, and a simple way to fix an accidental double-scan.

## 6. User flows

### 6.1 Organiser: set up and publish an event
1. Sign up / log in to the organiser dashboard.
2. Create an event — name, description, dates, venue, cover image.
3. Choose how tickets are structured: open-ground priced categories, or a seated layout (straight rows, concentric rings, or a curved arc around a stage).
4. If seated, arrange the layout, name and colour each section/ring, and set per-section pricing. If multi-night, add each night (or generate a whole consecutive run at once) and mark any category that should act as an all-nights season pass.
5. Set fees, per-order ticket limits, terms, and (optionally) discount codes and promoter referral codes.
6. Decide how the event will be sold: listed on the shared Rasana marketplace, its own branded link, embedded into the organiser's own website — any combination.
7. Publish. The organiser can keep editing price, capacity, layout, dates and copy at any time after publishing — nothing is locked in.
8. Share the link on WhatsApp/Instagram, or hand the embed snippet to whoever runs the organiser's website.

### 6.2 Buyer: discover and book
1. Buyer arrives at the event via the marketplace, a direct link, or an embedded widget on the organiser's site.
2. **Landing page (touchpoint):** sees the event's story, countdown to doors, live scarcity signals ("Only 12 VIP left," "1,240 already booked"), venue details with a map link, and the list of priced categories.
3. Buyer taps to book, moving to the **booking page (touchpoint)**, which keeps the date, countdown and step indicator visible throughout.
4. If the event runs multiple nights, the buyer first chooses which night(s) they're attending.
5. Buyer picks a category (and, for seated events, specific seats on a visual seat map) and enters quantity.
6. Buyer optionally enters a discount or referral code; the price recalculates immediately and transparently.
7. Buyer enters their name, phone number, and (optionally) email.
8. Buyer proceeds to payment.
9. On successful payment, the buyer immediately receives their digital pass(es) with a QR code — viewable on screen and shareable as an individual link per pass, so a buyer holding a group booking can forward one pass to each friend.

### 6.3 Buyer: attend the event, with check-out / re-entry
This is the flow that matters most on the night, and the one this document calls out specifically because manual guest lists cannot handle it.

1. Buyer arrives at the gate and shows their QR pass (on their phone or a friend's).
2. Gate staff scans it. If this is the buyer's first scan, they are admitted and the "inside" count goes up.
3. **If the organiser has turned re-entry on for this event** (the expected setting for most multi-hour ground events): if the buyer steps outside — smoke break, moving the car, taking a call — the *same* QR is shown again at the gate on the way out. This is recognised as a **check-out**, not a duplicate: the buyer is marked as outside, and the "inside" count goes down.
4. The buyer can then re-enter later by showing the *same* QR again. This is recognised as a **check-in / re-entry**, not a duplicate, because the pass's last recorded state was "outside." The "inside" count goes back up.
5. This can repeat any number of times over the course of the event. Every exit and entry is timestamped and kept as a record gate staff and the organiser can review afterward.
6. If the organiser wants to discourage someone handing their pass back over the fence to a second person immediately after checking out, they can set a minimum wait time between an exit and the next entry for that event; a buyer trying to re-enter sooner is told how much longer to wait, rather than being blocked outright.
7. **If the organiser has left re-entry off** (appropriate for one-time, single-entry, no-return events): any second scan of the same pass, regardless of intent, is flagged as a duplicate/already-used, exactly as before. This preserves strict single-entry control where the organiser wants it.
8. If gate staff scan the wrong pass or scan by mistake, the most recent scan can be reversed on the spot without needing to contact the organiser.

### 6.4 Organiser: monitor the event
1. Organiser opens the dashboard at any time — before, during, or after the event.
2. Views headline numbers (tickets sold, revenue, attendees, conversion rate) for a selectable date range, each with a comparison against the prior period.
3. Reviews a daily sales trend, revenue split by ticket type, sales-by-channel (web / WhatsApp / embed / walk-up), sell-through per category with near-sold-out warnings, and promoter/referral performance including commission owed.
4. During the event, watches a live "how many people are inside right now" count (which, with re-entry on, is distinct from "how many have ever arrived").
5. Manages orders — looking up a specific booking, messaging a buyer their pass link, or cancelling an order and releasing its seats/capacity back to sale if a buyer cancels.
6. Exports order and attendee lists for their own records.

### 6.5 Promoter: drive and track referrals
1. Promoter receives a referral code from the organiser.
2. Shares the code with their audience; each use gives the buyer a discount and earns the promoter a tracked commission.
3. Organiser (or, in future, the promoter directly) can see clicks, tickets sold, and commission earned per code.

## 7. Touchpoints summary

| Touchpoint | Who | Purpose |
|---|---|---|
| Organiser dashboard (setup) | Organiser | Build and configure the event |
| Shared marketplace listing | Buyer | Discover events by city/search |
| Organiser's own event page | Buyer | Branded, competitor-free landing + booking |
| Embedded widget on organiser's site | Buyer | Book without leaving the organiser's own website |
| WhatsApp / social share link | Buyer, Organiser | Distribution of the booking link and of individual passes |
| Payment gateway | Buyer | Complete purchase |
| Digital pass (on-screen / shareable link) | Buyer | Proof of ticket, scanned at the gate |
| Gate scanner | Gate staff | Check-in, check-out, re-entry |
| Organiser dashboard (live ops) | Organiser | Monitor sales and attendance in real time |
| Organiser dashboard (orders/attendees) | Organiser | Manage bookings, cancellations, exports |

## 8. Success criteria

- An organiser can take an event from creation to a shareable, working booking link without outside technical help.
- A buyer can complete a purchase in two short steps and receive a usable pass immediately.
- No two buyers can ever be sold the same seat, and no buyer is ever charged a different amount than what was quoted to them.
- Gate staff can process a queue of attendees, including repeated exits and re-entries, without false "duplicate" rejections when re-entry is enabled, and without any way to reuse a pass fraudulently when it is disabled.
- The organiser's dashboard numbers (sales, revenue, attendance) are trustworthy enough to be used for on-the-spot decisions during the event (e.g., "are we near sell-out on VIP?").

## 9. Known business-level gaps (current version)

- Pass delivery to the buyer's phone is a link the buyer/organiser shares manually — there is no automatic WhatsApp/SMS/email send yet.
- Cancelling a booking releases the seat and voids the pass, but the actual refund of money still has to be issued separately in the payment gateway.
- Each organiser account has a single login; there is no separate, restricted login for gate staff or other team members yet.
