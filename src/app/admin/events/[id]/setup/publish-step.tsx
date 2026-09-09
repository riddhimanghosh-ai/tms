"use client";

import Link from "next/link";
import { useTransition } from "react";
import { setEventStatus } from "@/app/admin/actions";
import { Button, Card, SectionTitle } from "@/components/ui";
import { toast } from "@/components/toast";
import { formatMinor } from "@/lib/money";

export function PublishStep({
  event,
  orgSlug,
  capacity,
  categoryCount,
  nightCount,
  lowestPriceMinor,
}: {
  event: {
    id: string;
    title: string;
    slug: string;
    status: string;
    venue: string | null;
    description: string | null;
    coverImageUrl: string | null;
  };
  orgSlug: string;
  capacity: number;
  categoryCount: number;
  nightCount: number;
  lowestPriceMinor: number | null;
}) {
  const [pending, start] = useTransition();
  const live = event.status === "published";
  const path = `/e/${orgSlug}/${event.slug}`;

  // Nothing here blocks publishing — an organiser can go live with gaps and
  // fill them in. These are the things a buyer will notice are missing.
  const checks = [
    { ok: capacity > 0, label: "Capacity is set", fix: "Add a block or category with seats." },
    { ok: categoryCount > 0, label: "At least one ticket category", fix: "Add a category to sell." },
    {
      ok: lowestPriceMinor != null && lowestPriceMinor >= 0,
      label: "Prices are set",
      fix: "Give each category a price.",
    },
    { ok: nightCount > 0, label: "Dates are set", fix: "Add at least one night." },
    { ok: Boolean(event.description), label: "Description written", fix: "Buyers read this first." },
    { ok: Boolean(event.venue), label: "Venue named", fix: "Add the venue so people know where to go." },
    { ok: Boolean(event.coverImageUrl), label: "Cover image added", fix: "A banner makes the page." },
  ];
  const missing = checks.filter((c) => !c.ok);

  return (
    <div className="space-y-5">
      <Card className="p-5">
        <SectionTitle title="Before you go live" hint="None of these block publishing." />
        <ul className="space-y-2.5">
          {checks.map((c) => (
            <li key={c.label} className="flex items-start gap-2.5 text-sm">
              <span
                className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-full text-xs ${
                  c.ok ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                }`}
              >
                {c.ok ? "✓" : "!"}
              </span>
              <span className={c.ok ? "text-ink-300" : ""}>
                {c.label}
                {!c.ok ? <span className="ml-2 text-ink-400">{c.fix}</span> : null}
              </span>
            </li>
          ))}
        </ul>
      </Card>

      <Card className="p-5">
        <SectionTitle title="What buyers will see" />
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            ["Capacity", capacity.toLocaleString("en-IN")],
            ["Categories", String(categoryCount)],
            ["Nights", String(nightCount)],
            ["From", lowestPriceMinor != null ? formatMinor(lowestPriceMinor) : "—"],
          ].map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs uppercase tracking-wide text-ink-400">{label}</dt>
              <dd className="tabular mt-1 text-xl font-semibold">{value}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-5 flex flex-wrap gap-2">
          <Link
            href={path}
            target="_blank"
            className="rounded-lg border border-ink-700 bg-white px-4 py-2 text-sm hover:bg-ink-800"
          >
            Preview landing page ↗
          </Link>
          <Link
            href={`${path}/book`}
            target="_blank"
            className="rounded-lg border border-ink-700 bg-white px-4 py-2 text-sm hover:bg-ink-800"
          >
            Preview booking ↗
          </Link>
          <Link
            href={`/admin/events/${event.id}/embed`}
            className="rounded-lg border border-ink-700 bg-white px-4 py-2 text-sm hover:bg-ink-800"
          >
            Get the embed code
          </Link>
        </div>
      </Card>

      <Card className={live ? "border-emerald-200 bg-emerald-50 p-5" : "p-5"}>
        {live ? (
          <>
            <p className="text-lg font-semibold text-emerald-900">This event is live</p>
            <p className="mt-1 text-sm text-emerald-800">
              It&apos;s selling on its landing page, in any embed, and on the Rasana marketplace
              if you left listing on.
            </p>
            <Button
              variant="secondary"
              className="mt-4"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  await setEventStatus(event.id, "paused");
                  toast("Sales paused", "info");
                })
              }
            >
              Pause sales
            </Button>
          </>
        ) : (
          <>
            <p className="text-lg font-semibold">Ready to publish</p>
            <p className="mt-1 text-sm text-ink-400">
              {missing.length
                ? `${missing.length} thing${missing.length === 1 ? "" : "s"} above ${missing.length === 1 ? "is" : "are"} still missing — you can publish anyway and fill them in.`
                : "Everything checks out."}
            </p>
            <Button
              size="lg"
              className="mt-4"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  await setEventStatus(event.id, "published");
                  toast("Live — your booking page is now selling", "ok");
                })
              }
            >
              {pending ? "Publishing…" : "Publish event"}
            </Button>
          </>
        )}
      </Card>
    </div>
  );
}
