export function TicketCard({
  code,
  qr,
  holderName,
  zoneName,
  seatLabel,
  admitsCount,
  status,
  eventTitle,
  venue,
  startsAt,
  brandColor,
}: {
  code: string;
  qr: string;
  holderName: string;
  zoneName: string;
  seatLabel: string | null;
  admitsCount: number;
  status: string;
  eventTitle: string;
  venue: string | null;
  startsAt: number;
  brandColor: string;
}) {
  const used = status === "checked_in";
  const cancelled = status === "cancelled";

  return (
    <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="h-1.5" style={{ background: brandColor }} />
      <div className="flex flex-wrap gap-5 p-5 sm:flex-nowrap">
        <div
          className={`shrink-0 ${used || cancelled ? "opacity-30" : ""}`}
          style={{ width: 132 }}
          // qrcode returns a self-contained SVG string.
          dangerouslySetInnerHTML={{ __html: qr }}
        />

        <div className="min-w-0 flex-1">
          <p className="text-xs uppercase tracking-wide text-slate-400">{eventTitle}</p>
          <p className="mt-1 text-lg font-semibold text-slate-900">{holderName}</p>

          <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-xs text-slate-400">Category</dt>
              <dd className="font-medium text-slate-900">{zoneName}</dd>
            </div>
            {seatLabel ? (
              <div>
                <dt className="text-xs text-slate-400">Seat</dt>
                <dd className="font-medium text-slate-900">{seatLabel}</dd>
              </div>
            ) : null}
            <div>
              <dt className="text-xs text-slate-400">Admits</dt>
              <dd className="font-medium text-slate-900">{admitsCount}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-400">Doors</dt>
              <dd className="font-medium text-slate-900">
                {new Date(startsAt * 1000).toLocaleTimeString("en-IN", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </dd>
            </div>
          </dl>

          {venue ? <p className="mt-3 text-sm text-slate-500">{venue}</p> : null}

          <p className="mt-3 font-mono text-sm tracking-widest text-slate-900">{code}</p>

          {used ? (
            <p className="mt-2 inline-block rounded-full bg-slate-900 px-2.5 py-1 text-xs font-medium text-white">
              Already used
            </p>
          ) : cancelled ? (
            <p className="mt-2 inline-block rounded-full bg-red-100 px-2.5 py-1 text-xs font-medium text-red-700">
              Cancelled
            </p>
          ) : null}
        </div>
      </div>
    </article>
  );
}
