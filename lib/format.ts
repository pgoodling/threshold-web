// Shared formatting + timezone helpers for the salon app.
// The salon operates in a single timezone; all wall-clock times are Eastern.

export const TZ = "America/New_York";

export const money = (cents: number) => `$${Math.round(cents / 100)}`;

export const priceLabel = (price_cents: number, price_is_from = false) =>
  `${price_is_from ? "from " : ""}${money(price_cents)}`;

export const durationLabel = (min: number) =>
  min >= 60
    ? `${Math.floor(min / 60)} hr${min % 60 ? ` ${min % 60} min` : ""}`
    : `${min} min`;

const fmt = (opts: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("en-US", { timeZone: TZ, ...opts });

export const timeLabel = (iso: string) =>
  fmt({ hour: "numeric", minute: "2-digit" }).format(new Date(iso));

export const whenLabel = (iso: string) =>
  fmt({
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));

export const longWhen = (iso: string) =>
  fmt({
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));

export const dateLabel = (iso: string) =>
  fmt({ weekday: "short", month: "short", day: "numeric" }).format(
    new Date(iso),
  );

// salon-local day key (YYYY-MM-DD) of an ISO instant
export const dayKey = (iso: string) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));

// Offset (ms) such that local = utc + offset, for the given zone at that instant.
function tzOffset(timeZone: string, date: Date) {
  const utc = new Date(date.toLocaleString("en-US", { timeZone: "UTC" }));
  const local = new Date(date.toLocaleString("en-US", { timeZone }));
  return local.getTime() - utc.getTime();
}

// Interpret a wall-clock "YYYY-MM-DDTHH:MM" as salon (Eastern) time and return
// the corresponding UTC ISO string — independent of the browser's timezone.
export function salonWallToISO(localDateTime: string): string {
  const [datePart, timePart] = localDateTime.split("T");
  const [y, mo, d] = datePart.split("-").map(Number);
  const [h, mi] = (timePart ?? "00:00").split(":").map(Number);
  const guess = new Date(Date.UTC(y, mo - 1, d, h, mi));
  const offset = tzOffset(TZ, guess);
  return new Date(guess.getTime() - offset).toISOString();
}

// Appointment lifecycle: booked → confirmed → checked_in → checked_out (paid).
export const statusLabel = (status: string): string =>
  (
    ({
      booked: "Booked",
      confirmed: "Confirmed",
      checked_in: "Checked in",
      checked_out: "Checked out",
      completed: "Checked out", // legacy — pre-check-in/out data
      no_show: "No-show",
      cancelled: "Cancelled",
      late: "Running late",
    }) as Record<string, string>
  )[status] ?? status;

// A booked/confirmed appointment whose start time has passed without a
// check-in is "running late" — a computed display state, never stored.
export function liveStatus(status: string, startsAtISO: string): string {
  if (
    (status === "booked" || status === "confirmed") &&
    new Date(startsAtISO).getTime() < Date.now()
  ) {
    return "late";
  }
  return status;
}

// Statuses that count as paid revenue (checked_out, plus legacy completed).
export const PAID_STATUSES = ["checked_out", "completed"];

// Green = checked in (in the chair now), charcoal = checked out & paid,
// red = running late (past start, not checked in).
const STATUS_IN = { bg: "#1e7a46", fg: "#ffffff" };
const STATUS_OUT = { bg: "#2b2320", fg: "#f2ece6" };
const STATUS_LATE = { bg: "#a32d2d", fg: "#ffffff" };

// Calendar block color for a (live) status, or null to fall back to the service
// color — used for booked/upcoming, where the service type is the useful signal.
export function statusBlockColor(
  status: string,
): { bg: string; fg: string } | null {
  if (status === "checked_in") return STATUS_IN;
  if (status === "checked_out" || status === "completed") return STATUS_OUT;
  if (status === "late") return STATUS_LATE;
  return null;
}

// Matching pill/badge classes for lists (Overview, client history, modal).
export function statusPillClass(status: string): string {
  switch (status) {
    case "checked_in":
      return "bg-[#1e7a46] text-white";
    case "checked_out":
    case "completed":
      return "bg-[#2b2320] text-[#f2ece6]";
    case "late":
      return "bg-[#a32d2d] text-white";
    case "no_show":
      return "bg-accent-dark/10 text-accent-dark";
    default:
      return "bg-foreground/5 text-muted";
  }
}

// Payment methods captured at check-out. The split matters for reconciling
// against Intuit: only "card" flows through Intuit's deposits; the rest don't.
export const PAYMENT_METHODS: { value: string; label: string }[] = [
  { value: "card", label: "Card (Intuit)" },
  { value: "cash", label: "Cash" },
  { value: "venmo", label: "Venmo" },
  { value: "zelle", label: "Zelle" },
  { value: "other", label: "Other" },
];

export const paymentLabel = (value: string | null): string =>
  PAYMENT_METHODS.find((m) => m.value === value)?.label ?? value ?? "—";

// "now" as parts in the salon timezone
export function salonNow() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  return { year: get("year"), month: get("month") - 1, day: get("day") };
}
