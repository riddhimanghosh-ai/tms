"use client";

import { useEffect, useState } from "react";

function parts(msLeft: number) {
  const s = Math.max(0, Math.floor(msLeft / 1000));
  return {
    days: Math.floor(s / 86400),
    hours: Math.floor((s % 86400) / 3600),
    minutes: Math.floor((s % 3600) / 60),
    seconds: s % 60,
  };
}

/**
 * Counts down to the event. Renders nothing on the server pass and fills in
 * after mount, so the server and client never disagree about the clock.
 */
export function Countdown({
  targetSec,
  tone = "light",
  label = "Starts in",
}: {
  targetSec: number;
  tone?: "light" | "dark";
  label?: string;
}) {
  const [left, setLeft] = useState<number | null>(null);

  useEffect(() => {
    const tick = () => setLeft(targetSec * 1000 - Date.now());
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [targetSec]);

  if (left === null) return <div className="h-[74px]" aria-hidden />;
  if (left <= 0)
    return (
      <p className={tone === "dark" ? "text-sm text-white/80" : "text-sm text-slate-500"}>
        This event has started.
      </p>
    );

  const { days, hours, minutes, seconds } = parts(left);
  const cells = [
    { value: days, unit: days === 1 ? "day" : "days" },
    { value: hours, unit: "hrs" },
    { value: minutes, unit: "min" },
    { value: seconds, unit: "sec" },
  ];

  return (
    <div>
      <p
        className={`text-xs font-medium uppercase tracking-[0.18em] ${
          tone === "dark" ? "text-white/60" : "text-slate-400"
        }`}
      >
        {label}
      </p>
      <div className="mt-2 flex gap-2" role="timer" aria-live="off">
        {cells.map((c) => (
          <div
            key={c.unit}
            className={`min-w-14 rounded-xl px-3 py-2 text-center ${
              tone === "dark"
                ? "border border-white/15 bg-white/10 backdrop-blur"
                : "border border-slate-200 bg-white"
            }`}
          >
            <span
              className={`block text-xl font-semibold tabular-nums ${
                tone === "dark" ? "text-white" : "text-slate-900"
              }`}
            >
              {String(c.value).padStart(2, "0")}
            </span>
            <span
              className={`block text-[10px] uppercase tracking-wide ${
                tone === "dark" ? "text-white/60" : "text-slate-400"
              }`}
            >
              {c.unit}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
