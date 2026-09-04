"use client";

// The SMS opt-in, in one place.
//
// It lives here rather than inside the booking page because carrier vetting has
// to be able to SEE it, and the booking form is a four-step wizard — a reviewer
// landing on /book gets a service menu and nothing else. /messaging renders this
// same component so the disclosure is on a public URL that loads in one hop.
//
// Sharing the component rather than mocking one up on that page is the whole
// point: a screenshot or a lookalike drifts from the real form the first time
// the wording changes, and then the page shown to carriers is a claim about the
// product rather than the product. This cannot drift.

export default function SmsConsentBox({
  checked,
  onChange,
  heading,
  body,
  /** Shown as the client sees it, but inert — for the public disclosure page. */
  readOnly = false,
}: {
  checked: boolean;
  onChange?: (v: boolean) => void;
  heading: string;
  body: string;
  readOnly?: boolean;
}) {
  const Wrapper = readOnly ? "div" : "label";
  return (
    <Wrapper
      className={`flex gap-3 rounded-xl border border-foreground/10 bg-accent/5 px-4 py-3.5 transition ${
        readOnly ? "" : "cursor-pointer hover:border-accent/40"
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        readOnly={readOnly}
        disabled={readOnly}
        onChange={(e) => onChange?.(e.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 accent-[#bd6b4d]"
        // Unchecked by default is a carrier requirement, not a preference:
        // "Consent controls (checkboxes, toggles) must be blank or off by
        // default." Nothing here may ever set this true on first render.
        aria-label={heading}
      />
      <span className="text-sm text-muted">
        <span className="block font-medium text-foreground">{heading}</span>
        <span className="mt-1.5 block leading-relaxed">
          {body}{" "}
          {/* Reachable from the opt-in itself — carrier vetting checks that the
              consent point links to the policy, and a client agreeing to texts
              should be one tap from what we do with the number. */}
          <a
            href="/terms"
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="text-accent underline"
          >
            Text terms
          </a>{" "}
          &middot;{" "}
          <a
            href="/privacy"
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="text-accent underline"
          >
            Privacy policy
          </a>
        </span>
      </span>
    </Wrapper>
  );
}
