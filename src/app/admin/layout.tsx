import Link from "next/link";
import { getOrganizer } from "@/lib/auth";
import { logout } from "./auth-actions";
import { Toaster } from "@/components/toast";
import { EventNav } from "./nav";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const organizer = await getOrganizer();

  // Signed-out routes (login, signup) render without the dashboard chrome.
  if (!organizer)
    return (
      <>
        {children}
        <Toaster />
      </>
    );

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-ink-800 bg-ink-950/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-4">
          <Link href="/admin" className="font-semibold tracking-tight">
            <span className="text-brand-500">◆</span> Gathara
          </Link>
          <span className="hidden text-sm text-ink-500 sm:inline">/</span>
          <span className="hidden truncate text-sm text-ink-300 sm:inline">
            {organizer.name}
          </span>

          <div className="ml-auto flex items-center gap-2">
            <Link
              href="/admin/events/new"
              className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-500"
            >
              New event
            </Link>
            <form action={logout}>
              <button className="rounded-lg px-3 py-1.5 text-sm text-ink-400 hover:bg-ink-800 hover:text-ink-100">
                Sign out
              </button>
            </form>
          </div>
        </div>
        <EventNav />
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
      <Toaster />
    </div>
  );
}
