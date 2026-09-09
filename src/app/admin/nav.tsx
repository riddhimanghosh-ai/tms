"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/components/ui";

const tabs = [
  { seg: "", label: "Overview" },
  { seg: "setup", label: "Set up" },
  { seg: "dates", label: "Nights" },
  { seg: "tickets", label: "Tickets & seating" },
  { seg: "codes", label: "Codes" },
  { seg: "orders", label: "Orders" },
  { seg: "attendees", label: "Attendees" },
  { seg: "checkin", label: "Check-in" },
  { seg: "embed", label: "Embed & share" },
  { seg: "settings", label: "Settings" },
];

/** Only renders inside an event; the events list has no sub-nav. */
export function EventNav() {
  const pathname = usePathname();
  const match = pathname.match(/^\/admin\/events\/([^/]+)(?:\/([^/]+))?/);
  if (!match || match[1] === "new") return null;

  const [, eventId, seg = ""] = match;

  return (
    <nav className="mx-auto max-w-7xl overflow-x-auto px-4">
      <ul className="flex gap-1 border-t border-ink-700 pt-1">
        {tabs.map((t) => {
          const href = `/admin/events/${eventId}${t.seg ? `/${t.seg}` : ""}`;
          const active = seg === t.seg;
          return (
            <li key={t.seg}>
              <Link
                href={href}
                className={cn(
                  "-mb-px inline-block whitespace-nowrap border-b-2 px-3 py-2 text-sm transition",
                  active
                    ? "border-brand-500 text-ink-50"
                    : "border-transparent text-ink-400 hover:text-ink-100",
                )}
              >
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
