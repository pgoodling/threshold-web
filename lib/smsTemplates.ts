import { TZ } from "./format";
// One link per appointment: it carries the hair-notes form, the details and
// cancellation, so a text needs only one URL rather than several.
import { appointmentUrl } from "./policy";
import { beforeOpening } from "./opening";

// What the automated texts actually say.
//
// In one file for the same reason the consent wording is: the A2P campaign
// submission quotes sample messages, and carriers compare what's sent against
// what was described. Keeping the copy here means a reworded reminder is a
// visible, dated change rather than something buried in a cron handler.
//
// House style, such as it is: say who it's from, and keep it to one thought.
//
// STOP used to go on the first message only, which is all CTIA actually
// requires and keeps the rest sounding like a person rather than a compliance
// notice. It's now on every message, and that's a deliberate trade rather than
// a change of mind: the campaign was rejected once for a sample without it, a
// reviewer reads each sample in isolation and can't see what came before it,
// and another rejection cycle costs a fortnight the opening doesn't have.
// Revisit once the campaign is approved and there's room to be right.

const firstName = (full: string | null | undefined) =>
  (full ?? "").trim().split(" ")[0] || "there";


// For the day-before reminder, where "Friday" can only mean tomorrow.
const when = (iso: string) =>
  new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    weekday: "long",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));

// For anything further out. The catch-up sweep covers appointments booked weeks
// ahead, and "Friday at 1:00" for a date in October reads as this Friday — the
// kind of mistake that has someone turning up six weeks early.
const longWhen = (iso: string) =>
  new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));

const time = (iso: string) =>
  new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));

// Day-before reminder. Ends with the one instruction we parse on the way back
// in, phrased as a request rather than a menu — "reply C to confirm, or call us"
// invites a phone call from someone who wanted to reschedule anyway.
export function reminderText(opts: {
  clientName: string | null;
  service: string;
  startsAt: string;
  appointmentId?: string | null;
  /** Changes the wording, not whether the link goes out. */
  hasNotes?: boolean;
}): string {
  // STOP on the reminder as well as the confirmation.
  //
  // House style was opt-out on the first message only, which is what CTIA
  // actually requires — every message is belt-and-braces. But the campaign has
  // already been rejected once, another cycle costs a fortnight, and a reviewer
  // reading a sample in isolation can't see that the confirmation carried it.
  // Not worth being right about.
  const stop = "(Reply STOP to opt out.)";
  const base =
    `Hi ${firstName(opts.clientName)}, it's Threshold Salon — ` +
    `you're booked for ${opts.service} ${when(opts.startsAt)}. ` +
    `Reply C to confirm.`;

  if (!opts.appointmentId) return `${base} ${stop}`;

  // The link always goes out, because it's also how they cancel. Only the
  // reason to tap it changes: the day before is when someone actually thinks to
  // photograph their roots, but there's no sense nagging about a form they've
  // already filled in.
  const why = opts.hasNotes
    ? "Change or cancel:"
    : "Tell me about your hair, or change it:";
  return `${base} ${why} ${appointmentUrl(opts.appointmentId)} ${stop}`;
}

