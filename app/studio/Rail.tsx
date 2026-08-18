"use client";

import { STATE_COLOR, type ClientState } from "../../lib/clientState";

// The coloured edge that carries state — on a client card, a list row, a
// schedule row, an appointment.
//
// It replaces the badge. A badge is a shape floating inside the content that
// has to be read; a rail is the edge of the thing itself, and reads before you
// focus on anything. It also costs no horizontal space, which is what let the
// old status pills push names into truncation on a phone.
//
// Colour is never the only signal — every caller puts the state in words
// alongside it. So the rail can stay thin and quiet rather than shouting.

export default function Rail({
  state,
  color,
  width = 8,
  className = "",
}: {
  /** Client state — supplies the colour, and the hatch for a new client. */
  state?: ClientState;
  /** Explicit colour, for appointment status where the palette differs. */
  color?: string | null;
  width?: number;
  className?: string;
}) {
  const resolved = color ?? (state ? STATE_COLOR[state] : null);

  // No colour means "no history to judge yet". A hatch rather than a grey fill:
  // grey reads as disabled, and a new client is the opposite of that.
  if (!resolved) {
    return (
      <span
        aria-hidden="true"
        className={`shrink-0 self-stretch ${className}`}
        style={{
          width,
          backgroundImage:
            "repeating-linear-gradient(135deg, transparent 0 4px, rgba(50,37,31,.18) 4px 5px)",
          boxShadow:
            "inset 1px 0 0 rgba(50,37,31,.11), inset -1px 0 0 rgba(50,37,31,.11)",
        }}
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      className={`shrink-0 self-stretch ${className}`}
      style={{ width, background: resolved }}
    />
  );
}
