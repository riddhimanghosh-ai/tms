"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { SETUP_STEPS, stepIndex } from "./steps";
import { cn } from "@/components/ui";

/**
 * The chrome around every setup step: a numbered stepper across the top and
 * the same list as a sidebar, so a half-finished event always shows what is
 * done and what is left.
 */
export function WizardShell({
  eventId,
  current,
  completed,
  children,
  primaryLabel = "Save & continue",
  onPrimary,
  primaryPending,
}: {
  eventId: string;
  current: string;
  /** Step slugs that have enough filled in to count as done. */
  completed: string[];
  children: ReactNode;
  primaryLabel?: string;
  onPrimary?: () => void;
  primaryPending?: boolean;
}) {
  const router = useRouter();
  const index = stepIndex(current);
  const next = SETUP_STEPS[index + 1];
  const prev = SETUP_STEPS[index - 1];
  const done = new Set(completed);

  const href = (slug: string) => `/admin/events/${eventId}/setup?step=${slug}`;

  const advance = () => {
    onPrimary?.();
    if (next) router.push(href(next.slug));
  };

  return (
    <div className="space-y-6">
      <div className="rounded-[--radius-card] border border-ink-700 bg-white p-4 card-shadow">
        <ol className="flex items-center gap-1 overflow-x-auto">
          {SETUP_STEPS.map((step, i) => {
            const active = step.slug === current;
            const complete = done.has(step.slug) && !active;
            return (
              <li key={step.slug} className="flex min-w-0 flex-1 items-center gap-1">
                <Link
                  href={href(step.slug)}
                  className={cn(
                    "flex min-w-0 items-center gap-2 rounded-lg px-2 py-1.5 transition",
                    active ? "bg-brand-50" : "hover:bg-ink-800",
                  )}
                >
                  <span
                    className={cn(
                      "grid size-7 shrink-0 place-items-center rounded-full text-xs font-semibold transition",
                      active
                        ? "bg-brand-600 text-white"
                        : complete
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-ink-800 text-ink-400",
                    )}
                  >
                    {complete ? "✓" : i + 1}
                  </span>
                  <span
                    className={cn(
                      "hidden truncate text-sm sm:block",
                      active ? "font-semibold text-ink-50" : "text-ink-400",
                    )}
                  >
                    {step.short}
                  </span>
                </Link>
                {i < SETUP_STEPS.length - 1 ? (
                  <span
                    className={cn(
                      "h-px min-w-3 flex-1",
                      done.has(step.slug) ? "bg-emerald-300" : "bg-ink-700",
                    )}
                    aria-hidden
                  />
                ) : null}
              </li>
            );
          })}
        </ol>
      </div>

      <div className="grid gap-6 lg:grid-cols-[220px_1fr] lg:items-start">
        <nav className="rounded-[--radius-card] border border-ink-700 bg-white p-2 card-shadow lg:sticky lg:top-32">
          <ul className="flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible">
            {SETUP_STEPS.map((step) => {
              const active = step.slug === current;
              return (
                <li key={step.slug}>
                  <Link
                    href={href(step.slug)}
                    className={cn(
                      "flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm transition lg:whitespace-normal",
                      active
                        ? "bg-brand-50 font-medium text-brand-700"
                        : "text-ink-400 hover:bg-ink-800 hover:text-ink-50",
                    )}
                  >
                    <span
                      className={cn(
                        "size-1.5 shrink-0 rounded-full",
                        done.has(step.slug) ? "bg-emerald-500" : active ? "bg-brand-600" : "bg-ink-600",
                      )}
                      aria-hidden
                    />
                    {step.label}
                  </Link>
                </li>
              );
            })}
          </ul>
          <div className="mt-2 border-t border-ink-700 p-3">
            <Link
              href={`/admin/events/${eventId}`}
              className="text-xs text-ink-400 hover:text-ink-50"
            >
              Skip to the dashboard →
            </Link>
          </div>
        </nav>

        <div className="min-w-0 space-y-5">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">
              {SETUP_STEPS[index].label}
            </h2>
            <p className="mt-1 text-sm text-ink-400">{SETUP_STEPS[index].blurb}</p>
          </div>

          {children}

          <div className="flex flex-wrap items-center gap-3 rounded-[--radius-card] border border-ink-700 bg-white p-4 card-shadow">
            {prev ? (
              <Link
                href={href(prev.slug)}
                className="rounded-lg border border-ink-700 bg-white px-4 py-2 text-sm hover:bg-ink-800"
              >
                ← {prev.short}
              </Link>
            ) : null}
            {next ? (
              <button
                type="button"
                onClick={advance}
                disabled={primaryPending}
                className="ml-auto rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-500 disabled:opacity-60"
              >
                {primaryPending ? "Saving…" : primaryLabel}
              </button>
            ) : (
              <Link
                href={`/admin/events/${eventId}`}
                className="ml-auto rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-500"
              >
                Go to dashboard
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
