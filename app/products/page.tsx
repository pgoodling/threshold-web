import type { Metadata } from "next";

// The "what I use, and why" page.
//
// Two lines, on purpose: Keune for permanent color, care, and styling; Maria
// Nila for glosses and toning. Deliberately not a full inventory — the
// lightener she uses isn't named here because it isn't either of these brands,
// and claiming otherwise would undercut the point of the page.
//
// Everything claimed about either brand here is from their own public
// material — founding dates, ownership, B Corp status, certifications, what the
// products do. Nothing about how Evelyn works is invented; it's the same
// promise the About section on the homepage already makes ("healthy hair first,
// honest advice, no upselling"), applied to the shelf.
//
// If a brand claim ever stops being true — a certification lapses, a line gets
// dropped — it needs to change here, because this page is the reason a client
// trusts the rest.

export const metadata: Metadata = {
  title: "The products I use · Threshold",
  description:
    "Why Threshold — Studio by Evelyn uses Keune for color and care and Maria Nila for glosses: two family-owned, B Corp certified lines chosen for healthy hair, not margins.",
};

// Left-hand metadata for each brand card: the facts you'd want at a glance,
// before the story.
function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-foreground/10 py-3 first:border-t-0 first:pt-0">
      <dt className="text-[0.7rem] uppercase tracking-[0.18em] text-muted">
        {label}
      </dt>
      <dd className="mt-1 text-sm leading-relaxed">{children}</dd>
    </div>
  );
}

