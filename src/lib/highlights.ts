/**
 * The icon row on a landing page. A small fixed set beats free-form icon
 * names — an organiser picks from these, so nothing renders as a broken glyph.
 */
export const HIGHLIGHT_ICONS = {
  music: { glyph: "♪", label: "Live music" },
  dance: { glyph: "◈", label: "Traditional vibes" },
  star: { glyph: "★", label: "Special artists" },
  food: { glyph: "◉", label: "Food stalls" },
  drink: { glyph: "◇", label: "Bar" },
  parking: { glyph: "⬒", label: "Parking" },
  photo: { glyph: "◎", label: "Photo booth" },
  gift: { glyph: "✦", label: "Prizes" },
  family: { glyph: "❋", label: "Family friendly" },
  ac: { glyph: "❄", label: "Air conditioned" },
} as const;

export type HighlightIcon = keyof typeof HIGHLIGHT_ICONS;

export type Highlight = { icon: HighlightIcon; label: string };

export function parseHighlights(raw: string | null | undefined): Highlight[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((h) => h && typeof h.label === "string" && h.icon in HIGHLIGHT_ICONS)
      .slice(0, 6)
      .map((h) => ({ icon: h.icon as HighlightIcon, label: h.label as string }));
  } catch {
    return [];
  }
}

export function packHighlights(list: Highlight[]) {
  const clean = list.filter((h) => h.label.trim()).slice(0, 6);
  return clean.length ? JSON.stringify(clean) : null;
}
