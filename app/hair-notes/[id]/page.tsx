import { getAdminClient } from "../../../lib/supabaseAdmin";
import HairNotesForm from "./HairNotesForm";

// /hair-notes/<appointment-id>
//
// Reached from the booking confirmation, and later from the confirmation email
// and text, so a photo can be added the night before from the sofa — which is
// when people actually think of it.
//
// The appointment id in the URL is the only credential, which is the same model
// the booking confirmation already uses: an unguessable v4 UUID. It's enough
// because the page never READS anything sensitive back — RLS lets anon write
// intake rows but not select them, so a leaked link can leave answers, not
// retrieve someone else's.
//
// The greeting lookup goes through the ADMIN client, for the same reason
// /appointment/[id] does: RLS on `appointments` and `clients` grants
// `authenticated` and nobody else, so an anon read comes back empty and the
// page can't tell "wrong id" from "not allowed". Every client got "That link
// has expired". Only the first name and the appointment time cross to the
// browser — the form writes as anon, and still can't read anyone's answers.

export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function HairNotesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  if (!UUID_RE.test(id)) return <Shell><NotFound /></Shell>;

  // Unconfigured is not not-found. Reporting our own missing key as their link
  // expiring is how the same bug on /appointment went unnoticed for weeks.
  const supabase = getAdminClient();
  if (!supabase) return <Shell><Unavailable /></Shell>;

  // Only to greet them by name and confirm the link is live.
  const { data: appt } = await supabase
    .from("appointments")
    .select("id, client_id, status, starts_at, clients(full_name)")
    .eq("id", id)
    .maybeSingle();

  if (!appt || appt.status === "cancelled") return <Shell><NotFound /></Shell>;

  const client = Array.isArray(appt.clients) ? appt.clients[0] : appt.clients;
  const firstName =
    (client?.full_name as string | undefined)?.trim().split(" ")[0] ?? "Hi";

  const when = appt.starts_at
    ? new Intl.DateTimeFormat("en-US", {
        timeZone: "America/New_York",
        weekday: "long",
        month: "long",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }).format(new Date(appt.starts_at as string))
    : null;

  return (
    <Shell>
      <HairNotesForm
        appointmentId={appt.id as string}
        clientId={(appt.client_id as string) ?? null}
        firstName={firstName}
        when={when}
      />
    </Shell>
  );
}

// Her header, so this doesn't feel like a form on a stranger's website. Someone
// arriving from a text needs to recognise where they've landed before they'll
// answer anything.
function Shell({ children }: { children: React.ReactNode }) {
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
          <span className="text-sm text-muted">Hair notes</span>
        </nav>
      </header>
      {children}
    </main>
  );
}

// Ours, not theirs — say so rather than blaming their link.
function Unavailable() {
  return (
    <div className="mx-auto max-w-lg px-6 py-24 text-center">
      <h1 className="font-display text-3xl">We can&apos;t load this right now</h1>
      <p className="mt-3 text-muted">
        Something&apos;s wrong at our end, not with your link. Try again in a
        few minutes, or reply to your text and Evelyn will sort it out.
      </p>
      <a
        href="/"
        className="mt-8 inline-block text-accent-dark underline decoration-accent underline-offset-4"
      >
        Back to the website
      </a>
    </div>
  );
}

function NotFound() {
  return (
    <div className="mx-auto max-w-lg px-6 py-24 text-center">
      <h1 className="font-display text-3xl">That link has expired</h1>
      <p className="mt-3 text-muted">
        If you&apos;ve got an appointment coming up and wanted to send Evelyn
        something about your hair, just reply to your confirmation text.
      </p>
      <a
        href="/"
        className="mt-8 inline-block text-accent-dark underline decoration-accent underline-offset-4"
      >
        Back to the website
      </a>
    </div>
  );
}
