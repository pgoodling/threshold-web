import Link from "next/link";
import { getAdminClient } from "../../../lib/supabaseAdmin";
import CancelPanel from "./CancelPanel";
import { CANCEL_NOTICE_HOURS } from "../../../lib/policy";

// /appointment/<id> — the one link a client gets.
//
// It carries everything they might want: what and when, the hair-notes form if
// they haven't filled it in, and a way to cancel. One URL rather than several,
// because every one of these goes out in a text and a 36-character id already
// costs a segment.
//
// The id is the only credential, which is the same model as the booking
// confirmation: an unguessable v4 UUID. It shows what someone would already
// know from their own confirmation, and the one destructive thing it can do —
// cancelling — is bounded by the notice period and is theirs to do anyway.
//
// Which is exactly why it reads through the ADMIN client and not the anon one.
// RLS on `appointments` grants `authenticated` and nobody else, so an anon read
// returns no row and the page can't tell "wrong id" from "not allowed" — it
// showed every client "That link has expired". The row is fetched server-side
// and only the four fields below ever cross to the browser; the UUID in the URL
// is the check, as documented above. Nothing here may be handed to a client
// component beyond what's already rendered.
export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function AppointmentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!UUID_RE.test(id)) return <Shell><Gone /></Shell>;

  // Unconfigured is not the same as not-found: showing "expired" when the key
  // is missing is how this went unnoticed in the first place.
  const supabase = getAdminClient();
  if (!supabase) return <Shell><Unavailable /></Shell>;

  const { data: appt } = await supabase
    .from("appointments")
    .select("id, starts_at, status, clients(full_name), services(name)")
    .eq("id", id)
    .maybeSingle();

  if (!appt) return <Shell><Gone /></Shell>;

  const client = Array.isArray(appt.clients) ? appt.clients[0] : appt.clients;
  const service = Array.isArray(appt.services) ? appt.services[0] : appt.services;
  const firstName =
    (client?.full_name as string | undefined)?.trim().split(" ")[0] ?? "there";

  const when = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(appt.starts_at as string));

  // Whether it's still a live booking is a fact about the row. Whether it's
  // inside the notice period is a fact about the clock, so CancelPanel works
  // that out on mount — and the route enforces it regardless of what either of
  // them concluded.
  const live = appt.status === "booked" || appt.status === "confirmed";

  // Has the form already been filled in? RLS blocks anon from selecting intake
  // rows, so this counts through a head request rather than reading anything —
  // enough to know whether to offer the form, without exposing the answers.
  const { count } = await supabase
    .from("appointment_intake")
    .select("appointment_id", { count: "exact", head: true })
    .eq("appointment_id", id);
  const hasNotes = (count ?? 0) > 0;

  if (appt.status === "cancelled") {
    return (
      <Shell>
        <div className="mx-auto max-w-lg px-6 py-16">
          <h1 className="font-display text-3xl">This appointment is cancelled</h1>
          <p className="mt-3 text-muted">
            {firstName}, there&apos;s nothing outstanding. Book again whenever
            you&apos;re ready.
          </p>
          <Link
            href="/book"
            className="mt-6 inline-block rounded-md bg-accent px-5 py-2.5 text-sm font-medium text-white transition hover:bg-accent-dark"
          >
            Book an appointment
          </Link>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="mx-auto max-w-lg px-6 py-12">
        <p className="text-xs uppercase tracking-[0.18em] text-muted">
          Your appointment
        </p>
        <h1 className="mt-2 font-display text-3xl">
          {service?.name ?? "Your appointment"}
        </h1>
        <p className="mt-2 text-lg text-muted">{when}</p>

        {/* The form, offered only while it's still useful. */}
        {!hasNotes ? (
          <div className="mt-8 rounded-xl border border-foreground/15 bg-white p-5">
            <p className="font-display text-lg">Tell me about your hair</p>
            <p className="mt-1 text-sm text-muted">
              A minute of questions and a photo or two, so I can have everything
              ready. Optional — but it means we spend your appointment on your
              hair rather than on questions.
            </p>
            <Link
              href={`/hair-notes/${id}`}
              className="mt-4 inline-block rounded-md bg-accent px-5 py-2.5 text-sm font-medium text-white transition hover:bg-accent-dark"
            >
              Tell Evelyn about my hair
            </Link>
          </div>
        ) : (
          <div className="mt-8 rounded-xl border border-foreground/15 bg-white p-5">
            <p className="text-sm">
              <span className="font-medium">Got your hair notes.</span>{" "}
              <span className="text-muted">
                Thank you — Evelyn will read them before you come in.
              </span>
            </p>
            <Link
              href={`/hair-notes/${id}`}
              className="mt-3 inline-block text-sm text-accent-dark underline decoration-accent underline-offset-4"
            >
              Add something or change an answer
            </Link>
          </div>
        )}

        <div className="mt-6">
          <CancelPanel
            appointmentId={id}
            startsAt={appt.starts_at as string}
            live={live}
          />
        </div>

        <p className="mt-6 text-xs text-muted">
          Cancellations are free with {CANCEL_NOTICE_HOURS} hours&apos; notice.
          Inside that, or for a no-show, Evelyn may charge up to the full price
          of the service.
        </p>
      </div>
    </Shell>
  );
}

// Something is wrong at our end, and saying so is better than blaming their
// link for it.
function Unavailable() {
  return (
    <div className="mx-auto max-w-lg px-6 py-24 text-center">
      <h1 className="font-display text-3xl">We can&apos;t load this right now</h1>
      <p className="mt-3 text-muted">
        Something&apos;s wrong at our end, not with your link. Try again in a
        few minutes, or reply to your text and Evelyn will sort it out.
      </p>
      <Link
        href="/"
        className="mt-6 inline-block text-accent underline underline-offset-4"
      >
        Back to the website
      </Link>
    </div>
  );
}

function Gone() {
  return (
    <div className="mx-auto max-w-lg px-6 py-24 text-center">
      <h1 className="font-display text-3xl">That link has expired</h1>
      <p className="mt-3 text-muted">
        If you have an appointment coming up, reply to your confirmation text and
        Evelyn will pick it up.
      </p>
      <Link
        href="/"
        className="mt-8 inline-block text-accent-dark underline decoration-accent underline-offset-4"
      >
        Back to the website
      </Link>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen">
      <header className="border-b border-foreground/10 bg-background/90 backdrop-blur">
        <nav className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <Link href="/" aria-label="Threshold home">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/threshold-logos/threshold-wordmark-terracotta-transparent.svg"
              alt="Threshold — Studio by Evelyn"
              className="h-10 w-auto"
            />
          </Link>
        </nav>
      </header>
      {children}
    </main>
  );
}
