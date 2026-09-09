import Link from "next/link";

/** The Rasana mark — concentric rings, the same shape the seat maps draw. */
export function Logo({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden className="shrink-0">
      <defs>
        <linearGradient id="rasana-mark" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#f43f68" />
          <stop offset="100%" stopColor="#e9a13b" />
        </linearGradient>
      </defs>
      <circle cx="16" cy="16" r="15" fill="url(#rasana-mark)" />
      <circle cx="16" cy="16" r="9.5" fill="none" stroke="#fff" strokeWidth="2.4" />
      <circle cx="16" cy="16" r="3.4" fill="#fff" />
    </svg>
  );
}

export function Wordmark({
  href = "/",
  size = 26,
  className,
}: {
  href?: string;
  size?: number;
  className?: string;
}) {
  return (
    <Link href={href} className={`inline-flex items-center gap-2 font-semibold tracking-tight ${className ?? ""}`}>
      <Logo size={size} />
      <span style={{ fontSize: size * 0.72 }}>Rasana</span>
    </Link>
  );
}
