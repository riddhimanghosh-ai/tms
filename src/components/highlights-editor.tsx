"use client";

import { useState } from "react";
import { HIGHLIGHT_ICONS, type Highlight, type HighlightIcon } from "@/lib/highlights";
import { Button, Input, cn } from "@/components/ui";

const ICONS = Object.entries(HIGHLIGHT_ICONS) as [HighlightIcon, { glyph: string; label: string }][];

/**
 * The icon row buyers see under the hero. Kept to a fixed icon set and six
 * items — past that it stops reading as a summary and starts reading as a list.
 */
export function HighlightsEditor({ initial }: { initial: Highlight[] }) {
  const [items, setItems] = useState<Highlight[]>(initial);

  const update = (i: number, patch: Partial<Highlight>) =>
    setItems(items.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));

  return (
    <div className="space-y-3">
      {items.map((h, i) => (
        <div key={i} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="highlightIcon" value={h.icon} />
          <div className="flex flex-wrap gap-1">
            {ICONS.map(([key, meta]) => (
              <button
                key={key}
                type="button"
                title={meta.label}
                aria-label={meta.label}
                onClick={() => update(i, { icon: key })}
                className={cn(
                  "grid size-8 place-items-center rounded-lg border text-base transition",
                  h.icon === key
                    ? "border-brand-500 bg-brand-50 text-brand-600"
                    : "border-ink-700 text-ink-400 hover:border-ink-600 hover:text-ink-100",
                )}
              >
                {meta.glyph}
              </button>
            ))}
          </div>
          <Input
            name="highlightLabel"
            value={h.label}
            onChange={(e) => update(i, { label: e.target.value })}
            placeholder="Live Music"
            className="h-9 min-w-40 flex-1"
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setItems(items.filter((_, idx) => idx !== i))}
          >
            Remove
          </Button>
        </div>
      ))}

      {items.length < 6 ? (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() =>
            setItems([...items, { icon: ICONS[items.length % ICONS.length][0], label: "" }])
          }
        >
          Add a highlight
        </Button>
      ) : (
        <p className="text-xs text-ink-400">Six is the maximum — the row stops scanning past that.</p>
      )}
    </div>
  );
}
