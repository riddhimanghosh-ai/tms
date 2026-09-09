import { sql } from "drizzle-orm";
import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

const now = sql`(unixepoch())`;

/** A tenant. One Garba/event company. Everything else hangs off this. */
export const organizers = sqliteTable(
  "organizers",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    phone: text("phone"),
    logoUrl: text("logo_url"),
    brandColor: text("brand_color").notNull().default("#e11d48"),
    supportPhone: text("support_phone"),
    createdAt: integer("created_at").notNull().default(now),
  },
  (t) => [
    uniqueIndex("organizers_slug_idx").on(t.slug),
    uniqueIndex("organizers_email_idx").on(t.email),
  ],
);

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  organizerId: text("organizer_id")
    .notNull()
    .references(() => organizers.id, { onDelete: "cascade" }),
  expiresAt: integer("expires_at").notNull(),
  createdAt: integer("created_at").notNull().default(now),
});

/**
 * layoutType drives the whole booking UX:
 *  - "open"   : open ground. Zones are just priced buckets with a capacity.
 *  - "seated" : zones own a seat grid and buyers pick specific seats.
 */
export const events = sqliteTable(
  "events",
  {
    id: text("id").primaryKey(),
    organizerId: text("organizer_id")
      .notNull()
      .references(() => organizers.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    tagline: text("tagline"),
    description: text("description"),
    venue: text("venue"),
    city: text("city"),
    address: text("address"),
    coverImageUrl: text("cover_image_url"),
    startsAt: integer("starts_at").notNull(),
    endsAt: integer("ends_at"),
    doorsOpenAt: integer("doors_open_at"),
    layoutType: text("layout_type").notNull().default("open"), // open | seated
    status: text("status").notNull().default("draft"), // draft | published | paused | closed
    currency: text("currency").notNull().default("INR"),
    /** Convenience fee charged to the buyer, in basis points (250 = 2.5%). */
    bookingFeeBps: integer("booking_fee_bps").notNull().default(0),
    /** Flat per-ticket fee in paise, added on top of the percentage fee. */
    bookingFeeFlatMinor: integer("booking_fee_flat_minor").notNull().default(0),
    maxTicketsPerOrder: integer("max_tickets_per_order").notNull().default(10),
    terms: text("terms"),
    /** PIN typed by gate staff to open the scanner without a full login. */
    gatePin: text("gate_pin"),
    /** What the focal point is called on the seat map: STAGE, SCREEN, DHOL… */
    stageLabel: text("stage_label").notNull().default("STAGE"),
    /** auto | top | bottom | left | right | centre */
    stagePosition: text("stage_position").notNull().default("auto"),
    /** auto | bar | curve | circle | none */
    stageShape: text("stage_shape").notNull().default("auto"),
    createdAt: integer("created_at").notNull().default(now),
  },
  (t) => [
    uniqueIndex("events_org_slug_idx").on(t.organizerId, t.slug),
    index("events_org_idx").on(t.organizerId),
  ],
);

/**
 * One night of a multi-night event. A Garba runs nine of these; a one-off show
 * has a single row. Inventory, seats and passes are all scoped to a night.
 */
export const eventDates = sqliteTable(
  "event_dates",
  {
    id: text("id").primaryKey(),
    eventId: text("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    startsAt: integer("starts_at").notNull(),
    endsAt: integer("ends_at"),
    /** "Night 1 — Opening", "Finale". Falls back to the date itself. */
    label: text("label"),
    note: text("note"),
    active: integer("active").notNull().default(1),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [index("event_dates_event_idx").on(t.eventId)],
);

/** A priced bucket. "VIP Pass", "Couple Entry", "Balcony Block B". */
export const zones = sqliteTable(
  "zones",
  {
    id: text("id").primaryKey(),
    eventId: text("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    kind: text("kind").notNull().default("open"), // open | seated
    /**
     * How a seated zone is laid out on screen and how its seats are generated:
     *   grid  — straight rows of seats (auditorium, blocks)
     *   rings — concentric circles around a centre point (akhada, garba ground)
     *   arc   — curved rows fanning around a stage (amphitheatre)
     */
    shape: text("shape").notNull().default("grid"),
    priceMinor: integer("price_minor").notNull().default(0),
    /** Struck-through "was" price, purely cosmetic. */
    compareAtMinor: integer("compare_at_minor"),
    /** Only meaningful for kind = "open"; seated zones derive it from seats. */
    capacity: integer("capacity").notNull().default(0),
    /** How many people one ticket admits — makes couple/family passes work. */
    admitsCount: integer("admits_count").notNull().default(1),
    minPerOrder: integer("min_per_order").notNull().default(1),
    maxPerOrder: integer("max_per_order").notNull().default(10),
    color: text("color").notNull().default("#e11d48"),
    rows: integer("rows").notNull().default(0),
    cols: integer("cols").notNull().default(0),
    /** rings/arc: how many concentric layers, counted outwards. */
    ringCount: integer("ring_count").notNull().default(0),
    /** rings/arc: seats in the innermost layer. */
    ringStartSeats: integer("ring_start_seats").notNull().default(12),
    /** rings/arc: extra seats added to each layer as it grows outwards. */
    ringSeatStep: integer("ring_seat_step").notNull().default(6),
    /** rings/arc: degrees the layers sweep. 360 = full circle, 180 = half. */
    arcSpanDeg: integer("arc_span_deg").notNull().default(360),
    /** rings/arc: where the sweep starts, so an arc can face the stage. */
    arcStartDeg: integer("arc_start_deg").notNull().default(0),
    /** rings/arc: empty space in the middle, as a share of the radius (0-90). */
    innerHolePct: integer("inner_hole_pct").notNull().default(35),
    /** 1 = one ticket covers every night (a season pass). */
    allDates: integer("all_dates").notNull().default(0),
    /** JSON array of hex colours, one per layer. Falls back to `color`. */
    layerColors: text("layer_colors"),
    /** JSON array of short notes, one per layer, shown to buyers. */
    layerNotes: text("layer_notes"),
    salesStartAt: integer("sales_start_at"),
    salesEndAt: integer("sales_end_at"),
    active: integer("active").notNull().default(1),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [index("zones_event_idx").on(t.eventId)],
);

export const seats = sqliteTable(
  "seats",
  {
    id: text("id").primaryKey(),
    zoneId: text("zone_id")
      .notNull()
      .references(() => zones.id, { onDelete: "cascade" }),
    eventId: text("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    rowLabel: text("row_label").notNull(),
    seatNumber: integer("seat_number").notNull(),
    label: text("label").notNull(),
    /** available | blocked — "sold" is derived from tickets, never stored here. */
    status: text("status").notNull().default("available"),
    /** Grid coordinates. For rings these mirror ringIndex / posInRing. */
    x: integer("x").notNull().default(0),
    y: integer("y").notNull().default(0),
    /** rings/arc: which layer this seat sits on, 0 = innermost. */
    ringIndex: integer("ring_index").notNull().default(0),
    /** rings/arc: position along that layer, 0-based. */
    posInRing: integer("pos_in_ring").notNull().default(0),
    /** rings/arc: how many seats that layer holds, so geometry is stable. */
    ringSize: integer("ring_size").notNull().default(0),
  },
  (t) => [
    index("seats_zone_idx").on(t.zoneId),
    index("seats_event_idx").on(t.eventId),
    uniqueIndex("seats_zone_label_idx").on(t.zoneId, t.label),
  ],
);

/** Short-lived reservation so two buyers can't race for the same seat. */
export const seatHolds = sqliteTable(
  "seat_holds",
  {
    id: text("id").primaryKey(),
    eventId: text("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    seatId: text("seat_id").references(() => seats.id, { onDelete: "cascade" }),
    zoneId: text("zone_id")
      .notNull()
      .references(() => zones.id, { onDelete: "cascade" }),
    /** Seat holds use 1; open-ground holds reserve a slice of capacity. */
    qty: integer("qty").notNull().default(1),
    cartId: text("cart_id").notNull(),
    showDateId: text("show_date_id").references(() => eventDates.id, {
      onDelete: "cascade",
    }),
    expiresAt: integer("expires_at").notNull(),
  },
  (t) => [
    uniqueIndex("seat_holds_seat_idx").on(t.seatId, t.showDateId),
    index("seat_holds_cart_idx").on(t.cartId),
    index("seat_holds_event_idx").on(t.eventId),
  ],
);

export const discountCodes = sqliteTable(
  "discount_codes",
  {
    id: text("id").primaryKey(),
    organizerId: text("organizer_id")
      .notNull()
      .references(() => organizers.id, { onDelete: "cascade" }),
    /** null = usable on every event of this organizer. */
    eventId: text("event_id").references(() => events.id, {
      onDelete: "cascade",
    }),
    code: text("code").notNull(),
    label: text("label"),
    /** percent | flat — flat is in paise off the order. */
    type: text("type").notNull().default("percent"),
    value: integer("value").notNull().default(0),
    /** Caps a percent discount, in paise. null = uncapped. */
    maxDiscountMinor: integer("max_discount_minor"),
    minTickets: integer("min_tickets").notNull().default(1),
    minOrderMinor: integer("min_order_minor").notNull().default(0),
    /** null = unlimited. */
    maxRedemptions: integer("max_redemptions"),
    /** Cap per phone number, stops one person draining the code. */
    maxPerBuyer: integer("max_per_buyer").notNull().default(1),
    usedCount: integer("used_count").notNull().default(0),
    /** null = every zone. */
    zoneId: text("zone_id").references(() => zones.id, { onDelete: "cascade" }),
    /** "special" codes are hidden invite-only passes, not public offers. */
    kind: text("kind").notNull().default("public"), // public | special
    startsAt: integer("starts_at"),
    endsAt: integer("ends_at"),
    active: integer("active").notNull().default(1),
    createdAt: integer("created_at").notNull().default(now),
  },
  (t) => [
    uniqueIndex("discount_codes_scope_idx").on(t.organizerId, t.code),
    index("discount_codes_event_idx").on(t.eventId),
  ],
);

/** A promoter's code: buyer gets a discount, promoter earns a commission. */
export const referralCodes = sqliteTable(
  "referral_codes",
  {
    id: text("id").primaryKey(),
    organizerId: text("organizer_id")
      .notNull()
      .references(() => organizers.id, { onDelete: "cascade" }),
    eventId: text("event_id").references(() => events.id, {
      onDelete: "cascade",
    }),
    code: text("code").notNull(),
    ownerName: text("owner_name").notNull(),
    ownerPhone: text("owner_phone"),
    /** Discount handed to the buyer. */
    discountType: text("discount_type").notNull().default("flat"),
    discountValue: integer("discount_value").notNull().default(0),
    /** Commission owed to the promoter. */
    commissionType: text("commission_type").notNull().default("percent"),
    commissionValue: integer("commission_value").notNull().default(0),
    clicks: integer("clicks").notNull().default(0),
    active: integer("active").notNull().default(1),
    createdAt: integer("created_at").notNull().default(now),
  },
  (t) => [
    uniqueIndex("referral_codes_scope_idx").on(t.organizerId, t.code),
    index("referral_codes_event_idx").on(t.eventId),
  ],
);

export const orders = sqliteTable(
  "orders",
  {
    id: text("id").primaryKey(),
    /** Short human-shareable reference, e.g. GRB-8K2QD4. */
    publicId: text("public_id").notNull(),
    eventId: text("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    organizerId: text("organizer_id")
      .notNull()
      .references(() => organizers.id, { onDelete: "cascade" }),
    showDateId: text("show_date_id").references(() => eventDates.id, {
      onDelete: "set null",
    }),
    showDateLabel: text("show_date_label"),
    buyerName: text("buyer_name").notNull(),
    buyerPhone: text("buyer_phone").notNull(),
    buyerEmail: text("buyer_email"),
    subtotalMinor: integer("subtotal_minor").notNull().default(0),
    discountMinor: integer("discount_minor").notNull().default(0),
    feeMinor: integer("fee_minor").notNull().default(0),
    totalMinor: integer("total_minor").notNull().default(0),
    commissionMinor: integer("commission_minor").notNull().default(0),
    discountCodeId: text("discount_code_id").references(() => discountCodes.id),
    referralCodeId: text("referral_code_id").references(() => referralCodes.id),
    ticketCount: integer("ticket_count").notNull().default(0),
    status: text("status").notNull().default("pending"), // pending | paid | failed | cancelled | refunded
    paymentProvider: text("payment_provider"),
    paymentRef: text("payment_ref"),
    /** Where the buyer came from: web | whatsapp | embed | counter. */
    channel: text("channel").notNull().default("web"),
    notes: text("notes"),
    createdAt: integer("created_at").notNull().default(now),
    paidAt: integer("paid_at"),
  },
  (t) => [
    uniqueIndex("orders_public_id_idx").on(t.publicId),
    index("orders_event_idx").on(t.eventId),
    index("orders_phone_idx").on(t.buyerPhone),
    index("orders_created_idx").on(t.createdAt),
  ],
);

export const orderItems = sqliteTable(
  "order_items",
  {
    id: text("id").primaryKey(),
    orderId: text("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    zoneId: text("zone_id")
      .notNull()
      .references(() => zones.id, { onDelete: "cascade" }),
    zoneName: text("zone_name").notNull(),
    qty: integer("qty").notNull().default(1),
    unitPriceMinor: integer("unit_price_minor").notNull().default(0),
  },
  (t) => [index("order_items_order_idx").on(t.orderId)],
);

/** One row per admitted ticket. This is what the QR at the gate resolves to. */
export const tickets = sqliteTable(
  "tickets",
  {
    id: text("id").primaryKey(),
    code: text("code").notNull(),
    orderId: text("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    eventId: text("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    zoneId: text("zone_id")
      .notNull()
      .references(() => zones.id, { onDelete: "cascade" }),
    zoneName: text("zone_name").notNull(),
    seatId: text("seat_id").references(() => seats.id, { onDelete: "set null" }),
    seatLabel: text("seat_label"),
    showDateId: text("show_date_id").references(() => eventDates.id, {
      onDelete: "set null",
    }),
    /** Denormalised so a pass still reads correctly if a night is renamed. */
    showDateLabel: text("show_date_label"),
    showDateStartsAt: integer("show_date_starts_at"),
    holderName: text("holder_name"),
    admitsCount: integer("admits_count").notNull().default(1),
    status: text("status").notNull().default("valid"), // valid | checked_in | cancelled
    checkedInAt: integer("checked_in_at"),
    checkedInBy: text("checked_in_by"),
    createdAt: integer("created_at").notNull().default(now),
  },
  (t) => [
    uniqueIndex("tickets_code_idx").on(t.code),
    index("tickets_event_idx").on(t.eventId),
    index("tickets_order_idx").on(t.orderId),
    index("tickets_seat_idx").on(t.seatId),
    index("tickets_date_idx").on(t.showDateId),
  ],
);

/** Landing-page view counter, so conversion rate is a real number. */
export const pageViews = sqliteTable(
  "page_views",
  {
    id: text("id").primaryKey(),
    eventId: text("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    source: text("source").notNull().default("web"),
    referralCode: text("referral_code"),
    createdAt: integer("created_at").notNull().default(now),
  },
  (t) => [index("page_views_event_idx").on(t.eventId)],
);

export type Organizer = typeof organizers.$inferSelect;
export type Event = typeof events.$inferSelect;
export type EventDate = typeof eventDates.$inferSelect;
export type Zone = typeof zones.$inferSelect;
export type Seat = typeof seats.$inferSelect;
export type Order = typeof orders.$inferSelect;
export type OrderItem = typeof orderItems.$inferSelect;
export type Ticket = typeof tickets.$inferSelect;
export type DiscountCode = typeof discountCodes.$inferSelect;
export type ReferralCode = typeof referralCodes.$inferSelect;
