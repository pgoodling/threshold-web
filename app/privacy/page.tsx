import type { Metadata } from "next";
import { SMS_CONSENT_TEXT } from "../../lib/smsConsent";

// Privacy policy + SMS terms.
//
// This page exists for two reasons. The obvious one: clients hand over a phone
// number, a card, and photos of their hair, and deserve to be told what happens
// to it. The less obvious one: A2P 10DLC campaign vetting runs automated
// compliance checks against the business website, and a missing privacy policy
// — specifically one stating that SMS opt-in data isn't sold or shared — is a
// common rejection reason. The SMS section below is written to satisfy that.
//
// Every claim here has to stay TRUE of the app. If data handling changes, this
// changes with it.

export const metadata: Metadata = {
  title: "Privacy & SMS Terms · Threshold",
  description:
    "How Threshold — Studio by Evelyn handles your personal information, and the terms of our appointment text messages.",
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

export default function PrivacyPage() {
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
        <h1 className="font-display text-4xl">Privacy &amp; text message terms</h1>
        <p className="mt-3 text-sm text-muted">Last updated {UPDATED}</p>

        <p className="mt-6 leading-relaxed text-muted">
          Threshold &mdash; Studio by Evelyn is a single-stylist hair salon in
          Kettering, Ohio, operated by{" "}
          <span className="text-foreground">Threshold Salon LLC</span>, which is
          responsible for the information described here. This page explains
          what we collect when you book an appointment, what we do with it, and
          how our text messages work. We&rsquo;ve tried to write it in plain
          language rather than legalese.
        </p>

        <Section title="What we collect">
          <p>When you book an appointment we ask for:</p>
          <ul className="ml-5 list-disc space-y-1.5">
            <li>Your first and last name</li>
            <li>Your mobile phone number</li>
            <li>Your email address, if you choose to give one &mdash; it&rsquo;s optional</li>
            <li>
              Anything you tell us in the notes field, and any photos you choose
              to upload of your hair or your inspiration
            </li>
            <li>
              Whether you agreed to receive appointment texts, and when you
              agreed
            </li>
          </ul>
          <p>
            Over time Evelyn may also keep notes on your file that help her do
            your hair well &mdash; your colour formula, your history of visits,
            and your birthday if you share it.
          </p>
        </Section>

        <Section title="Card details">
          <p>
            We ask for a card to hold your appointment. Card details are entered
            directly into{" "}
            <a
              href="https://stripe.com/privacy"
              className="text-accent hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              Stripe
            </a>
            , our payment processor, and are stored by Stripe &mdash; never by
            us. We can see the last four digits and charge the card under the
            cancellation policy shown at booking. We cannot see your full card
            number.
          </p>
        </Section>

        <Section title="Text messages">
          <p>
            Appointment texts are optional. You opt in by ticking the box at
            booking, which reads:
          </p>
          <blockquote className="rounded-xl border border-foreground/10 bg-accent/5 px-4 py-3.5 text-sm">
            {SMS_CONSENT_TEXT}
          </blockquote>
          <p>
            If you don&rsquo;t tick it, we don&rsquo;t text you. You can book
            either way &mdash; consent is not a condition of getting an
            appointment.
          </p>
          <p>
            <strong className="text-foreground">
              We do not sell, rent, or share your phone number or your text
              message consent with anyone for their own marketing.
            </strong>{" "}
            Your number is used to run our own service providers who deliver the
            messages and store the booking, and for nothing else.
          </p>
          <p>
            To stop receiving texts, reply <strong className="text-foreground">STOP</strong>{" "}
            to any message and we&rsquo;ll stop immediately. Reply{" "}
            <strong className="text-foreground">HELP</strong> for help, or just
            call the salon. Message frequency varies with your appointments.
            Message and data rates may apply. Carriers are not liable for
            delayed or undelivered messages.
          </p>
        </Section>

        <Section title="Who else sees your information">
          <p>
            Only Evelyn has access to your client file. We use a small number of
            service providers to run the business, and they only receive what
            they need to do their job:
          </p>
          <ul className="ml-5 list-disc space-y-1.5">
            <li>
              <strong className="text-foreground">Supabase</strong> &mdash;
              stores the booking database and your photos
            </li>
            <li>
              <strong className="text-foreground">Stripe</strong> &mdash;
              processes payments and stores card details
            </li>
            <li>
              <strong className="text-foreground">Twilio</strong> &mdash;
              delivers text messages
            </li>
            <li>
              <strong className="text-foreground">Vercel</strong> &mdash; hosts
              this website
            </li>
          </ul>
          <p>
            We don&rsquo;t sell your information. We don&rsquo;t share it for
            advertising. We&rsquo;d only hand it over if we were legally
            required to.
          </p>
        </Section>

        <Section title="How long we keep it">
          <p>
            We keep your client file while you&rsquo;re a client of the salon,
            because your colour history and notes are what let Evelyn pick up
            where she left off. Ask us to delete it and we will &mdash; though we
            may keep basic records of past payments where we&rsquo;re required
            to.
          </p>
        </Section>

        <Section title="Your choices">
          <p>
            Ask us any time to see what we hold about you, correct it, delete
            it, or stop texting you. Just ask Evelyn at your appointment, call,
            or email &mdash; there&rsquo;s no form to fill in.
          </p>
        </Section>

        <Section title="Children">
          <p>
            We&rsquo;ll happily cut a child&rsquo;s hair, but the appointment
            and the contact details need to come from a parent or guardian. We
            don&rsquo;t knowingly collect information directly from children
            under 13.
          </p>
        </Section>

        <Section title="Changes">
          <p>
            If we change how we handle your information, we&rsquo;ll update this
            page and the date at the top.
          </p>
        </Section>

        <Section title="Contact">
          <p>
            Threshold Salon LLC
            <br />
            Threshold &mdash; Studio by Evelyn
            <br />
            Salon Lofts, 424 E. Stroop Rd., Kettering, OH 45429
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
