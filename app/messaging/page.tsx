import type { Metadata } from "next";
import SmsConsentBox from "../SmsConsentBox";
import {
  SMS_CONSENT_HEADING,
  SMS_CONSENT_TEXT,
  SMS_MARKETING_HEADING,
  SMS_MARKETING_TEXT,
} from "../../lib/smsConsent";

// The message-flow page: how someone opts in, on a public URL.
//
// This exists because of a specific, repeated rejection. The campaign was turned
// down twice for "a compliant privacy policy can not be verified", and the
// policy text was not the problem — it already carried the CTIA sentence
// verbatim. What couldn't be verified was the opt-in.
//
// Twilio's onboarding guide: "we're checking to make sure that the call-to-action
// and the right disclosures are displayed at the time of phone number
// collection", and an opt-in that is "part of an in-app flow" needs a publicly
// accessible link showing it. /book is a four-step wizard — service, time,
// details, done — and the consent checkbox is on step three. A reviewer opening
// /book sees a price list. No checkbox, no fee disclosure, nothing to verify.
//
// So this is the URL that goes in the Message Flow field. It renders the real
// SmsConsentBox rather than a screenshot, so what carriers see and what clients
// see cannot drift apart.

export const metadata: Metadata = {
  title: "Text Messages · Threshold",
  description:
    "How Threshold — Studio by Evelyn's appointment text messages work: how you opt in, what you'll receive, and how to stop.",
};

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 border-t border-foreground/10 py-3 sm:flex-row sm:gap-6">
      <dt className="shrink-0 text-xs uppercase tracking-[0.15em] text-muted sm:w-44 sm:pt-0.5">
        {label}
      </dt>
      <dd className="leading-relaxed">{children}</dd>
    </div>
  );
}

export default function MessagingPage() {
  return (
    <main className="min-h-screen">
      <header className="border-b border-foreground/10 bg-background/90 backdrop-blur">
        <nav className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <a href="/" aria-label="Threshold home">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/threshold-logos/threshold-wordmark-terracotta-transparent.svg"
              alt="Threshold — Studio by Evelyn"
              className="h-10 w-auto"
            />
          </a>
          <a href="/" className="text-sm text-muted hover:text-accent">
            ← Back to site
          </a>
        </nav>
      </header>

      <div className="mx-auto max-w-3xl px-6 py-12 sm:py-16">
        <h1 className="font-display text-4xl">Text messages from Threshold</h1>
        <p className="mt-4 leading-relaxed text-muted">
          Threshold Salon LLC, trading as Threshold &mdash; Studio by Evelyn, is
          a single-stylist hair salon in Kettering, Ohio. We text from{" "}
          <a href="tel:+19379362138" className="text-accent hover:underline">
            (937) 936-2138
          </a>
          . This page shows exactly how you sign up, what you&rsquo;ll get, and
          how to stop.
        </p>

        <h2 className="mt-10 font-display text-2xl">How you opt in</h2>
        <p className="mt-3 leading-relaxed text-muted">
          When you book at{" "}
          <a href="/book" className="text-accent hover:underline">
            threshold.salon/book
          </a>
          , the third step asks for your name and mobile number. Underneath it
          are these two boxes. Neither is ticked for you, and you can book
          without ticking either &mdash; consent is not a condition of getting an
          appointment. They&rsquo;re shown here exactly as they appear on the
          form:
        </p>

        {/* The real component, inert. Not a screenshot and not a rebuild — if
            the wording on the booking form changes, it changes here. */}
        <div className="mt-5 grid gap-3">
          <SmsConsentBox
            checked={false}
            readOnly
            heading={SMS_CONSENT_HEADING}
            body={SMS_CONSENT_TEXT}
          />
          <SmsConsentBox
            checked={false}
            readOnly
            heading={SMS_MARKETING_HEADING}
            body={SMS_MARKETING_TEXT}
          />
        </div>

        <p className="mt-4 text-sm text-muted">
          The two are independent. Agreeing to appointment texts does not sign
          you up for offers, and neither is a condition of booking or of any
          purchase. If you book by phone or in person, Evelyn asks the same
          question out loud and records your answer with the date.
        </p>

        <h2 className="mt-12 font-display text-2xl">The programs</h2>
        <dl className="mt-4">
          <Row label="Program name">
            Threshold Salon appointment messages, and separately, Threshold
            Salon offers
          </Row>
          <Row label="What we send">
            Appointment confirmations, reminders the day before, a note if
            you&rsquo;re running late, and replies from Evelyn. The offers
            program sends occasional promotions and salon news.
          </Row>
          <Row label="Message frequency">
            Message frequency varies &mdash; appointment messages depend on how
            often you visit, typically a confirmation when you book and a
            reminder before each appointment.
          </Row>
          <Row label="Cost">
            We don&rsquo;t charge you for messages.{" "}
            <strong className="text-foreground">
              Message and data rates may apply.
            </strong>
          </Row>
          <Row label="Opting out">
            Reply <strong className="text-foreground">STOP</strong> to any
            message and we stop immediately. Reply{" "}
            <strong className="text-foreground">START</strong> to begin again.
          </Row>
          <Row label="Getting help">
            Reply <strong className="text-foreground">HELP</strong>, call{" "}
            <a href="tel:+19379362138" className="text-accent hover:underline">
              (937) 936-2138
            </a>
            , or email{" "}
            <a
              href="mailto:hello@threshold.salon"
              className="text-accent hover:underline"
            >
              hello@threshold.salon
            </a>
            .
          </Row>
          <Row label="Carriers">
            Carriers are not liable for any delayed or undelivered messages.
          </Row>
          <Row label="Your information">
            We do not share, sell, or provide your mobile phone number or
            messaging consent data to third parties or affiliates for marketing
            or promotional purposes. Full detail in our{" "}
            <a href="/privacy" className="text-accent hover:underline">
              privacy policy
            </a>{" "}
            and{" "}
            <a href="/terms" className="text-accent hover:underline">
              text message terms
            </a>
            .
          </Row>
        </dl>

        <h2 className="mt-12 font-display text-2xl">What the messages say</h2>
        <p className="mt-3 text-muted">
          Real examples, with names and times changed:
        </p>
        <div className="mt-4 grid gap-2">
          {[
            "Hi Sarah! You're booked at Threshold for Blonding Session on Fri, Sep 25, 1:00 PM. Tell me about your hair, or change it: https://threshold.salon/appointment/a1b2c3 — Evelyn (Reply STOP to opt out.)",
            "Hi Sarah, it's Threshold Salon — you're booked for Blonding Session Friday 1:00 PM. Reply C to confirm. (Reply STOP to opt out.)",
            "Lovely — you're confirmed for Friday 1:00 PM. See you then! Threshold Salon (Reply STOP to opt out.)",
          ].map((s) => (
            <p
              key={s}
              className="rounded-xl border border-foreground/15 bg-white px-4 py-3 text-sm leading-relaxed text-muted"
            >
              {s}
            </p>
          ))}
        </div>
      </div>

      <footer className="border-t border-foreground/10">
        <div className="mx-auto flex max-w-3xl flex-wrap gap-x-5 gap-y-2 px-6 py-8 text-sm text-muted">
          <a href="/" className="hover:text-accent">
            ← Back to Threshold
          </a>
          <a href="/privacy" className="hover:text-accent">
            Privacy policy
          </a>
          <a href="/terms" className="hover:text-accent">
            Text message terms
          </a>
        </div>
      </footer>
    </main>
  );
}
