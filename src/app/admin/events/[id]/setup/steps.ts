export const SETUP_STEPS = [
  {
    slug: "details",
    label: "Event details",
    short: "Details",
    blurb: "Name, story, venue and the highlights buyers see first.",
  },
  {
    slug: "venue",
    label: "Venue & layout",
    short: "Layout",
    blurb: "Pick a layout shape, place the stage, arrange the seats.",
  },
  {
    slug: "categories",
    label: "Ticket categories",
    short: "Categories",
    blurb: "What you're selling, at what price, and how much of it.",
  },
  {
    slug: "nights",
    label: "Dates & nights",
    short: "Nights",
    blurb: "One night, or a nine-night run — each sells its own inventory.",
  },
  {
    slug: "publish",
    label: "Preview & publish",
    short: "Publish",
    blurb: "Check it the way a buyer will, then go live.",
  },
] as const;

export type SetupStep = (typeof SETUP_STEPS)[number]["slug"];

export function stepIndex(slug: string) {
  const i = SETUP_STEPS.findIndex((s) => s.slug === slug);
  return i === -1 ? 0 : i;
}
