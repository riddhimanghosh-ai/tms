"use client";

import { useId, useMemo, useState } from "react";
import { cn, inputClass } from "./ui";

/** `datetime-local` values are local wall-clock strings, never ISO/UTC. */
function toLocalParts(ts: number | null | undefined) {
  if (!ts) return { date: "", time: "" };
  const d = new Date(ts * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}

function addDays(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Next occurrence of a weekday (0 = Sunday), today excluded. */
function nextWeekday(target: number) {
  const today = new Date().getDay();
  const delta = ((target - today + 7) % 7) || 7;
  return addDays(delta);
}

function prettyPreview(date: string, time: string) {
  if (!date) return null;
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = (time || "00:00").split(":").map(Number);
  const dt = new Date(y, m - 1, d, hh, mm);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toLocaleString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

const TIME_PRESETS = [
  { label: "6 pm", value: "18:00" },
  { label: "7 pm", value: "19:00" },
  { label: "8 pm", value: "20:00" },
  { label: "9 pm", value: "21:00" },
];

/**
 * A date field and a time field instead of one `datetime-local`.
 *
 * The native combined control demands a complete value before it will accept
 * anything, and enforces that with a browser tooltip we can't style or word.
 * Two plain inputs each validate independently, so a half-filled field is a
 * normal state we can guide rather than an error the browser shouts about.
 * A hidden input carries the combined value, so server actions are unchanged.
 */
export function DateTimeField({
  name,
  label,
  hint,
  defaultValue,
  required,
  defaultTime = "19:00",
  quickDates = true,
  error,
}: {
  name: string;
  label: string;
  hint?: string;
  /** Unix seconds. */
  defaultValue?: number | null;
  required?: boolean;
  defaultTime?: string;
  quickDates?: boolean;
  error?: string | null;
}) {
  const initial = toLocalParts(defaultValue);
  const [date, setDate] = useState(initial.date);
  const [time, setTime] = useState(initial.time);
  const fieldId = useId();

  const combined = date ? `${date}T${time || defaultTime}` : "";
  const preview = useMemo(() => prettyPreview(date, time || defaultTime), [date, time, defaultTime]);

  const shortcuts = [
    { label: "Today", value: addDays(0) },
    { label: "Tomorrow", value: addDays(1) },
    { label: "This Friday", value: nextWeekday(5) },
    { label: "This Saturday", value: nextWeekday(6) },
  ];

  return (
    <div>
      <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-ink-400">
        {label}
        {required ? <span className="ml-1 text-brand-500">*</span> : null}
      </span>

      <input type="hidden" name={name} value={combined} />

      <div className="flex gap-2">
        <input
          type="date"
          aria-label={`${label} date`}
          id={fieldId}
          value={date}
          onChange={(e) => {
            setDate(e.target.value);
            // Picking a date with no time set is the common case; fill a
            // sensible evening slot rather than leaving it incomplete.
            if (e.target.value && !time) setTime(defaultTime);
          }}
          className={cn(inputClass, "flex-1", error && "border-red-800")}
        />
        <input
          type="time"
          aria-label={`${label} time`}
          value={time}
          onChange={(e) => setTime(e.target.value)}
          className={cn(inputClass, "w-32", error && "border-red-800")}
        />
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {quickDates
          ? shortcuts.map((s) => (
              <button
                key={s.label}
                type="button"
                onClick={() => {
                  setDate(s.value);
                  if (!time) setTime(defaultTime);
                }}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-xs transition",
                  date === s.value
                    ? "border-brand-500 bg-brand-600/15 text-brand-400"
                    : "border-ink-700 text-ink-400 hover:border-ink-600 hover:text-ink-100",
                )}
              >
                {s.label}
              </button>
            ))
          : null}
        {TIME_PRESETS.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => setTime(t.value)}
            className={cn(
              "rounded-full border px-2.5 py-1 text-xs transition",
              time === t.value
                ? "border-brand-500 bg-brand-600/15 text-brand-400"
                : "border-ink-700 text-ink-400 hover:border-ink-600 hover:text-ink-100",
            )}
          >
            {t.label}
          </button>
        ))}
        {date || time ? (
          <button
            type="button"
            onClick={() => {
              setDate("");
              setTime("");
            }}
            className="rounded-full px-2.5 py-1 text-xs text-ink-500 hover:text-ink-200"
          >
            Clear
          </button>
        ) : null}
      </div>

      {error ? (
        <p className="mt-1.5 text-sm text-red-400">{error}</p>
      ) : preview ? (
        <p className="mt-1.5 text-sm text-ink-300">{preview}</p>
      ) : hint ? (
        <p className="mt-1.5 text-xs text-ink-400">{hint}</p>
      ) : null}
    </div>
  );
}

/**
 * An end time expressed as "start + N", which is how organisers actually think
 * about it. Falls back to a plain date+time field once they want an exact value.
 */
export function DurationField({
  name,
  label,
  startName,
  defaultValue,
  hint,
}: {
  name: string;
  label: string;
  startName: string;
  defaultValue?: number | null;
  hint?: string;
}) {
  const initial = toLocalParts(defaultValue);
  const [date, setDate] = useState(initial.date);
  const [time, setTime] = useState(initial.time);

  const presets = [
    { label: "+3 hours", hours: 3 },
    { label: "+6 hours", hours: 6 },
    { label: "Next day", hours: 24 },
    { label: "9 nights", hours: 24 * 9 },
  ];

  const applyPreset = (hours: number) => {
    const startInput = document.querySelector<HTMLInputElement>(`input[name="${startName}"]`);
    const raw = startInput?.value;
    if (!raw) return;
    const start = new Date(raw);
    if (Number.isNaN(start.getTime())) return;
    const end = new Date(start.getTime() + hours * 3600 * 1000);
    const pad = (n: number) => String(n).padStart(2, "0");
    setDate(`${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(end.getDate())}`);
    setTime(`${pad(end.getHours())}:${pad(end.getMinutes())}`);
  };

  const combined = date ? `${date}T${time || "23:00"}` : "";
  const preview = prettyPreview(date, time || "23:00");

  return (
    <div>
      <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-ink-400">
        {label}
      </span>
      <input type="hidden" name={name} value={combined} />
      <div className="flex gap-2">
        <input
          type="date"
          aria-label={`${label} date`}
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className={cn(inputClass, "flex-1")}
        />
        <input
          type="time"
          aria-label={`${label} time`}
          value={time}
          onChange={(e) => setTime(e.target.value)}
          className={cn(inputClass, "w-32")}
        />
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {presets.map((p) => (
          <button
            key={p.label}
            type="button"
            onClick={() => applyPreset(p.hours)}
            className="rounded-full border border-ink-700 px-2.5 py-1 text-xs text-ink-400 transition hover:border-ink-600 hover:text-ink-100"
          >
            {p.label}
          </button>
        ))}
        {date ? (
          <button
            type="button"
            onClick={() => {
              setDate("");
              setTime("");
            }}
            className="rounded-full px-2.5 py-1 text-xs text-ink-500 hover:text-ink-200"
          >
            Clear
          </button>
        ) : null}
      </div>
      {preview ? (
        <p className="mt-1.5 text-sm text-ink-300">{preview}</p>
      ) : hint ? (
        <p className="mt-1.5 text-xs text-ink-400">{hint}</p>
      ) : null}
    </div>
  );
}
