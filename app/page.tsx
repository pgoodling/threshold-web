const services = [
  {
    name: "Cuts & Styling",
    description:
      "Precision cuts tailored to your hair type and lifestyle, finished with a style you can recreate at home.",
    price: "from $45",
  },
  {
    name: "Color",
    description:
      "Full color, balayage, highlights, and gray blending using gentle, professional-grade products.",
    price: "from $95",
  },
  {
    name: "Treatments",
    description:
      "Deep conditioning, smoothing treatments, and scalp care to keep your hair healthy between visits.",
    price: "from $35",
  },
  {
    name: "Special Occasions",
    description:
      "Updos, blowouts, and event styling for weddings, proms, and the days you want to feel your best.",
    price: "from $65",
  },
];

const hours = [
  ["Tuesday – Friday", "9am – 7pm"],
  ["Saturday", "9am – 4pm"],
  ["Sunday – Monday", "Closed"],
];

export default function Home() {
  return (
    <main className="flex-1">
      {/* Navigation */}
      <header className="sticky top-0 z-10 border-b border-foreground/10 bg-background/90 backdrop-blur">
        <nav className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-6 py-4">
          <a href="#" className="font-display text-xl tracking-wide">
            Threshold
          </a>
          <div className="flex items-center gap-6 text-sm">
            <a href="#services" className="hidden hover:text-accent sm:block">
              Services
            </a>
            <a href="#about" className="hidden hover:text-accent sm:block">
              About
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
          </div>
        </nav>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-5xl px-6 py-24 text-center sm:py-32">
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
          Book an appointment
        </a>
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
                <div className="flex items-baseline justify-between">
                  <h3 className="font-display text-xl">{service.name}</h3>
                  <span className="text-sm text-accent">{service.price}</span>
                </div>
                <p className="mt-3 text-muted">{service.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* About */}
      <section id="about" className="mx-auto max-w-5xl px-6 py-20">
        <h2 className="font-display text-3xl">About Threshold</h2>
        <p className="mt-6 max-w-2xl text-lg text-muted">
          Threshold was founded on a simple idea: a great salon visit starts the
          moment you walk in the door. We keep things personal — honest
          consultations, no upselling, and hair you&apos;ll love living with.
        </p>
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
                href="mailto:hello@thresholdsalon.com"
                className="text-accent hover:underline"
              >
                hello@thresholdsalon.com
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
          © {new Date().getFullYear()} Threshold Salon. All rights reserved.
        </div>
      </footer>
    </main>
  );
}
