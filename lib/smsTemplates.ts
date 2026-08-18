import { TZ } from "./format";

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
}): string {
  return (
    `Hi ${firstName(opts.clientName)}, it's Threshold Salon — ` +
    `you're booked for ${opts.service} ${when(opts.startsAt)}. ` +
    `Reply C to confirm, or call us if you need to change it.`
  );
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
