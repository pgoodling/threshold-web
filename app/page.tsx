import MobileNav from "./MobileNav";

const services: { name: string; description: string; price?: string }[] = [
  {
    name: "Custom Highlights",
    description:
      "Balayage, foils, and lived-in dimension, from a soft rooted blonde to bright, blended highlights that grow out beautifully — including seamless gray blending.",
    price: "from $105",
  },
  {
    name: "Custom Color",
    description:
      "All-over color, root touch-ups, and glosses with gentle, professional-grade formulas that protect the integrity of your hair.",
    price: "from $90",
  },
  {
    name: "Cut and Style",
    description:
      "A precision cut shaped to your hair type, texture, and lifestyle, finished with a look you can actually recreate at home.",
    price: "from $55",
  },
  {
    name: "Treatments",
    description:
      "Deep conditioning, bond-building, and scalp care, customized to your hair's needs to restore strength and shine and keep it healthy between visits.",
    price: "from $35",
  },
  {
    name: "Blowouts",
    description:
      "A smooth, voluminous finish for events, date nights, or any day you want to feel put together.",
    price: "from $45",
  },
  {
    name: "Men's Cuts",
    description:
      "Clean, tailored cuts and styling for men, from classic tapers to relaxed, low-maintenance looks.",
    price: "from $50",
  },
];

const hours = [
  ["Tuesday – Friday", "9am – 7pm"],
  ["Saturday", "9am – 4pm"],
  ["Sunday – Monday", "Closed"],
];

// Recent client work. Filenames contain spaces, so paths are URL-encoded.
const gallery = [
  { src: "/clients/ashley.jpg", alt: "Bright blonde balayage with soft waves, back view, by Evelyn" },
  { src: "/clients/lidia%202.jpg", alt: "Warm copper-red color with waves by Evelyn" },
  { src: "/clients/laura.jpg", alt: "Brunette balayage with caramel highlights and waves by Evelyn" },
  { src: "/clients/riley.jpeg", alt: "Golden blonde with soft waves by Evelyn" },
  { src: "/clients/erin%20back.jpg", alt: "Blended blonde balayage, back view, by Evelyn" },
  { src: "/clients/mom%201.jpg", alt: "Icy blonde textured bob by Evelyn" },
  { src: "/clients/girl%202.jpg", alt: "Soft bronde balayage with beachy waves by Evelyn" },
  { src: "/clients/girl%203.jpeg", alt: "Blonde balayage with curtain bangs and layers by Evelyn" },
  { src: "/clients/marina.jpg", alt: "Dimensional blonde color, sleek and straight, by Evelyn" },
  { src: "/clients/lidia%201.jpg", alt: "Copper-red color with long layers by Evelyn" },
  { src: "/clients/girl.jpg", alt: "Golden blonde balayage with voluminous waves, back view, by Evelyn" },
  { src: "/clients/girl%204.jpg", alt: "Bright platinum blonde with waves by Evelyn" },
  { src: "/clients/erin%20front.jpg", alt: "Blonde balayage with soft waves, side view, by Evelyn" },
  { src: "/clients/dana.jpg", alt: "Warm blonde balayage with long waves by Evelyn" },
];

