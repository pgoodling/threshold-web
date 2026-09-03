import { TZ } from "./format";
// One link per appointment: it carries the hair-notes form, the details and
// cancellation, so a text needs only one URL rather than several.
import { appointmentUrl } from "./policy";

// What the automated texts actually say.
//
// In one file for the same reason the consent wording is: the A2P campaign
// submission quotes sample messages, and carriers compare what's sent against
// what was described. Keeping the copy here means a reworded reminder is a
// visible, dated change rather than something buried in a cron handler.
//
// House style, such as it is: say who it's from, keep it to one thought, and
// leave STOP off every message except the first. Carriers want the opt-out
// language available, not stapled to every text — and a reminder that reads
// like a compliance notice doesn't sound like Evelyn.

const firstName = (full: string | null | undefined) =>
  (full ?? "").trim().split(" ")[0] || "there";


const when = (iso: string) =>
  new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    weekday: "long",
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
  const base =
    `Hi ${firstName(opts.clientName)}, it's Threshold Salon — ` +
    `you're booked for ${opts.service} ${when(opts.startsAt)}. ` +
    `Reply C to confirm. (Reply STOP to opt out.)`;

  if (!opts.appointmentId) return base;

  // The link always goes out, because it's also how they cancel. Only the
  // reason to tap it changes: the day before is when someone actually thinks to
  // photograph their roots, but there's no sense nagging about a form they've
  // already filled in.
  const why = opts.hasNotes
    ? "Change or cancel:"
    : "Tell me about your hair, or change it:";
  return `${base} ${why} ${appointmentUrl(opts.appointmentId)}`;
}

// The catch-up confirmation, sent by hand from the Texts screen.
//
// Everyone booked before texting worked never got a confirmation, so this is
// the one-off sweep that fixes that. Worded as a confirmation rather than a
// reminder — some of these appointments are weeks out, and "reminder" for
// something in October reads as a mistake.
export function confirmSweepText(opts: {
  clientName: string | null;
  service: string;
  startsAt: string;
  appointmentId?: string | null;
}): string {
  const base =
    `Hi ${firstName(opts.clientName)}! It's Evelyn at Threshold Salon — ` +
    `confirming you're booked for ${opts.service} ${when(opts.startsAt)}.`;

  const tail = opts.appointmentId
    ? ` Tell me about your hair, or change it: ${appointmentUrl(opts.appointmentId)}`
    : " Reply here if you need anything.";

  return `${base}${tail} (Reply STOP to opt out.)`;
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
    `Are you still on your way? No rush, just let us know.`
  );
}

// The acknowledgement after a client replies C. Short on purpose; it exists so
// the reply doesn't vanish into silence and leave them wondering.
export function confirmedText(opts: { startsAt: string }): string {
  return `Lovely — you're confirmed for ${when(opts.startsAt)}. See you then! Threshold Salon`;
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
