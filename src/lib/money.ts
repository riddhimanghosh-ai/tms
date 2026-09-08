/** Everything monetary is stored as an integer number of paise. */

export function formatMinor(minor: number, currency = "INR") {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: minor % 100 === 0 ? 0 : 2,
  }).format(minor / 100);
}

/** Compact form for dashboard tiles: ₹1.2L, ₹4.5K. */
export function formatMinorShort(minor: number) {
  const rupees = minor / 100;
  if (rupees >= 1e7) return `₹${(rupees / 1e7).toFixed(2)}Cr`;
  if (rupees >= 1e5) return `₹${(rupees / 1e5).toFixed(2)}L`;
  if (rupees >= 1000) return `₹${(rupees / 1000).toFixed(1)}K`;
  return `₹${Math.round(rupees)}`;
}

export function rupeesToMinor(rupees: number | string) {
  return Math.round(Number(rupees || 0) * 100);
}

export function minorToRupees(minor: number) {
  return minor / 100;
}
