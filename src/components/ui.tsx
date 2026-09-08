import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

export function cn(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

export function Card({
  className,
  children,
  ...rest
}: ComponentProps<"div">) {
  return (
    <div
      {...rest}
      className={cn(
        "rounded-[--radius-card] border border-ink-700/70 bg-ink-900/70 backdrop-blur",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function SectionTitle({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-4 flex items-end justify-between gap-4">
      <div>
        <h2 className="text-base font-semibold tracking-tight">{title}</h2>
        {hint ? <p className="mt-0.5 text-sm text-ink-400">{hint}</p> : null}
      </div>
      {action}
    </div>
  );
}

const buttonBase =
  "inline-flex items-center justify-center gap-2 rounded-lg text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500";

const variants = {
  primary: "bg-brand-600 text-white hover:bg-brand-500 shadow-sm",
  secondary: "bg-ink-800 text-ink-50 hover:bg-ink-700 border border-ink-700",
  ghost: "text-ink-300 hover:text-ink-50 hover:bg-ink-800",
  danger: "bg-red-950 text-red-200 border border-red-900 hover:bg-red-900",
  light: "bg-slate-900 text-white hover:bg-slate-800 shadow-sm",
} as const;

const sizes = {
  sm: "h-8 px-3",
  md: "h-10 px-4",
  lg: "h-12 px-6 text-base",
} as const;

type BtnProps = {
  variant?: keyof typeof variants;
  size?: keyof typeof sizes;
};

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...rest
}: ComponentProps<"button"> & BtnProps) {
  return (
    <button
      {...rest}
      className={cn(buttonBase, variants[variant], sizes[size], className)}
    />
  );
}

export function ButtonLink({
  variant = "primary",
  size = "md",
  className,
  ...rest
}: ComponentProps<typeof Link> & BtnProps) {
  return (
    <Link
      {...rest}
      className={cn(buttonBase, variants[variant], sizes[size], className)}
    />
  );
}

export function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("block", className)}>
      <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-ink-400">
        {label}
      </span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-ink-400">{hint}</span> : null}
    </label>
  );
}

export const inputClass =
  "w-full rounded-lg border border-ink-700 bg-ink-850 px-3 py-2 text-sm text-ink-50 placeholder:text-ink-600 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-600/30";

export function Input(props: ComponentProps<"input">) {
  return <input {...props} className={cn(inputClass, props.className)} />;
}

export function Textarea(props: ComponentProps<"textarea">) {
  return <textarea {...props} className={cn(inputClass, "min-h-24", props.className)} />;
}

export function Select(props: ComponentProps<"select">) {
  return <select {...props} className={cn(inputClass, "pr-8", props.className)} />;
}

const badgeTones = {
  neutral: "bg-ink-800 text-ink-300 border-ink-700",
  green: "bg-emerald-950 text-emerald-300 border-emerald-900",
  amber: "bg-amber-950 text-amber-300 border-amber-900",
  red: "bg-red-950 text-red-300 border-red-900",
  brand: "bg-brand-600/15 text-brand-400 border-brand-600/40",
} as const;

export function Badge({
  tone = "neutral",
  children,
}: {
  tone?: keyof typeof badgeTones;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium",
        badgeTones[tone],
      )}
    >
      {children}
    </span>
  );
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-[--radius-card] border border-dashed border-ink-700 px-6 py-14 text-center">
      <p className="text-sm font-medium text-ink-200">{title}</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-ink-400">{body}</p>
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </div>
  );
}
