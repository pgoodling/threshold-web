"use client";

import type { LucideIcon } from "lucide-react";

// One divided strip of actions across the foot of a card, flush to its edges.
//
// This is the thing that retires the pill. Five outlined lozenges in a row read
// as five competing objects; the same five as a divided band read as one
// control with five parts. It also scales — three actions or six, the component
// doesn't change, and nothing reflows into a ragged second row on a phone.
//
// At most one action carries emphasis, and it earns it with colour and weight
// rather than a filled shape. A filled block is reserved for the single genuine
// commit action on a page (Book appointment, Save), which a strip never is.

export type Action = {
  label: string;
  icon?: LucideIcon;
  onClick?: () => void;
  href?: string;
  /** The one action worth leading with. Use sparingly — ideally once. */
  primary?: boolean;
  disabled?: boolean;
  /** Replaces the label while something is in flight. */
  busyLabel?: string;
  busy?: boolean;
};

const cell =
  "flex flex-1 min-w-0 flex-col items-center justify-center gap-1 border-l border-foreground/10 px-1 py-3 text-xs transition first:border-l-0 hover:bg-background disabled:opacity-50";

export default function ActionStrip({
  actions,
  className = "",
}: {
  actions: Action[];
  className?: string;
}) {
  const live = actions.filter(Boolean);
  if (live.length === 0) return null;

  return (
    <nav className={`flex border-t border-foreground/10 ${className}`}>
      {live.map((a) => {
        const Icon = a.icon;
        const tone = a.primary
          ? "text-accent-dark font-medium"
          : "text-muted hover:text-accent-dark";
        const label = a.busy && a.busyLabel ? a.busyLabel : a.label;
        const inner = (
          <>
            {Icon && <Icon size={15} strokeWidth={1.75} aria-hidden="true" />}
            <span className="truncate">{label}</span>
          </>
        );

        // A link when it's a link (tel:, sms:, mailto:) so long-press and
        // open-in-new still behave; a button when it runs code.
        return a.href ? (
          <a key={a.label} href={a.href} className={`${cell} ${tone}`}>
            {inner}
          </a>
        ) : (
          <button
            key={a.label}
            type="button"
            onClick={a.onClick}
            disabled={a.disabled || a.busy}
            className={`${cell} ${tone}`}
          >
            {inner}
          </button>
        );
      })}
    </nav>
  );
}
