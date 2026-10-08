"use client";

import { ChevronLeft, type LucideIcon } from "lucide-react";

// The studio's controls, direction B (agreed with Paul 2026-10-08): tiles for
// actions, segments for switching views, a round back button, and setting rows
// you can tap anywhere. Built once here so every screen gets the same shape and
// nothing is smaller than 44 points -- the size a fingertip needs, often with
// colour on it, between clients.
//
//   BackButton  round ‹, 44 across, top left beside the title
//   Tile        an action: icon over label. primary = terracotta (the one main
//               thing), danger = wine (cancel, remove), selected = outlined
//   Tiles       a grid of them, 2 / 3 / 4 across
//   Segments    replaces tabs and filters; the current one filled dark. Wraps to
//               two rows rather than squeezing four long labels
//   SettingRow  a whole row that flips its switch

export function BackButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Back to ${label}`}
      className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-foreground/15 bg-white text-foreground transition hover:border-foreground/30"
    >
      <ChevronLeft size={20} aria-hidden="true" />
    </button>
  );
}

/** The round ‹ with where it goes beside it, all one 44-point target. */
export function BackLink({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="-ml-1 inline-flex min-h-11 items-center gap-2.5 pr-3 text-sm text-muted transition hover:text-foreground"
    >
      <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-foreground/15 bg-white text-foreground">
        <ChevronLeft size={18} aria-hidden="true" />
      </span>
      {label}
    </button>
  );
}

/** A title with the round back button beside it. */
export function BackHeader({
  onBack,
  backLabel,
  title,
  sub,
  children,
}: {
  onBack: () => void;
  backLabel: string;
  title: React.ReactNode;
  sub?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <BackButton onClick={onBack} label={backLabel} />
      <div className="min-w-0 flex-1 pt-1.5">
        <div className="font-display text-xl leading-tight sm:text-2xl">{title}</div>
        {sub && <div className="mt-0.5 text-sm text-muted">{sub}</div>}
      </div>
      {children}
    </div>
  );
}

type Tone = "default" | "primary" | "danger" | "selected";

const TONE: Record<Tone, string> = {
  default: "border-foreground/15 bg-white text-foreground hover:border-foreground/30",
  primary: "border-transparent bg-accent text-white hover:bg-accent-dark",
  danger: "border-foreground/15 bg-white text-[#8f3f4a] hover:border-[#8f3f4a]/40",
  selected: "border-accent bg-white text-accent-dark ring-1 ring-accent",
};

export function Tile({
  icon: Icon,
  label,
  onClick,
  tone = "default",
  disabled,
  badge,
  wide,
  row,
  className = "",
  ...rest
}: {
  icon?: LucideIcon;
  label: React.ReactNode;
  onClick?: () => void;
  tone?: Tone;
  disabled?: boolean;
  badge?: React.ReactNode;
  /** Spans the whole grid row (the screen's main action). */
  wide?: boolean;
  /** Icon beside the label rather than above it. */
  row?: boolean;
  className?: string;
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onClick">) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`relative flex min-h-14 items-center justify-center rounded-xl border px-2 text-sm transition disabled:cursor-not-allowed disabled:opacity-45 ${
        row || wide ? "flex-row gap-2 font-medium" : "flex-col gap-1"
      } ${wide ? "col-span-full" : ""} ${TONE[tone]} ${className}`}
      {...rest}
    >
      {Icon && <Icon size={wide || row ? 18 : 20} strokeWidth={1.75} aria-hidden="true" />}
      <span className={wide || row ? "" : "text-[13px] leading-tight"}>{label}</span>
      {badge !== undefined && badge !== null && badge !== 0 && (
        <span className="absolute right-1.5 top-1.5 rounded-md bg-accent px-1.5 text-xs leading-5 text-white">{badge}</span>
      )}
    </button>
  );
}

export function Tiles({ cols = 3, children, className = "" }: { cols?: 2 | 3 | 4; children: React.ReactNode; className?: string }) {
  const c = cols === 2 ? "grid-cols-2" : cols === 4 ? "grid-cols-4" : "grid-cols-3";
  return <div className={`grid gap-2 ${c} ${className}`}>{children}</div>;
}

export function Segments<T extends string>({
  options,
  value,
  onChange,
  className = "",
  label,
}: {
  options: readonly (readonly [T, React.ReactNode] | readonly [T, React.ReactNode, number | undefined])[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
  /** For screen readers: what the segments choose between. */
  label?: string;
}) {
  // Up to three fit one row on a phone; four become two rows of two rather
  // than squeezing; more wrap in threes.
  const n = options.length;
  const cols = n <= 3 ? (n === 1 ? "grid-cols-1" : n === 2 ? "grid-cols-2" : "grid-cols-3") : n === 4 ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-3";
  return (
    <div role="group" aria-label={label} className={`grid gap-1.5 ${cols} ${className}`}>
      {options.map(([v, text, count]) => {
        const on = v === value;
        return (
          <button
            key={v}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(v)}
            className={`inline-flex min-h-11 items-center justify-center gap-1.5 rounded-[10px] px-3 text-sm transition ${
              on ? "bg-foreground font-medium text-background" : "bg-foreground/[0.06] text-foreground hover:bg-foreground/[0.1]"
            }`}
          >
            {text}
            {count !== undefined && count > 0 && (
              <span className={`tabular-nums ${on ? "text-background/80" : "text-accent-dark"}`}>{count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** A setting you can tap anywhere on to change. */
export function SettingRow({
  label,
  hint,
  on,
  onChange,
  disabled,
}: {
  label: React.ReactNode;
  hint?: React.ReactNode;
  on: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className="flex min-h-14 w-full items-center justify-between gap-4 rounded-xl border border-foreground/15 bg-white px-4 py-2.5 text-left transition hover:border-foreground/30 disabled:opacity-50"
    >
      <span className="min-w-0">
        <span className="block text-[15px]">{label}</span>
        {hint && <span className="mt-0.5 block text-xs text-muted">{hint}</span>}
      </span>
      <span
        aria-hidden="true"
        className={`relative h-7 w-12 shrink-0 rounded-full transition ${on ? "bg-[#647f5a]" : "bg-foreground/20"}`}
      >
        <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${on ? "left-6" : "left-1"}`} />
      </span>
    </button>
  );
}
