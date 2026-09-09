"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { cn } from "./ui";

/**
 * Goes back through history when there's somewhere to go back to, and falls
 * back to an explicit href otherwise — so a link pasted into WhatsApp still
 * has a working back button.
 */
export function BackButton({
  href,
  label = "Back",
  className,
  tone = "dark",
  onBack,
}: {
  href: string;
  label?: string;
  className?: string;
  tone?: "dark" | "light";
  /** Runs before navigating — used to release a checkout hold. */
  onBack?: () => void;
}) {
  const router = useRouter();

  return (
    <button
      type="button"
      onClick={() => {
        onBack?.();
        if (window.history.length > 1) router.back();
        else router.push(href);
      }}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm transition",
        tone === "dark"
          ? "text-ink-400 hover:bg-ink-800 hover:text-ink-50"
          : "text-slate-500 hover:bg-slate-100 hover:text-slate-900",
        className,
      )}
    >
      <span aria-hidden>←</span>
      {label}
    </button>
  );
}

export type Crumb = { label: string; href?: string };

export function Breadcrumbs({
  items,
  tone = "dark",
  trailing,
}: {
  items: Crumb[];
  tone?: "dark" | "light";
  trailing?: ReactNode;
}) {
  const muted = tone === "dark" ? "text-ink-400" : "text-slate-500";
  const strong = tone === "dark" ? "text-ink-100" : "text-slate-900";
  const hover = tone === "dark" ? "hover:text-ink-50" : "hover:text-slate-900";

  return (
    <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-sm">
      <ol className="flex min-w-0 flex-wrap items-center gap-1.5">
        {items.map((c, i) => {
          const last = i === items.length - 1;
          return (
            <li key={`${c.label}-${i}`} className="flex min-w-0 items-center gap-1.5">
              {c.href && !last ? (
                <Link href={c.href} className={cn(muted, hover, "truncate transition")}>
                  {c.label}
                </Link>
              ) : (
                <span className={cn(last ? strong : muted, "truncate")} aria-current={last ? "page" : undefined}>
                  {c.label}
                </span>
              )}
              {!last ? (
                <span className={cn(muted, "opacity-50")} aria-hidden>
                  /
                </span>
              ) : null}
            </li>
          );
        })}
      </ol>
      {trailing}
    </nav>
  );
}

/** Back button + breadcrumbs, the header every inner page opens with. */
export function PageNav({
  backHref,
  backLabel,
  crumbs,
  tone = "dark",
  actions,
}: {
  backHref: string;
  backLabel?: string;
  crumbs: Crumb[];
  tone?: "dark" | "light";
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <BackButton href={backHref} label={backLabel} tone={tone} />
      <span className={tone === "dark" ? "text-ink-700" : "text-slate-300"} aria-hidden>
        |
      </span>
      <Breadcrumbs items={crumbs} tone={tone} />
      {actions ? <div className="ml-auto flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}
