"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { whenLabel, dateLabel } from "../../lib/format";
import {
  hairSummary,
  offersFor,
  timingFlag,
  type Intake,
} from "../../lib/hairNotes";
import Button from "./Button";
import AppointmentPhotos from "./AppointmentPhotos";

// Everything about this client's hair, on her record: what Evelyn mixes, and
// what the client told her before the visit.
//
// Formula first, because it's what she reaches for at the chair. It's
// append-only — a colourist's own notes are the thing she can least afford to
// lose, and overwriting a single field destroys the history that makes the next
// visit repeatable.

type FormulaRow = {
  id: string;
  /** Null when the entry is an observation about the formula already on file. */
  formula: string | null;
  note: string | null;
  created_at: string;
};

type IntakeRow = Intake & {
  appointment_id: string;
  created_at: string;
  /** The visit it was filled in for -- one form per appointment. */
  appointments: { starts_at: string; services: { name: string } | null } | null;
};

// One visit's worth of what the client sent: the form (if filled in) and how
// many photos are in the appointment's folder.
type Visit = {
  id: string;
  starts_at: string;
  service: string | null;
  intake: IntakeRow | null;
  photos: number;
};

export default function HairNotes({
  clientId,
  currentFormula,
  onFormulaSaved,
}: {
  clientId: string;
  currentFormula: string | null;
  onFormulaSaved?: (formula: string) => void;
}) {
  const [history, setHistory] = useState<FormulaRow[]>([]);
  const [intakes, setIntakes] = useState<IntakeRow[]>([]);
  // Every visit with a form or photos, newest first; and which are open.
  const [visits, setVisits] = useState<Visit[] | null>(null);
  const [opened, setOpened] = useState<Set<string>>(new Set());
  const [unavailable, setUnavailable] = useState(false);
  const [formula, setFormula] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Photos live in storage under each appointment's id, so finding a client's
  // photos means asking each of her visits. A client has a handful of visits;
  // the folders are listed in parallel.
  async function loadVisits(forms: IntakeRow[]) {
    const { data } = await supabase
      .from("appointments")
      .select("id,starts_at,status,services(name)")
      .eq("client_id", clientId)
      .neq("status", "cancelled")
      .order("starts_at", { ascending: false });
    const appts = (data ?? []) as unknown as {
      id: string;
      starts_at: string;
      services: { name: string } | null;
    }[];
    const counts = await Promise.all(
      appts.map((a) =>
        supabase.storage
          .from("booking-photos")
          .list(a.id, { limit: 20 })
          .then(({ data: files }) => (files ?? []).filter((f) => f.id && !f.name.startsWith(".")).length),
      ),
    );
    const list = appts
      .map((a, n) => ({
        id: a.id,
        starts_at: a.starts_at,
        service: a.services?.name ?? null,
        intake: forms.find((x) => x.appointment_id === a.id) ?? null,
        photos: counts[n],
      }))
      .filter((v) => v.intake || v.photos > 0);
    setVisits(list);
    // The newest opens on its own; the rest wait to be asked for.
    setOpened(new Set(list.length ? [list[0].id] : []));
  }

  const load = useCallback(() => {
    Promise.all([
      supabase
        .from("client_formulas")
        .select("id,formula,note,created_at")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false }),
      supabase
        .from("appointment_intake")
        .select("*,appointments(starts_at,services(name))")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false }),
    ]).then(([f, i]) => {
      if (f.error) {
        setUnavailable(true);
        return;
      }
      setHistory((f.data ?? []) as FormulaRow[]);
      const forms = (i.data ?? []) as unknown as IntakeRow[];
      setIntakes(forms);
      loadVisits(forms);
    });
  }, [clientId]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (id: string) =>
    setOpened((o) => {
      const n = new Set(o);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  useEffect(load, [load]);

  // Either field on its own is a valid entry.
  //
  // It used to demand a formula, so "pulled warm, 35 min — go cooler next time"
  // couldn't be recorded unless the same formula was retyped beside it. The
  // observation is usually the point; the formula hasn't changed. Requiring
  // both meant the useful half went unwritten, or got attached to a duplicate
  // formula row that made the history harder to read.
  async function saveEntry() {
    const value = formula.trim();
    const noteValue = note.trim();
    if (!value && !noteValue) return;
    setBusy(true);
    setError(null);

    // History first: if this fails she'd rather have no record than a current
    // formula with nothing behind it.
    const { error: histErr } = await supabase.from("client_formulas").insert({
      client_id: clientId,
      formula: value || null,
      note: noteValue || null,
    });
    if (histErr) {
      setBusy(false);
      setError(histErr.message);
      return;
    }

    // Only a new formula changes the current one. A note about the existing
    // formula must not blank it — everything downstream reads `hair_formula`.
    if (value) {
      await supabase
        .from("clients")
        .update({ hair_formula: value })
        .eq("id", clientId);
      onFormulaSaved?.(value);
    }

    setBusy(false);
    setFormula("");
    setNote("");
    load();
  }

  if (unavailable) {
    return (
      <p className="mt-4 rounded-xl border border-foreground/10 bg-white px-4 py-3 text-sm text-muted">
        Run migration 0028_hair_notes.sql to record formulas and read what
        clients send in.
      </p>
    );
  }

  const latest = intakes[0] ?? null;
  const flag = latest ? timingFlag(latest) : null;

  return (
    <div className="mt-4 grid gap-6">
      {/* ── Formula ─────────────────────────────────────────────────────── */}
      <section>
        <div className="flex items-baseline gap-3">
          <h3 className="text-xs uppercase tracking-[0.15em] text-muted">
            Formula
          </h3>
          <span className="h-px flex-1 bg-foreground/10" />
        </div>

        {currentFormula && (
          <p className="mt-2 font-mono text-lg">{currentFormula}</p>
        )}

        <div className="mt-3 flex flex-wrap items-end gap-2">
          <label className="block">
            <span className="mb-1 block text-xs uppercase tracking-wider text-muted">
              New formula
            </span>
            <input
              className="input w-36 font-mono"
              placeholder="9G + 20 vol"
              value={formula}
              onChange={(e) => setFormula(e.target.value)}
            />
          </label>
          <label className="block flex-1">
            <span className="mb-1 block text-xs uppercase tracking-wider text-muted">
              Note
            </span>
            <input
              className="input"
              placeholder="Pulled warm, 35 min — go cooler next time"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
          <Button
            onClick={saveEntry}
            disabled={busy || (!formula.trim() && !note.trim())}
          >
            {busy ? "Saving…" : "Record"}
          </Button>
        </div>

        {error && <p className="mt-2 text-sm text-accent-dark">{error}</p>}

        {history.length > 0 && (
          <div className="mt-3 overflow-hidden rounded-xl border border-foreground/15 bg-white">
            {history.map((h, i) => (
              <div
                key={h.id}
                className={`flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-2.5 ${
                  i > 0 ? "border-t border-foreground/10" : ""
                } ${i === 0 ? "" : "text-muted"}`}
              >
                {h.formula && (
                  <span className="font-mono text-sm">{h.formula}</span>
                )}
                {h.note && <span className="text-sm">{h.note}</span>}
                <span className="ml-auto shrink-0 text-xs text-muted">
                  {whenLabel(h.created_at)}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── What she told us ────────────────────────────────────────────── */}
      <section>
        <div className="flex items-baseline gap-3">
          <h3 className="text-xs uppercase tracking-[0.15em] text-muted">
            From the client
          </h3>
          <span className="h-px flex-1 bg-foreground/10" />
        </div>

        {/* One card per visit -- the form and the photos the client sent for
            it -- in calendar order, newest first. The newest is open; earlier
            ones are a line each until tapped. A parent booking a child under
            their own name fills the form once per visit, and the answers
            describe two heads of hair, so every visit is kept, never merged. */}
        {visits === null ? (
          <p className="mt-2 text-sm text-muted">Loading…</p>
        ) : visits.length === 0 ? (
          <p className="mt-2 text-sm text-muted">
            Nothing yet. Clients are offered the hair-notes form and photos after
            booking — it&apos;s optional, so not everyone fills it in.
          </p>
        ) : (
          <div className="mt-2 grid gap-3">
            {flag && (
              <div
                className="flex gap-3 rounded-xl border border-foreground/15 bg-white p-3"
                style={{ boxShadow: "inset 4px 0 0 #bd8f45" }}
              >
                <p className="pl-2 text-sm">
                  <span className="font-medium">This one may run long.</span>{" "}
                  <span className="text-muted">
                    {flag} hair — worth checking the time you&apos;ve
                    allowed.
                  </span>
                </p>
              </div>
            )}

            <div className="overflow-hidden rounded-xl border border-foreground/15 bg-white">
              {visits.map((v, n) => {
                const open = opened.has(v.id);
                const it = v.intake;
                const what = [it ? "form" : null, v.photos ? `${v.photos} photo${v.photos === 1 ? "" : "s"}` : null]
                  .filter(Boolean)
                  .join(" · ");
                return (
                  <div key={v.id} className={n > 0 ? "border-t border-foreground/10" : ""}>
                    <button
                      onClick={() => toggle(v.id)}
                      aria-expanded={open}
                      className="flex min-h-11 w-full items-center justify-between gap-3 px-4 py-2 text-left"
                    >
                      <span className="min-w-0">
                        <span className={open ? "font-medium" : ""}>
                          {v.service ?? "A visit"} · {dateLabel(v.starts_at)}
                        </span>
                        <span className="block text-xs text-muted">{what}</span>
                      </span>
                      <span className="shrink-0 text-muted" aria-hidden="true">
                        {open ? "–" : "+"}
                      </span>
                    </button>

                    {open && (
                      <div className="px-4 pb-3">
                        {it && (
                          <>
                            <p className="text-sm">{hairSummary(it).join(" · ") || "Not much detail given."}</p>
                            {offersFor(it.struggles ?? []).length > 0 && (
                              <div className="mt-2">
                                <p className="text-xs uppercase tracking-wider text-muted">
                                  Struggling with — worth offering
                                </p>
                                <div className="mt-1 grid gap-1">
                                  {offersFor(it.struggles ?? []).map((o) => (
                                    <p key={o.problem} className="flex gap-2 text-sm">
                                      <span className="font-medium">{o.offer}</span>
                                      <span className="text-muted">— {o.problem}</span>
                                    </p>
                                  ))}
                                </div>
                              </div>
                            )}
                            {it.allergies && (
                              <p className="mt-2 py-1 pl-3 text-sm" style={{ boxShadow: "inset 3px 0 0 #8f3f4a" }}>
                                <span className="text-xs uppercase tracking-wider text-muted">Allergies</span>
                                <br />
                                {it.allergies}
                              </p>
                            )}
                            {it.note && <p className="mt-2 font-display text-sm italic">“{it.note}”</p>}
                            <p className="mt-1 text-xs text-muted">Filled in {whenLabel(it.created_at)}</p>
                          </>
                        )}
                        {v.photos > 0 && <AppointmentPhotos appointmentId={v.id} />}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
