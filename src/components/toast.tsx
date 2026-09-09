"use client";

import { useEffect, useState } from "react";

type Toast = { id: number; text: string; tone: "ok" | "error" | "info" };

let counter = 0;
const listeners = new Set<(t: Toast) => void>();

/** Fire from anywhere on the client — no context wiring at call sites. */
export function toast(text: string, tone: Toast["tone"] = "ok") {
  const item = { id: ++counter, text, tone };
  for (const l of listeners) l(item);
}

const tones = {
  ok: "border-emerald-800 bg-emerald-950 text-emerald-100",
  error: "border-red-800 bg-red-950 text-red-100",
  info: "border-ink-700 bg-ink-850 text-ink-100",
} as const;

const icons = { ok: "✓", error: "!", info: "·" } as const;

export function Toaster() {
  const [items, setItems] = useState<Toast[]>([]);

  useEffect(() => {
    const onToast = (t: Toast) => {
      setItems((cur) => [...cur, t]);
      setTimeout(() => setItems((cur) => cur.filter((x) => x.id !== t.id)), 3600);
    };
    listeners.add(onToast);
    return () => {
      listeners.delete(onToast);
    };
  }, []);

  if (!items.length) return null;

  return (
    <div
      className="pointer-events-none fixed bottom-4 left-1/2 z-[100] flex w-full max-w-sm -translate-x-1/2 flex-col gap-2 px-4"
      role="status"
      aria-live="polite"
    >
      {items.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto flex items-center gap-2.5 rounded-xl border px-4 py-3 text-sm shadow-xl ${tones[t.tone]}`}
        >
          <span className="grid size-5 shrink-0 place-items-center rounded-full bg-white/15 text-xs">
            {icons[t.tone]}
          </span>
          <span className="min-w-0 flex-1">{t.text}</span>
          <button
            onClick={() => setItems((cur) => cur.filter((x) => x.id !== t.id))}
            className="shrink-0 text-lg leading-none opacity-60 hover:opacity-100"
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

/** Fires a toast when a server action's returned state flips to ok/error. */
export function useActionToast(
  state: unknown,
  messages: { ok?: string; error?: string } = {},
) {
  useEffect(() => {
    if (!state || typeof state !== "object") return;
    const s = state as { ok?: boolean; error?: string; savedAt?: number };
    if (s.ok) toast(messages.ok ?? "Saved", "ok");
    else if (s.error) toast(messages.error ?? s.error, "error");
    // savedAt changes on every save, so repeated saves each get a toast.
  }, [state, messages.ok, messages.error]);
}
