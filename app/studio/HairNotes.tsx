"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { whenLabel } from "../../lib/format";
import {
  hairSummary,
  offersFor,
  timingFlag,
  type Intake,
} from "../../lib/hairNotes";
import Button from "./Button";

// Everything about this client's hair, on her record: what Evelyn mixes, and
// what the client told her before the visit.
//
// Formula first, because it's what she reaches for at the chair. It's
// append-only — a colourist's own notes are the thing she can least afford to
// lose, and overwriting a single field destroys the history that makes the next
// visit repeatable.

type FormulaRow = {
  id: string;
  formula: string;
  note: string | null;
  created_at: string;
};

type IntakeRow = Intake & {
  appointment_id: string;
  created_at: string;
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
  const [unavailable, setUnavailable] = useState(false);
  const [formula, setFormula] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    Promise.all([
      supabase
        .from("client_formulas")
        .select("id,formula,note,created_at")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false }),
      supabase
        .from("appointment_intake")
        .select("*")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false }),
    ]).then(([f, i]) => {
      if (f.error) {
        setUnavailable(true);
        return;
      }
      setHistory((f.data ?? []) as FormulaRow[]);
      setIntakes((i.data ?? []) as unknown as IntakeRow[]);
    });
  }, [clientId]);

  useEffect(load, [load]);

  async function saveFormula() {
    const value = formula.trim();
    if (!value) return;
    setBusy(true);
    setError(null);

    // History first: if this fails she'd rather have no record than a current
    // formula with nothing behind it.
    const { error: histErr } = await supabase.from("client_formulas").insert({
      client_id: clientId,
      formula: value,
      note: note.trim() || null,
    });
    if (histErr) {
      setBusy(false);
      setError(histErr.message);
      return;
    }

    // The client record keeps the current one, so everything that already reads
    // `hair_formula` keeps working.
    await supabase
      .from("clients")
      .update({ hair_formula: value })
      .eq("id", clientId);

    setBusy(false);
    setFormula("");
    setNote("");
    onFormulaSaved?.(value);
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
  const offers = latest ? offersFor(latest.struggles ?? []) : [];

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
          <Button onClick={saveFormula} disabled={busy || !formula.trim()}>
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
                <span className="font-mono text-sm">{h.formula}</span>
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
          {latest && (
            <span className="shrink-0 text-xs text-muted">
              {whenLabel(latest.created_at)}
            </span>
          )}
        </div>

        {!latest ? (
          <p className="mt-2 text-sm text-muted">
            Nothing yet. Clients are offered the hair-notes form after booking —
            it&apos;s optional, so not everyone fills it in.
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

            <div className="rounded-xl border border-foreground/15 bg-white">
              <p className="border-b border-foreground/10 px-4 py-3 text-sm">
                {hairSummary(latest).join(" · ") || "Not much detail given."}
              </p>

              {offers.length > 0 && (
                <div className="border-b border-foreground/10 px-4 py-3">
                  <p className="text-xs uppercase tracking-wider text-muted">
                    Struggling with — worth offering
                  </p>
                  <div className="mt-2 grid gap-1.5">
                    {offers.map((o) => (
                      <p key={o.problem} className="flex gap-2 text-sm">
                        <span className="font-medium">{o.offer}</span>
                        <span className="text-muted">— {o.problem}</span>
                      </p>
                    ))}
                  </div>
                </div>
              )}

              {latest.allergies && (
                <p
                  className="border-b border-foreground/10 px-4 py-3 text-sm"
                  style={{ boxShadow: "inset 4px 0 0 #8f3f4a" }}
                >
                  <span className="text-xs uppercase tracking-wider text-muted">
                    Allergies
                  </span>
                  <br />
                  {latest.allergies}
                </p>
              )}

              {latest.note && (
                <p className="px-4 py-3 font-display text-sm italic">
                  “{latest.note}”
                </p>
              )}
            </div>

            {intakes.length > 1 && (
              <p className="text-xs text-muted">
                {intakes.length - 1} earlier{" "}
                {intakes.length === 2 ? "answer" : "answers"} on file.
              </p>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
