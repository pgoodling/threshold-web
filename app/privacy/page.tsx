import type { Metadata } from "next";

// The privacy policy: what we collect, who touches it, how long we keep it.
//
// It is NOT the messaging terms. Those are /terms, and the split matters —
// A2P registration asks for both as separate URLs, so they have to be genuinely
// different documents rather than one document served twice. The line between
// them: this page answers "what happens to my information", /terms answers
// "how does the texting program work". Anything about frequency, cost, or
// opt-out keywords belongs there, not here.
//
// This page exists for two reasons. The obvious one: clients hand over a phone
// number, a card, and photos of their hair, and deserve to be told what happens
// to it. The less obvious one: A2P 10DLC campaign vetting runs automated
// compliance checks against the business website, and a missing privacy policy
// — specifically one stating that SMS opt-in data isn't sold or shared — is a
// common rejection reason. The messaging section below is written to satisfy
// that, and the required sentence must stay on this page even though the rest
// of the program details moved.
//
// Every claim here has to stay TRUE of the app. If data handling changes, this
// changes with it.

export const metadata: Metadata = {
  title: "Privacy Policy · Threshold",
  description:
    "How Threshold — Studio by Evelyn collects, uses and protects your personal information.",
};

const UPDATED = "September 3, 2026";

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
        <h1 className="font-display text-4xl">Privacy policy</h1>
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
            your hair well &mdash; your color formula, your history of visits,
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

        {/* This section covers what happens to your DATA. How the messaging
            program itself works — the two opt-ins word for word, frequency,
            cost, STOP/START/HELP — lives on /terms, and should stay there.
            Both pages used to carry both halves, which made them read as
            duplicates of each other and made a reworded sentence a two-file
            change with a chance of them disagreeing. Vetting reads both, and
            two pages that contradict each other is what it's looking for. */}
        <Section title="Your phone number and text messages">
          <p>
            Appointment texts are optional and you opt in by ticking a box when
            you book &mdash; nothing is ticked for you, and consent is not a
            condition of getting an appointment. Promotional texts are a{" "}
            <strong className="text-foreground">separate</strong> box; agreeing
            to one does not sign you up for the other. The exact wording of both,
            along with message frequency, cost and how to stop, is on our{" "}
            <a href="/terms" className="text-accent hover:underline">
              text message terms
            </a>{" "}
            page.
          </p>
          <p>
            What we keep is your mobile number, which of the two you agreed to,
            and the date you agreed.
          </p>
          {/* Worded to match what A2P vetting checks for, close to verbatim.
              The earlier version said the same thing in plainer English — "with
              anyone for their own marketing" — and the campaign was rejected on
              3 September for a privacy policy that couldn't be verified. The phrase
              the check wants is "third parties or affiliates"; saying "anyone",
              which is strictly broader, doesn't satisfy it. Don't reword this
              paragraph for style. */}
          <p>
            <strong className="text-foreground">
              We do not share, sell, or provide your mobile phone number or
              messaging consent data to third parties or affiliates for
              marketing or promotional purposes.
            </strong>{" "}
            Mobile information is used only to deliver the appointment messages
            you asked for. It is passed to the service providers who send those
            messages and store your booking on our behalf, and to no one else.
          </p>
          {/* Twilio's onboarding guide publishes the sentence its reviewers look
              for, close to word for word. The paragraph above says the same
              thing and is what CTIA asks for, but it qualifies the promise with
              "for marketing or promotional purposes" — and a check looking for
              an unqualified statement doesn't find one. This is that statement,
              in their phrasing. It costs a sentence; a rejection costs a
              fortnight. Do not merge these two paragraphs. */}
          <p>
            <strong className="text-foreground">
              All the above categories exclude text messaging originator opt-in
              data and consent; this information will not be shared with any
              third parties.
            </strong>
          </p>
          <p>
            How the messaging program works &mdash; how you opt in, what
            you&rsquo;ll receive, and how to stop &mdash; is set out on our{" "}
            <a href="/messaging" className="text-accent hover:underline">
              text messages
            </a>{" "}
            page.
          </p>
          <p>
            To stop receiving texts, reply{" "}
            <strong className="text-foreground">STOP</strong> to any message and
            we&rsquo;ll stop immediately, or just tell Evelyn.
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
            because your color history and notes are what let Evelyn pick up
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
            {/* Must match /terms character for character — vetting reads both
                pages and flags a business whose address doesn't agree with
                itself. */}
            Salon Lofts, 424 E Stroop Rd, Kettering, OH 45429
            <br />
            <a href="tel:+19379362138" className="text-accent hover:underline">
              (937) 936-2138
            </a>
            <br />
            <a
              href="mailto:info@threshold.salon"
              className="text-accent hover:underline"
            >
              info@threshold.salon
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
