"use client";

import { useState } from "react";

const links = [
  { href: "#services", label: "Services" },
  { href: "#about", label: "About" },
  { href: "#portfolio", label: "Portfolio" },
  { href: "#visit", label: "Visit" },
];

export default function MobileNav() {
  const [open, setOpen] = useState(false);

  return (
    <div className="sm:hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
        className="flex h-10 w-10 items-center justify-center rounded-full text-foreground transition hover:text-accent"
      >
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          aria-hidden="true"
        >
          {open ? (
            <path d="M6 6l12 12M18 6L6 18" />
          ) : (
            <path d="M4 7h16M4 12h16M4 17h16" />
          )}
        </svg>
      </button>

      {open && (
        <div className="absolute inset-x-0 top-full border-b border-foreground/10 bg-background/95 backdrop-blur">
          <nav className="mx-auto flex max-w-5xl flex-col gap-1 px-6 py-3">
            {links.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="rounded-lg px-2 py-3 transition hover:bg-foreground/5 hover:text-accent"
              >
                {link.label}
              </a>
            ))}
            <a
              href="#visit"
              onClick={() => setOpen(false)}
              className="mt-2 rounded-full bg-accent px-4 py-3 text-center text-white transition hover:bg-accent-dark"
            >
              Book now
            </a>
          </nav>
        </div>
      )}
    </div>
  );
}
