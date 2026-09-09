"use client";

export type PublicNight = {
  id: string;
  startsAt: number;
  endsAt: number | null;
  label: string;
  note: string | null;
  soldOut: boolean;
  past: boolean;
};

/**
 * Which night the buyer is coming to. Shown only when an event has more than
 * one — a single-night show should never make someone pick a date.
 */
export function NightPicker({
  nights,
  selectedId,
  onSelect,
  loading,
  brandColor,
}: {
  nights: PublicNight[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  loading?: boolean;
  brandColor: string;
}) {
  const bookable = nights.filter((n) => !n.past);

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
          Which night?
        </p>
        {loading ? (
          <span className="text-xs text-slate-400">Checking availability…</span>
        ) : (
          <span className="text-xs text-slate-400">
            {bookable.length} of {nights.length} still open
          </span>
        )}
      </div>

      <ul className="flex snap-x gap-2 overflow-x-auto pb-1">
        {nights.map((n) => {
          const date = new Date(n.startsAt * 1000);
          const active = n.id === selectedId;
          const disabled = n.past || n.soldOut;
          return (
            <li key={n.id} className="snap-start">
              <button
                type="button"
                disabled={disabled}
                aria-pressed={active}
                onClick={() => onSelect(n.id)}
                className={`w-[112px] rounded-xl border px-3 py-2.5 text-left transition ${
                  active
                    ? "border-transparent text-white shadow-sm"
                    : disabled
                      ? "cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400"
                      : "border-slate-200 bg-white text-slate-800 hover:border-slate-400"
                }`}
                style={active ? { background: brandColor } : undefined}
              >
                <span className="block text-[11px] uppercase tracking-wide opacity-70">
                  {date.toLocaleDateString("en-IN", { weekday: "short" })}
                </span>
                <span className="block text-lg font-semibold leading-tight">
                  {date.toLocaleDateString("en-IN", { day: "numeric" })}{" "}
                  <span className="text-sm font-normal">
                    {date.toLocaleDateString("en-IN", { month: "short" })}
                  </span>
                </span>
                <span className="mt-0.5 block truncate text-[11px] opacity-80">
                  {n.past ? "Passed" : n.soldOut ? "Sold out" : n.label}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {selectedId ? (
        (() => {
          const n = nights.find((x) => x.id === selectedId);
          return n?.note ? <p className="mt-2 text-sm text-slate-500">{n.note}</p> : null;
        })()
      ) : null}
    </div>
  );
}