// The catch-up confirmation, sent by hand from the Texts screen.
//
// This is the first text most of these people will ever get from the salon.
// They booked weeks ago, off Instagram or in person, and have heard nothing
// since — so it can't read like the third reminder in a sequence. Three jobs,
// in this order: say who's texting, confirm the specific appointment, hand over
// the link.
//
// It goes from Evelyn's PERSONAL phone, not the salon number — the campaign
// isn't approved, which is the whole reason this exists. So it must not tell
// anyone this is the salon's number or ask them to save it: forty people would
// file her personal cell under Threshold, and the real salon number would then
// arrive as a stranger. It identifies her by name and leaves numbers alone.
//
// No STOP line either. This is one person texting another from a personal
// handset — not an A2P message, and nothing is listening for the word. A warm
// first message that ends in a compliance footer reads like a blast, which is
// exactly what it isn't. The automated templates keep theirs.
//
// Length costs nothing here. The automated confirmation that replaces this once
// A2P clears is shorter on purpose — that one is a receipt for something they
// did thirty seconds ago, and warmth there reads as padding.
export function welcomeConfirmText(opts: {
  clientName: string | null;
  service: string;
  startsAt: string;
  appointmentId?: string | null;
  /** Injectable so the studio preview and tests don't drift with the clock. */
  now?: Date;
}): string {
  // "We open Monday" has to stop being true on Monday. After opening it's just
  // a confirmation, and the excitement moves to seeing them.
  const opening = beforeOpening(opts.now ?? new Date())
    ? "we open Monday and I'm so glad you're already on the books."
    : "so glad you're on the books.";

  const base =
    `Hi ${firstName(opts.clientName)}! It's Evelyn from Threshold — ${opening} ` +
    `You're booked for ${opts.service} on ${longWhen(opts.startsAt)}.`;

  const tail = opts.appointmentId
    ? ` Tell me about your hair before you come in, or change your time here: ` +
      `${appointmentUrl(opts.appointmentId)}`
    : " Just reply here if you need anything.";

  return `${base}${tail}`;
}

// Sent when she's past her start time and hasn't arrived. Deliberately not
// scolding: most people who are late already know, and the useful thing is to
// find out whether they're coming at all so the chair isn't held for nothing.
export function runningLateText(opts: {
  clientName: string | null;
  startsAt: string;
}): string {
  return (
    `Hi ${firstName(opts.clientName)}, it's Threshold Salon — ` +
    `we had you down for ${time(opts.startsAt)}. ` +
    `Are you still on your way? No rush, just let us know. ` +
    `(Reply STOP to opt out.)`
  );
}

// The acknowledgement after a client replies C. Short on purpose; it exists so
// the reply doesn't vanish into silence and leave them wondering.
export function confirmedText(opts: { startsAt: string }): string {
  return (
    `Lovely — you're confirmed for ${when(opts.startsAt)}. See you then! ` +
    `Threshold Salon (Reply STOP to opt out.)`
  );
}

// The short-notice booking alert — the one message in this file that goes to
// Evelyn rather than to a client.
//
// It lives here anyway, because the reason this file exists is that message
// copy shouldn't be buried in a handler. But it is NOT a consumer message and
// carries no STOP: she cannot opt out of her own business, and offering her the
// keyword would put her number into the opt-out list that governs her clients.
//
// A2P: this is a message type the campaign does not currently describe. See
// docs/A2P-CAMPAIGN.md — it needs adding to the submission before the alert is
// switched on, or it's the same describe-one-thing-send-another mismatch that
// has caused rejections already.
//
// Written to be readable from a lock screen without opening it, so the useful
// part comes first: when, then who, then what. "TODAY 2:00 PM" rather than a
// date, because the whole point of this alert is that it's imminent.
export function ownerNewBookingText(opts: {
  clientName: string | null;
  serviceName: string | null;
  startsAt: string;
  isNewClient: boolean;
}): string {
  const now = new Date();
  const start = new Date(opts.startsAt);
  const sameDay =
    new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(now) ===
    new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(start);

  const label = sameDay ? `TODAY ${time(opts.startsAt)}` : when(opts.startsAt);
  const who = (opts.clientName ?? "").trim() || "Someone";
  const what = opts.serviceName ?? "an appointment";
  const tag = opts.isNewClient ? " (new client)" : "";

  return (
    `New booking — ${label}: ${who}${tag}, ${what}. ` +
    `Booked just now at threshold.salon.`
  );
}

// What counts as "yes I'm coming". Kept liberal: people reply how they talk,
// and a client who typed "confirmed!" should not be treated as unconfirmed.
const CONFIRM_WORDS = [
  "c",
  "y",
  "yes",
  "confirm",
  "confirmed",
  "yep",
  "yeah",
  "ok",
  "okay",
  "👍",
];

export function isConfirmation(body: string): boolean {
  const word = body.trim().toLowerCase().replace(/[.!]+$/, "");
  return CONFIRM_WORDS.includes(word);
}
