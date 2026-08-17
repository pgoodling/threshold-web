import type { Metadata } from "next";
import { SMS_CONSENT_TEXT, SMS_MARKETING_TEXT } from "../../lib/smsConsent";

// Messaging terms of service, as its own page.
//
// A2P campaign registration asks for a Terms of Service URL and a Privacy
// Policy URL. Giving the same link twice is accepted but looks thin, and a
// /terms that merely REDIRECTS to /privacy is worse — redirecting URLs are
// themselves listed among the rejection causes. So this is real, distinct
// content covering the messaging program specifically, and it cross-links to
// the privacy policy rather than repeating it.
//
// Everything here must stay true of what the app actually sends.

export const metadata: Metadata = {
  title: "Text Message Terms · Threshold",
  description:
    "Terms for Threshold — Studio by Evelyn's appointment and promotional text messages: what we send, how to opt out, and how to get help.",
};

const UPDATED = "August 17, 2026";

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-10">
      <h2 className="font-display text-2xl">{title}</h2>
      <div className="mt-3 space-y-3 leading-relaxed text-muted">{children}</div>
    </section>
  );
}

export default function TermsPage() {
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
        <h1 className="font-display text-4xl">Text message terms</h1>
        <p className="mt-3 text-sm text-muted">Last updated {UPDATED}</p>

        <p className="mt-6 leading-relaxed text-muted">
          These terms cover the text messages sent by{" "}
          <span className="text-foreground">Threshold Salon LLC</span>, trading
          as Threshold &mdash; Studio by Evelyn, from{" "}
          <a href="tel:+19379362138" className="text-accent hover:underline">
            (937) 936-2138
          </a>
          .
        </p>

        <Section title="Two separate programs">
          <p>
            We run two, and you choose them independently when you book. Taking
            one does not sign you up for the other, and you can take neither and
            still book normally.
          </p>
          <p className="font-medium text-foreground">
            Appointment messages
          </p>
          <blockquote className="rounded-xl border border-foreground/10 bg-accent/5 px-4 py-3.5 text-sm">
            {SMS_CONSENT_TEXT}
          </blockquote>
          <p className="font-medium text-foreground">Promotional messages</p>
          <blockquote className="rounded-xl border border-foreground/10 bg-accent/5 px-4 py-3.5 text-sm">
            {SMS_MARKETING_TEXT}
          </blockquote>
        </Section>

        <Section title="How to opt in">
          <p>
            Tick the box you want on the booking form at{" "}
            <a href="/book" className="text-accent hover:underline">
              threshold.salon/book
            </a>
            . Neither box is ticked for you. If you book by phone or in person,
            Evelyn will ask you directly and record your answer.
          </p>
        </Section>

        <Section title="Message frequency">
          <p>
            Appointment messages depend on how often you visit &mdash; typically
            a confirmation when you book and a reminder before each appointment,
            plus any replies in conversation with Evelyn. Promotional messages
            are occasional. Frequency varies in both cases.
          </p>
        </Section>

        <Section title="Cost">
          <p>
            We don&rsquo;t charge you for messages. Message and data rates may
            apply depending on your mobile plan.
          </p>
        </Section>

        <Section title="Opting out and getting help">
          <p>
            Reply <strong className="text-foreground">STOP</strong> to any
            message to stop receiving them. Reply{" "}
            <strong className="text-foreground">START</strong> to begin again.
            Reply <strong className="text-foreground">HELP</strong> for help, or
            call the salon on{" "}
            <a href="tel:+19379362138" className="text-accent hover:underline">
              (937) 936-2138
            </a>
            .
          </p>
          <p>
            You can also just tell Evelyn at your appointment and she&rsquo;ll
            take you off.
          </p>
        </Section>

        <Section title="Carriers">
          <p>
            Carriers are not liable for delayed or undelivered messages. Message
            delivery is subject to your mobile carrier&rsquo;s network.
          </p>
        </Section>

        <Section title="Your information">
          <p>
            We never sell, rent, or share your phone number or your consent with
            anyone for their own marketing. What we collect and who processes it
            is set out in full in our{" "}
            <a href="/privacy" className="text-accent hover:underline">
              privacy policy
            </a>
            .
          </p>
        </Section>

        <Section title="Contact">
          <p>
            Threshold Salon LLC
            <br />
            Salon Lofts, 424 E Stroop Rd, Kettering, OH 45429
            <br />
            <a href="tel:+19379362138" className="text-accent hover:underline">
              (937) 936-2138
            </a>
            <br />
            <a
              href="mailto:hello@threshold.salon"
              className="text-accent hover:underline"
            >
              hello@threshold.salon
            </a>
          </p>
        </Section>
      </div>

      <footer className="border-t border-foreground/10">
        <div className="mx-auto max-w-3xl px-6 py-8 text-sm text-muted">
          <a href="/" className="hover:text-accent">
            ← Back to Threshold
          </a>
        </div>
      </footer>
    </main>
  );
}