export default function Home() {
  return (
    <main className="flex-1">
      {/* Navigation */}
      <header className="sticky top-0 z-10 border-b border-foreground/10 bg-background/90 backdrop-blur">
        <nav className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-6 py-4">
          <a href="#">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/threshold-logos/threshold-wordmark-terracotta-transparent.svg"
              alt="Threshold — Studio by Evelyn"
              className="h-11 w-auto"
            />
          </a>
          <div className="flex items-center gap-6 text-sm">
            <a href="#services" className="hidden hover:text-accent sm:block">
              Services
            </a>
            <a href="#about" className="hidden hover:text-accent sm:block">
              About
            </a>
            <a href="#portfolio" className="hidden hover:text-accent sm:block">
              Portfolio
            </a>
            <a href="#visit" className="hidden hover:text-accent sm:block">
              Visit
            </a>
            <a
              href="#visit"
              className="whitespace-nowrap rounded-full bg-accent px-4 py-2 text-white transition hover:bg-accent-dark"
            >
              Book now
            </a>
            <MobileNav />
          </div>
        </nav>
      </header>

      {/* Hero */}
      <section className="relative isolate overflow-hidden">
        {/* Faint background image for warmth behind the hero */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/headshots/evelyn%202.jpg"
          alt=""
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10 h-full w-full object-cover object-center opacity-30"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-b from-background via-transparent to-background"
        />
        <div className="mx-auto max-w-5xl px-6 py-16 text-center sm:py-24">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/threshold-logos/threshold-logo-transparent.svg"
            alt=""
            className="mx-auto mb-2 w-56 sm:w-72"
          />
          <p className="mb-4 text-sm uppercase tracking-[0.25em] text-accent">
            Coming soon
          </p>
          <h1 className="font-display text-4xl leading-tight sm:text-6xl">
            Step over the threshold.
            <br />
            Leave feeling like yourself.
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-lg text-muted">
            Expert cuts, color, and care in a space designed to feel less like an
            appointment and more like a visit with someone who gets you.
          </p>
          <a
            href="#visit"
            className="mt-10 inline-block rounded-full bg-accent px-8 py-3 text-white transition hover:bg-accent-dark"
          >
            Book now
          </a>
        </div>
      </section>

      {/* Services */}
      <section id="services" className="border-t border-foreground/10 bg-white">
        <div className="mx-auto max-w-5xl px-6 py-20">
          <h2 className="font-display text-3xl">Services</h2>
          <div className="mt-10 grid gap-8 sm:grid-cols-2">
            {services.map((service) => (
              <div
                key={service.name}
                className="rounded-2xl border border-foreground/10 p-6"
              >
                <div className="flex items-baseline justify-between gap-4">
                  <h3 className="font-display text-xl">{service.name}</h3>
                  {service.price && (
                    <span className="whitespace-nowrap text-sm text-accent">
                      {service.price}
                    </span>
                  )}
                </div>
                <p className="mt-3 text-muted">{service.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* About / Meet Evelyn */}
      <section id="about" className="mx-auto max-w-5xl px-6 py-20">
        <div className="grid items-center gap-12 sm:grid-cols-2">
          <div className="relative">
            <div className="overflow-hidden rounded-2xl">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/headshots/evelyn%20Scissors.jpg"
                alt="Evelyn, founder and stylist at Threshold"
                className="aspect-[4/5] w-full object-cover object-bottom"
              />
            </div>
            {/* Branded detail accent — her name-engraved tools */}
            <div className="absolute -bottom-6 -left-6 hidden w-40 overflow-hidden rounded-2xl border-4 border-background shadow-lg sm:block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/headshots/brush%20scissors%20hair.jpg"
                alt="Evelyn's engraved brush, shears, and color swatches"
                className="aspect-[3/4] w-full object-cover"
              />
            </div>
          </div>
          <div>
            <p className="mb-2 text-sm uppercase tracking-[0.25em] text-accent">
              Meet Evelyn
            </p>
            <h2 className="font-display text-3xl">
              The stylist behind Threshold
            </h2>
            <p className="mt-6 text-lg text-muted">
              Hi, I&apos;m Evelyn! I&apos;ve called Dayton home for the past 10
              years and been behind the chair for 5 of them. When I&apos;m not in
              the salon, you&apos;ll usually find me at a live concert or curled up
              binge-watching my latest favorite show.
            </p>
            <p className="mt-4 text-muted">
              What I love most is helping people feel like the best version of
              themselves. Healthy hair always comes first — every service is
              customized to your goals while protecting the integrity of your
              hair, with honest advice and no upselling. My chair is meant to be a
              place to relax, unwind, and leave feeling confident, refreshed, and
              truly taken care of.
            </p>
            <p className="mt-4 text-muted">
              I can&apos;t wait to welcome you into my chair!
            </p>
          </div>
        </div>
      </section>

      {/* Work / Portfolio */}
      <section id="portfolio" className="border-t border-foreground/10">
        <div className="mx-auto max-w-5xl px-6 py-20">
          <h2 className="font-display text-3xl">Her Portfolio</h2>
          <p className="mt-4 max-w-2xl text-muted">
            A look at recent color, balayage, and styling — real clients, real
            results.
          </p>
          <div className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-3">
            {gallery.map((photo) => (
              <div
                key={photo.src}
                className="overflow-hidden rounded-2xl"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photo.src}
                  alt={photo.alt}
                  loading="lazy"
                  className="aspect-[3/4] w-full object-cover transition duration-300 hover:scale-105"
                />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Visit / Contact */}
      <section id="visit" className="border-t border-foreground/10 bg-white">
        <div className="mx-auto grid max-w-5xl gap-12 px-6 py-20 sm:grid-cols-2">
          <div>
            <h2 className="font-display text-3xl">Visit us</h2>
            <p className="mt-6 text-muted">
              Salon Lofts
              <br />
              424 E. Stroop Rd.
              <br />
              Kettering, OH 45429
            </p>
            <p className="mt-4">
              <a href="tel:+15555555555" className="text-accent hover:underline">
                (555) 555-5555
              </a>
              <br />
              <a
                href="mailto:hello@threshold.salon"
                className="text-accent hover:underline"
              >
                hello@threshold.salon
              </a>
            </p>
          </div>
          <div>
            <h2 className="font-display text-3xl">Hours</h2>
            <dl className="mt-6 space-y-2">
              {hours.map(([days, time]) => (
                <div key={days} className="flex justify-between text-muted">
                  <dt>{days}</dt>
                  <dd>{time}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </section>

      <footer className="border-t border-foreground/10">
        <div className="mx-auto max-w-5xl px-6 py-8 text-sm text-muted">
          © {new Date().getFullYear()} Threshold · Studio by Evelyn. All rights
          reserved.
        </div>
      </footer>
    </main>
  );
}