export default function ProductsPage() {
  return (
    <main className="min-h-screen">
      <header className="border-b border-foreground/10 bg-background/90 backdrop-blur">
        <nav className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
          <a href="/" aria-label="Threshold home">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/threshold-logos/threshold-wordmark-terracotta-transparent.svg"
              alt="Threshold — Studio by Evelyn"
              className="h-10 w-auto"
            />
          </a>
          <div className="flex items-center gap-5 text-sm">
            {/* Hidden on phones so it can't wrap into the logo — the wordmark
                already links home, and Book now is what matters at that width. */}
            <a
              href="/"
              className="hidden whitespace-nowrap text-muted hover:text-accent sm:block"
            >
              ← Back to site
            </a>
            <a
              href="/book"
              className="whitespace-nowrap rounded-full bg-accent px-4 py-2 text-white transition hover:bg-accent-dark"
            >
              Book now
            </a>
          </div>
        </nav>
      </header>

      <div className="mx-auto max-w-4xl px-6 py-14 sm:py-20">
        <p className="text-sm uppercase tracking-[0.25em] text-accent">
          On the shelf
        </p>
        <h1 className="mt-3 font-display text-4xl leading-tight sm:text-5xl">
          What I use, and why
        </h1>
        <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted">
          Every product that goes in your hair is one I chose, not one a sales
          rep talked me into. There are two brands in my studio &mdash; one for
          color and care, one for glosses &mdash; and they&rsquo;re both here for
          the same reason: they change your hair without damaging it in the
          process.
        </p>
        <p className="mt-4 max-w-2xl leading-relaxed text-muted">
          Neither one is sold in stores. No drugstore shelf, no Amazon. Both are
          made for salons only, and both are still run by the families that
          started them. Here&rsquo;s each one, and why I trust it.
        </p>
      </div>

      {/* The two brands */}
      <section className="mx-auto max-w-4xl space-y-8 px-6 pb-4">
        {/* KEUNE */}
        <article className="overflow-hidden rounded-2xl border border-foreground/10 bg-white">
          <div className="flex">
            {/* The stripe reads as a spine — brand identity on the left edge,
                where the eye starts. */}
            <div aria-hidden="true" className="w-1.5 shrink-0 bg-accent" />
            <div className="grid gap-8 p-6 sm:grid-cols-[13rem_1fr] sm:p-8">
              <div>
                <h2 className="font-display text-3xl">Keune</h2>
                <p className="mt-1 text-sm text-muted">
                  Permanent color, care, and styling
                </p>
                <dl className="mt-6">
                  <Fact label="From">Soest, Netherlands</Fact>
                  <Fact label="Since">
                    1922. Family-owned, four generations.
                  </Fact>
                  <Fact label="In the studio">
                    Permanent color, shampoo and conditioner, styling
                  </Fact>
                  <Fact label="Credentials">
                    Certified B Corp · Cruelty-free · Salon-only
                  </Fact>
                </dl>
              </div>

              <div className="space-y-4 leading-relaxed text-muted">
                <p>
                  Keune started as a pharmacy in Amsterdam in 1922, run by a
                  chemist named Jan Keune. In 1947 he made a decision the
                  company has never walked back: it would make products for hair
                  professionals only. A century and four generations later
                  it&rsquo;s still family-owned, still independent, and still
                  keeps that promise &mdash; no wholesalers, no retailers, no
                  e-tailers. The only place you can get it is from someone
                  standing behind a chair.
                </p>
                <p>
                  Everything is made under one roof at their headquarters in
                  Soest: formulation, testing, and production in the same
                  building, with nothing farmed out. They&rsquo;re a certified B
                  Corp, they don&rsquo;t test on animals, and the plant runs on
                  thousands of its own solar panels.
                </p>
                <p>
                  <span className="text-foreground">
                    Why it&rsquo;s the one I reach for:
                  </span>{" "}
                  the color is built to condition while it processes rather than
                  just deposit and leave. Their permanent line is formulated to
                  put nourishment back into the hair fiber during the same
                  service that changes its color. That is the entire argument
                  for it. I&rsquo;m not interested in a color that looks
                  incredible for a week and leaves me with damage to fix in
                  March.
                </p>
              </div>
            </div>
          </div>
        </article>

        {/* MARIA NILA */}
        <article className="overflow-hidden rounded-2xl border border-foreground/10 bg-white">
          <div className="flex">
            <div aria-hidden="true" className="w-1.5 shrink-0 bg-accent" />
            <div className="grid gap-8 p-6 sm:grid-cols-[13rem_1fr] sm:p-8">
              <div>
                <h2 className="font-display text-3xl">Maria Nila</h2>
                <p className="mt-1 text-sm text-muted">Glosses and toning</p>
                <dl className="mt-6">
                  <Fact label="From">Stockholm, Sweden</Fact>
                  <Fact label="Since">
                    1999. Family-run, started in a garage.
                  </Fact>
                  <Fact label="In the studio">
                    Glosses, toning, color refreshes between appointments
                  </Fact>
                  <Fact label="Credentials">
                    100% vegan · PETA · Leaping Bunny · Vegan Society · B Corp
                  </Fact>
                </dl>
              </div>

              <div className="space-y-4 leading-relaxed text-muted">
                <p>
                  Maria Nila was started in 1999 by the Wikström family, out of a
                  garage in southern Sweden. The name isn&rsquo;t a marketing
                  invention &mdash; Maria Nila was the founder&rsquo;s
                  great-grandmother, a Sámi woman whose respect for animals and
                  for the land the family took as their brief. It&rsquo;s still
                  family-run.
                </p>
                <p>
                  Every single product they make is 100% vegan and cruelty-free,
                  and they&rsquo;ve had that verified by outside bodies rather
                  than asserted on a label: PETA, Leaping Bunny, and the Vegan
                  Society, plus B Corp certification for how the company itself
                  is run.
                </p>
                <p>
                  <span className="text-foreground">
                    Why it&rsquo;s my gloss:
                  </span>{" "}
                  their Colour Refresh is a conditioning mask that happens to
                  carry pigment. Argan oil and provitamin B5, no ammonia, no
                  developer, no lift. It sits for a few minutes, warms or cools
                  or deepens what&rsquo;s already there, and leaves the hair
                  softer than it found it. It fades gradually over several
                  washes instead of growing out in a line &mdash; so trying a
                  tone doesn&rsquo;t have to be a decision you live with for six
                  months.
                </p>
              </div>
            </div>
          </div>
        </article>
      </section>

      {/* The values through-line */}
      <section className="border-t border-foreground/10 bg-white/60">
        <div className="mx-auto max-w-4xl px-6 py-16 sm:py-20">
          <h2 className="font-display text-3xl">Why these two</h2>
          <p className="mt-4 max-w-2xl leading-relaxed text-muted">
            I could stock whatever a rep put in front of me. These are the three
            things I actually weighed.
          </p>

          <div className="mt-10 grid gap-8 sm:grid-cols-3">
            {[
              {
                n: "01",
                h: "Healthy hair is the constraint",
                p: "Neither of these lines makes me choose between the color you want and the hair you want to keep. The gloss conditions while it tones. The color feeds the fiber while it processes. If I can get you there with the gentler option, the gentler option is what you're getting.",
              },
              {
                n: "02",
                h: "Small companies, on purpose",
                p: "One is a hundred-year-old Dutch family business. The other started in a garage in 1999 and is still run by the family that founded it. Both are certified B Corps — an outside body audited how they treat their people and the planet, rather than taking their word for it. Threshold is one chair and one stylist. It felt right to buy from people who are also small on purpose.",
              },
              {
                n: "03",
                h: "Nobody's paying me to say this",
                p: "Keune won't sell to retailers at all, so there's no cheaper version of it waiting for you online and no reason for me to talk you into anything. I use these because they work. If something better comes along I'll switch, and I'll tell you exactly why.",
              },
            ].map((item) => (
              <div key={item.n} className="border-l-2 border-accent/30 pl-5">
                <p className="font-display text-2xl text-accent/40">{item.n}</p>
                <h3 className="mt-2 font-display text-xl">{item.h}</h3>
                <p className="mt-3 leading-relaxed text-muted">{item.p}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Close on the booking CTA. The page's job is the two brands and the
          reasoning behind them; anything more turns an argument into a lecture. */}
      <section className="border-t border-foreground/10">
        <div className="mx-auto max-w-4xl px-6 py-16 sm:py-20">
          <div className="rounded-2xl border border-foreground/10 bg-accent/5 px-6 py-8 text-center">
            <p className="font-display text-2xl">
              Come see what it does to your hair.
            </p>
            <a
              href="/book"
              className="mt-6 inline-block rounded-full bg-accent px-8 py-3 text-white transition hover:bg-accent-dark"
            >
              Book now
            </a>
          </div>
        </div>
      </section>

      <footer className="border-t border-foreground/10">
        <div className="mx-auto flex max-w-4xl flex-wrap gap-x-5 gap-y-2 px-6 py-8 text-sm text-muted">
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
