import Link from "next/link";
import { BackButton, Breadcrumbs, type Crumb } from "@/components/nav";
import { Logo } from "@/components/brand";

/**
 * The header every buyer-facing page opens with: the mark, a back control that
 * falls back to a real href (links get pasted into WhatsApp, so history is
 * often empty), and a trail showing where this page sits.
 */
export function BuyerNav({
  backHref,
  backLabel,
  crumbs,
  action,
  sticky = true,
}: {
  backHref: string;
  backLabel: string;
  crumbs: Crumb[];
  action?: React.ReactNode;
  sticky?: boolean;
}) {
  return (
    <nav
      className={`${sticky ? "sticky top-0 z-40" : ""} border-b border-slate-200/80 bg-white/90 backdrop-blur`}
    >
      <div className="mx-auto flex max-w-5xl items-center gap-3 px-5 py-2.5">
        <Link href="/" className="shrink-0" aria-label="Rasana home">
          <Logo size={22} />
        </Link>
        <span className="hidden text-slate-300 sm:inline" aria-hidden>
          |
        </span>
        <div className="hidden min-w-0 sm:block">
          <Breadcrumbs items={crumbs} tone="light" />
        </div>
        <div className="min-w-0 sm:hidden">
          <BackButton href={backHref} label={backLabel} tone="light" />
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <div className="hidden sm:block">
            <BackButton href={backHref} label={backLabel} tone="light" />
          </div>
          {action}
        </div>
      </div>
    </nav>
  );
}
