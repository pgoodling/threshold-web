"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { timeLabel } from "../../lib/format";
import { newEnd, lengthLabel, timingLabel, type ServiceTiming } from "../../lib/serviceChange";

// Change the service on a booked appointment (asked for 2026-10-08): same
// start, the new service's length, timing and price. Hand-adjusted timing is
// dropped -- it belonged to the old service. ends_at and her busy blocks are
// rebuilt by the database's triggers when service_id changes.
//
// Running into the next client is a warning that names them, then "Change
// anyway" (a deliberate overlap, 0048) -- the same as Adjust timing.

type Svc = ServiceTiming & { id: string; name: string; price_cents: number | null };

const usd = (c: number | null) => (c == null ? "—" : `$${(c / 100).toFixed(c % 100 ? 2 : 0)}`);

export default function ChangeServicePanel({
  appt,
  onDone,
  onCancel,
}: {
  appt: { id: string; service_id: string; starts_at: string; ends_at: string; price_cents: number | null };
  onDone: () => void;
  onCancel: () => void;
}) {
  const [services, setServices] = useState<Svc[] | null>(null);
  const [picked, setPicked] = useState<Svc | null>(null);
  const [clash, setClash] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from("services")
      .select("id,name,duration_minutes,start_minutes,process_minutes,finish_minutes,price_cents,active,sort_order")
      .order("sort_order")
      .then(({ data }) =>
        // Active ones, plus the current one even if it's since been retired.
        setServices(
          ((data ?? []) as (Svc & { active: boolean })[]).filter((s) => s.active || s.id === appt.service_id),
        ),
      );
  }, [appt.service_id]);

  async function save(anyway: boolean) {
    if (!picked) return;
    setBusy(true);
    setError(null);
    const { error: err } = await supabase
      .from("appointments")
      .update({
        service_id: picked.id,
        price_cents: picked.price_cents,
        start_minutes: null,
        process_minutes: null,
        finish_minutes: null,
        ...(anyway ? { allow_overlap: true } : {}),
      })
      .eq("id", appt.id);
    setBusy(false);
    if (!err) return onDone();
    if (!/exclusion|overlap|conflict/i.test(err.message)) return setError(err.message);
    // Who it runs into, so "Change anyway" is an informed choice.
    const { data } = await supabase
      .from("appointments")
      .select("starts_at,clients(full_name)")
      .neq("id", appt.id)
      .lt("starts_at", newEnd(appt.starts_at, picked))
      .gt("ends_at", appt.starts_at)
      .not("status", "in", "(cancelled,no_show)")
      .order("starts_at")
      .limit(1);
    const hit = (data ?? [])[0] as
      | { starts_at: string; clients: { full_name: string } | { full_name: string }[] | null }
      | undefined;
    const who = Array.isArray(hit?.clients) ? hit?.clients[0]?.full_name : hit?.clients?.full_name;
    setClash(who ? `${who} at ${timeLabel(hit!.starts_at)}` : "another appointment");
  }

  const current = services?.find((s) => s.id === appt.service_id);

  if (picked) {
    const end = newEnd(appt.starts_at, picked);
    return (
      <div className="mt-4 grid gap-3 text-sm">
        <p className="font-display text-lg">{picked.name}</p>
        <div className="divide-y divide-foreground/10 rounded-lg border border-foreground/15">
          <Row label="Time">
            {timeLabel(appt.starts_at)} – <s className="text-muted">{timeLabel(appt.ends_at)}</s> {timeLabel(end)}
          </Row>
          <Row label="Price">
            {appt.price_cents !== picked.price_cents && (
              <>
                <s className="text-muted">{usd(appt.price_cents)}</s>{" "}
              </>
            )}
            {usd(picked.price_cents)}
          </Row>
          <Row label="Timing">{timingLabel(picked)}</Row>
        </div>
        {clash && (
          <p className="py-1 pl-3 leading-snug" style={{ borderLeft: "3px solid #E0A33A" }}>
            Runs into <span className="font-medium text-[#854F0B]">{clash}</span>. You can still change it.
          </p>
        )}
        {error && <p className="text-accent-dark">{error}</p>}
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => save(clash !== null)}
            disabled={busy}
            className="rounded-md bg-accent px-6 py-2 text-white transition hover:bg-accent-dark disabled:opacity-60"
          >
            {busy ? "Saving…" : clash ? "Change anyway" : "Change service"}
          </button>
          <button
            onClick={() => {
              setPicked(null);
              setClash(null);
              setError(null);
            }}
            className="inline-flex min-h-11 items-center px-2 text-muted hover:text-accent"
          >
            Pick another
          </button>
          <button onClick={onCancel} className="inline-flex min-h-11 items-center px-2 text-muted hover:text-accent">
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-4 text-sm">
      <div className="flex items-center justify-between">
        <p className="font-display text-lg">Change service</p>
        <button onClick={onCancel} className="inline-flex min-h-11 items-center px-2 text-muted hover:text-accent">
          Cancel
        </button>
      </div>
      {services === null ? (
        <p className="mt-2 text-muted">Loading…</p>
      ) : (
        <div className="mt-2 max-h-96 divide-y divide-foreground/10 overflow-y-auto rounded-lg border border-foreground/15">
          {[...(current ? [current] : []), ...services.filter((s) => s.id !== appt.service_id)].map((s) => {
            const now = s.id === appt.service_id;
            return (
              <button
                key={s.id}
                disabled={now}
                onClick={() => setPicked(s)}
                style={now ? { boxShadow: "inset 3px 0 0 var(--accent)" } : undefined}
                className="flex min-h-11 w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-foreground/[0.03] disabled:hover:bg-transparent"
              >
                <span>
                  {s.name}
                  {now && <span className="block text-xs text-muted">now</span>}
                </span>
                <span className="shrink-0 text-muted">
                  {lengthLabel(s.duration_minutes)} · {usd(s.price_cents)}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2">
      <span className="text-muted">{label}</span>
      <span className="text-right tabular-nums">{children}</span>
    </div>
  );
}
