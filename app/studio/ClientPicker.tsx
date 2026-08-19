"use client";

import { useEffect, useMemo, useRef, useState } from "react";

// Find a client by typing, rather than scrolling a dropdown of 159 names.
//
// A <select> is fine at a dozen entries and unusable at a hundred and fifty —
// on a phone it becomes a full-screen wheel she has to spin past everyone
// called A to reach a Z. This filters as she types, on name or phone, because
// the number is often what she's looking at when someone rings.
//
// Deliberately a plain input plus a list rather than a native combobox: she may
// be typing a name that isn't in the book yet, and the caller decides what
// "add a new one" does.

export type PickableClient = {
  id: string;
  full_name: string;
  phone?: string | null;
};

export default function ClientPicker({
  clients,
  value,
  onChange,
  label = "Client",
  placeholder = "Start typing a name…",
  autoFocus = false,
}: {
  clients: PickableClient[];
  value: string;
  onChange: (id: string) => void;
  label?: string;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);

  const chosen = clients.find((c) => c.id === value) ?? null;

  // Tapping anywhere else closes the list. Without this it stays open behind
  // the rest of the form on a phone, covering the fields below it.
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, []);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const digits = q.replace(/\D/g, "");
    const pool = clients.filter((c) => {
      if (!q) return true;
      if (c.full_name.toLowerCase().includes(q)) return true;
      // Match on phone too — she often has the number in front of her.
      return digits.length >= 3 && (c.phone ?? "").replace(/\D/g, "").includes(digits);
    });
    // Names that START with what she typed come first: typing "sa" should put
    // Sarah above Alissa.
    const q0 = q;
    return pool
      .sort((a, b) => {
        const aStarts = a.full_name.toLowerCase().startsWith(q0) ? 0 : 1;
        const bStarts = b.full_name.toLowerCase().startsWith(q0) ? 0 : 1;
        return aStarts - bStarts || a.full_name.localeCompare(b.full_name);
      })
      .slice(0, 8);
  }, [clients, query]);

  function choose(c: PickableClient) {
    onChange(c.id);
    setQuery("");
    setOpen(false);
  }

  // Chosen state: show who it is and a way to change it, rather than leaving her
  // guessing whether the tap registered.
  if (chosen && !open) {
    return (
      <div>
        <span className="mb-1 block text-sm">{label}</span>
        <div className="flex items-center gap-3 rounded-md border border-foreground/15 bg-white px-3 py-2.5">
          <span className="min-w-0 flex-1 truncate">{chosen.full_name}</span>
          <button
            type="button"
            onClick={() => {
              onChange("");
              setQuery("");
              setOpen(true);
            }}
            className="shrink-0 text-sm text-muted transition hover:text-accent-dark"
          >
            Change
          </button>
        </div>
      </div>
    );
  }

  return (
    <div ref={boxRef} className="relative">
      <label className="block">
        <span className="mb-1 block text-sm">{label}</span>
        <input
          className="input"
          value={query}
          placeholder={placeholder}
          autoFocus={autoFocus}
          autoComplete="off"
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((i) => Math.min(i + 1, matches.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((i) => Math.max(i - 1, 0));
            } else if (e.key === "Enter" && matches[active]) {
              e.preventDefault();
              choose(matches[active]);
            } else if (e.key === "Escape") {
              setOpen(false);
            }
          }}
        />
      </label>

      {open && (
        <div className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-md border border-foreground/15 bg-white shadow-lg">
          {matches.length === 0 ? (
            <p className="px-3 py-3 text-sm text-muted">
              No one matching “{query.trim()}”.
            </p>
          ) : (
            matches.map((c, i) => (
              <button
                key={c.id}
                type="button"
                onPointerDown={(e) => {
                  // Fires before the input's blur, so the pick isn't lost.
                  e.preventDefault();
                  choose(c);
                }}
                onMouseEnter={() => setActive(i)}
                className={`flex w-full items-baseline gap-2 border-t border-foreground/10 px-3 py-2.5 text-left text-sm first:border-t-0 ${
                  i === active ? "bg-accent/5" : ""
                }`}
              >
                <span className="min-w-0 flex-1 truncate">{c.full_name}</span>
                {c.phone && (
                  <span className="shrink-0 text-xs text-muted">{c.phone}</span>
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
