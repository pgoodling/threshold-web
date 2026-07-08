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
