"use client";

import { useActionState, useState, useTransition } from "react";
import {
  deleteCode,
  saveDiscountCode,
  saveReferralCode,
} from "@/app/admin/actions";
import {
  FormError,
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  SectionTitle,
  Select,
  cn,
} from "@/components/ui";
import { formatMinor } from "@/lib/money";

type Discount = {
  id: string;
  eventId: string | null;
  code: string;
  label: string | null;
  type: string;
  value: number;
  maxDiscountMinor: number | null;
  minTickets: number;
  minOrderMinor: number;
  maxRedemptions: number | null;
  maxPerBuyer: number;
  usedCount: number;
  zoneId: string | null;
  kind: string;
  endsAt: number | null;
  active: number;
};

type Referral = {
  id: string;
  code: string;
  ownerName: string;
  ownerPhone: string | null;
  discountType: string;
  discountValue: number;
  commissionType: string;
  commissionValue: number;
  clicks: number;
  active: number;
  orders: number;
  tickets: number;
  gross: number;
  commission: number;
};

export function CodesManager({
  eventId,
  publicBase,
  zones,
  discounts,
  referrals,
}: {
  eventId: string;
  publicBase: string;
  zones: { id: string; name: string }[];
  discounts: Discount[];
  referrals: Referral[];
}) {
  const [tab, setTab] = useState<"discount" | "referral">("discount");
  const [editing, setEditing] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-lg border border-ink-700 bg-ink-900 p-1">
          {(
            [
              ["discount", `Discount & special codes (${discounts.length})`],
              ["referral", `Referral codes (${referrals.length})`],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => {
                setTab(key);
                setEditing(null);
              }}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm transition",
                tab === key ? "bg-ink-700 text-ink-50" : "text-ink-400 hover:text-ink-100",
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <Button size="sm" onClick={() => setEditing("new")}>
          New {tab === "discount" ? "discount code" : "referral code"}
        </Button>
      </div>

      {editing && tab === "discount" ? (
        <DiscountForm
          eventId={eventId}
          zones={zones}
          code={editing === "new" ? null : discounts.find((d) => d.id === editing)!}
          onDone={() => setEditing(null)}
        />
      ) : null}

      {editing && tab === "referral" ? (
        <ReferralForm
          eventId={eventId}
          code={editing === "new" ? null : referrals.find((r) => r.id === editing)!}
          onDone={() => setEditing(null)}
        />
      ) : null}

      {tab === "discount" ? (
        discounts.length === 0 ? (
          <EmptyState
            title="No discount codes yet"
            body="Create an early-bird percentage, a flat ₹ off, a group deal, or a hidden 100%-off pass for sponsors and guests."
          />
        ) : (
          <div className="grid gap-3">
            {discounts.map((d) => (
              <Card key={d.id} className="flex flex-wrap items-start justify-between gap-4 p-4">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2">
                    <code className="rounded bg-ink-800 px-2 py-0.5 font-mono text-sm">{d.code}</code>
                    {d.kind === "special" ? <Badge tone="brand">special / hidden</Badge> : null}
                    {!d.active ? <Badge tone="amber">off</Badge> : null}
                    {d.eventId == null ? <Badge>all events</Badge> : null}
                  </p>
                  <p className="mt-1.5 text-sm">
                    <span className="font-medium">
                      {d.type === "percent" ? `${d.value}% off` : `${formatMinor(d.value)} off`}
                    </span>
                    {d.maxDiscountMinor ? (
                      <span className="text-ink-400"> · capped at {formatMinor(d.maxDiscountMinor)}</span>
                    ) : null}
                    {d.zoneId ? (
                      <span className="text-ink-400">
                        {" "}· only {zones.find((z) => z.id === d.zoneId)?.name}
                      </span>
                    ) : null}
                    {d.minTickets > 1 ? (
                      <span className="text-ink-400"> · min {d.minTickets} tickets</span>
                    ) : null}
                  </p>
                  <p className="tabular mt-1 text-xs text-ink-400">
                    Used {d.usedCount}
                    {d.maxRedemptions ? ` of ${d.maxRedemptions}` : " times"}
                    {d.endsAt
                      ? ` · ends ${new Date(d.endsAt * 1000).toLocaleDateString("en-IN")}`
                      : ""}
                  </p>
                  {d.maxRedemptions ? (
                    <div className="mt-2 h-1.5 w-48 overflow-hidden rounded-full bg-ink-800">
                      <div
                        className="h-full rounded-full bg-brand-600"
                        style={{ width: `${Math.min(100, (d.usedCount / d.maxRedemptions) * 100)}%` }}
                      />
                    </div>
                  ) : null}
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="secondary" onClick={() => setEditing(d.id)}>
                    Edit
                  </Button>
                  <DeleteButton kind="discount" codeId={d.id} eventId={eventId} />
                </div>
              </Card>
            ))}
          </div>
        )
      ) : referrals.length === 0 ? (
        <EmptyState
          title="No referral codes yet"
          body="Give each promoter, college rep or DJ their own code. Buyers get a discount, you see exactly who drove the sale and what commission is owed."
        />
      ) : (
        <div className="grid gap-3">
          {referrals.map((r) => (
            <Card key={r.id} className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2">
                    <code className="rounded bg-ink-800 px-2 py-0.5 font-mono text-sm">{r.code}</code>
                    <span className="font-medium">{r.ownerName}</span>
                    {!r.active ? <Badge tone="amber">off</Badge> : null}
                  </p>
                  <p className="mt-1 text-sm text-ink-400">
                    Buyer saves{" "}
                    {r.discountType === "percent"
                      ? `${r.discountValue}%`
                      : formatMinor(r.discountValue)}{" "}
                    · promoter earns{" "}
                    {r.commissionType === "percent"
                      ? `${r.commissionValue}%`
                      : formatMinor(r.commissionValue)}
                  </p>
                  <ShareLink url={`${publicBase}?ref=${r.code}`} />
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="secondary" onClick={() => setEditing(r.id)}>
                    Edit
                  </Button>
                  <DeleteButton kind="referral" codeId={r.id} eventId={eventId} />
                </div>
              </div>

              <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-ink-800 pt-3 sm:grid-cols-4">
                {[
                  ["Link clicks", r.clicks.toLocaleString("en-IN")],
                  ["Tickets", r.tickets.toLocaleString("en-IN")],
                  ["Sales driven", formatMinor(r.gross)],
                  ["Commission owed", formatMinor(r.commission)],
                ].map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-xs text-ink-400">{k}</dt>
                    <dd className="tabular mt-0.5 font-medium">{v}</dd>
                  </div>
                ))}
              </dl>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function ShareLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  const full = typeof window !== "undefined" ? `${window.location.origin}${url}` : url;
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard.writeText(full);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="mt-2 max-w-full truncate rounded bg-ink-850 px-2 py-1 text-left font-mono text-xs text-ink-300 hover:text-ink-50"
    >
      {copied ? "Copied ✓" : full}
    </button>
  );
}

function DeleteButton({
  kind,
  codeId,
  eventId,
}: {
  kind: "discount" | "referral";
  codeId: string;
  eventId: string;
}) {
  const [pending, start] = useTransition();
  return (
    <Button
      size="sm"
      variant="danger"
      disabled={pending}
      onClick={() => start(() => void deleteCode(kind, codeId, eventId))}
    >
      Delete
    </Button>
  );
}

function DiscountForm({
  eventId,
  zones,
  code,
  onDone,
}: {
  eventId: string;
  zones: { id: string; name: string }[];
  code: Discount | null;
  onDone: () => void;
}) {
  const [state, action, pending] = useActionState(saveDiscountCode, undefined);
  const [type, setType] = useState(code?.type ?? "percent");
  if (state && "ok" in state && state.ok) queueMicrotask(onDone);

  return (
    <Card className="border-brand-600/40 bg-brand-600/[0.04] p-5">
      <SectionTitle
        title={code ? `Edit ${code.code}` : "New discount code"}
        hint="Percentage, flat amount, group deal, or a hidden 100% pass for guests."
      />
      <form action={action} className="space-y-4">
        <input type="hidden" name="eventId" value={eventId} />
        <input type="hidden" name="codeId" value={code?.id ?? ""} />

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Code" hint="Buyers type this at checkout.">
            <Input
              name="code"
              defaultValue={code?.code}
              placeholder="EARLYBIRD"
              className="font-mono uppercase"
              required
            />
          </Field>
          <Field label="Internal label">
            <Input name="label" defaultValue={code?.label ?? ""} placeholder="Early bird 20%" />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Type">
            <Select name="type" value={type} onChange={(e) => setType(e.target.value)}>
              <option value="percent">Percentage off</option>
              <option value="flat">Flat ₹ off</option>
            </Select>
          </Field>
          <Field label={type === "percent" ? "Percent off" : "Amount off (₹)"}>
            <Input
              name="value"
              type="number"
              min={0}
              defaultValue={
                code ? (code.type === "flat" ? code.value / 100 : code.value) : 10
              }
              required
            />
          </Field>
          <Field label="Max discount (₹)" hint="Caps a percentage. Blank = uncapped.">
            <Input
              name="maxDiscount"
              type="number"
              min={0}
              defaultValue={code?.maxDiscountMinor ? code.maxDiscountMinor / 100 : ""}
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-4">
          <Field label="Min tickets">
            <Input name="minTickets" type="number" min={1} defaultValue={code?.minTickets ?? 1} />
          </Field>
          <Field label="Min order (₹)">
            <Input
              name="minOrder"
              type="number"
              min={0}
              defaultValue={code ? code.minOrderMinor / 100 : 0}
            />
          </Field>
          <Field label="Total uses" hint="Blank = unlimited.">
            <Input
              name="maxRedemptions"
              type="number"
              min={0}
              defaultValue={code?.maxRedemptions ?? ""}
            />
          </Field>
          <Field label="Uses per phone">
            <Input name="maxPerBuyer" type="number" min={1} defaultValue={code?.maxPerBuyer ?? 1} />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Limit to a ticket type">
            <Select name="zoneId" defaultValue={code?.zoneId ?? ""}>
              <option value="">All ticket types</option>
              {zones.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Visibility">
            <Select name="kind" defaultValue={code?.kind ?? "public"}>
              <option value="public">Public offer</option>
              <option value="special">Special / hidden pass</option>
            </Select>
          </Field>
          <Field label="Expires">
            <Input name="endsAt" type="datetime-local" />
          </Field>
        </div>

        <div className="flex flex-wrap gap-5">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="active"
              defaultChecked={code ? !!code.active : true}
              className="size-4 accent-[--color-brand-600]"
            />
            Active
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="allEvents"
              defaultChecked={code ? code.eventId == null : false}
              className="size-4 accent-[--color-brand-600]"
            />
            Works on all my events
          </label>
        </div>

        <FormError state={state} />

        <div className="flex gap-2">
          <Button disabled={pending}>{pending ? "Saving…" : "Save code"}</Button>
          <Button type="button" variant="ghost" onClick={onDone}>
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  );
}

function ReferralForm({
  eventId,
  code,
  onDone,
}: {
  eventId: string;
  code: Referral | null;
  onDone: () => void;
}) {
  const [state, action, pending] = useActionState(saveReferralCode, undefined);
  const [discountType, setDiscountType] = useState(code?.discountType ?? "flat");
  const [commissionType, setCommissionType] = useState(code?.commissionType ?? "percent");
  if (state && "ok" in state && state.ok) queueMicrotask(onDone);

  return (
    <Card className="border-brand-600/40 bg-brand-600/[0.04] p-5">
      <SectionTitle
        title={code ? `Edit ${code.code}` : "New referral code"}
        hint="Each promoter gets a code and a shareable link. Attribution and commission are tracked automatically."
      />
      <form action={action} className="space-y-4">
        <input type="hidden" name="eventId" value={eventId} />
        <input type="hidden" name="codeId" value={code?.id ?? ""} />

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Code">
            <Input
              name="code"
              defaultValue={code?.code}
              placeholder="RAHUL"
              className="font-mono uppercase"
              required
            />
          </Field>
          <Field label="Promoter name">
            <Input name="ownerName" defaultValue={code?.ownerName} placeholder="Rahul Shah" required />
          </Field>
          <Field label="WhatsApp number">
            <Input name="ownerPhone" defaultValue={code?.ownerPhone ?? ""} placeholder="+91 98200 11223" />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-3 rounded-lg border border-ink-700 p-3 sm:grid-cols-2">
            <Field label="Buyer discount">
              <Select
                name="discountType"
                value={discountType}
                onChange={(e) => setDiscountType(e.target.value)}
              >
                <option value="flat">Flat ₹ off</option>
                <option value="percent">Percent off</option>
              </Select>
            </Field>
            <Field label={discountType === "percent" ? "Percent" : "Amount (₹)"}>
              <Input
                name="discountValue"
                type="number"
                min={0}
                defaultValue={
                  code
                    ? code.discountType === "flat"
                      ? code.discountValue / 100
                      : code.discountValue
                    : 50
                }
              />
            </Field>
          </div>

          <div className="grid gap-3 rounded-lg border border-ink-700 p-3 sm:grid-cols-2">
            <Field label="Promoter commission">
              <Select
                name="commissionType"
                value={commissionType}
                onChange={(e) => setCommissionType(e.target.value)}
              >
                <option value="percent">Percent of sale</option>
                <option value="flat">Flat ₹ per order</option>
              </Select>
            </Field>
            <Field label={commissionType === "percent" ? "Percent" : "Amount (₹)"}>
              <Input
                name="commissionValue"
                type="number"
                min={0}
                defaultValue={
                  code
                    ? code.commissionType === "flat"
                      ? code.commissionValue / 100
                      : code.commissionValue
                    : 10
                }
              />
            </Field>
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="active"
            defaultChecked={code ? !!code.active : true}
            className="size-4 accent-[--color-brand-600]"
          />
          Active
        </label>

        <FormError state={state} />

        <div className="flex gap-2">
          <Button disabled={pending}>{pending ? "Saving…" : "Save code"}</Button>
          <Button type="button" variant="ghost" onClick={onDone}>
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  );
}
