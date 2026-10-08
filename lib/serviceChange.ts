// What changing an appointment's service does to it: the new service's own
// timing (any hand-adjusted timing is dropped), so the visit runs from the same
// start for the new service's length. The database derives ends_at the same way
// (appointments_set_span); this is for showing it before she saves.

export type ServiceTiming = {
  duration_minutes: number;
  start_minutes: number | null;
  process_minutes: number | null;
  finish_minutes: number | null;
};

export function newEnd(startsISO: string, svc: ServiceTiming) {
  return new Date(Date.parse(startsISO) + svc.duration_minutes * 60_000).toISOString();
}

/** 15 → "15 min", 60 → "1 hr", 90 → "1 hr 30", 180 → "3 hr". */
export function lengthLabel(min: number) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} hr` : `${h} hr ${m}`;
}

/** "60 · 45 · 75" when there's processing time, else the plain length. */
export function timingLabel(svc: ServiceTiming) {
  const p = svc.process_minutes ?? 0;
  if (p <= 0) return lengthLabel(svc.duration_minutes);
  return [svc.start_minutes ?? 0, p, svc.finish_minutes ?? 0].join(" · ");
}
