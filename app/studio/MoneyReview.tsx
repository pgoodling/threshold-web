"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Wand2, Undo2 } from "lucide-react";
import { supabase } from "../../lib/supabase";

// The review queue.
//
// One question per row, and it is not "which category" — it is "is this the
// business's money or hers". A rule can suggest a category; nothing can
// suggest that, because her accounts are mixed and only she knows what a $175
// Amazon charge was for.
//
// So the two buttons are Business and Personal, and Personal doesn't ask for a
// category at all. Making her file a personal purchase into a Schedule C
// bucket before it can leave the queue would be busywork that teaches the
// wrong model.
//
// "Always do this" is what makes the queue shrink. It writes a rule for next
// time AND fills in the other unreviewed rows from the same merchant — as
// suggestions, still unreviewed, because one Walgreens trip being back-bar
// supplies doesn't make the next one so.

type Category = { id: string; name: string; kind: string };

type Txn = {
  id: string;
  posted_on: string;
  amount_cents: number;
  description: string;
  merchant: string | null;
  category_id: string | null;
  category_source: string | null;
  pending: boolean | null;
};

const money = (cents: number) =>
  `${cents < 0 ? "−" : "+"}$${Math.abs(cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const day = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });

export default function MoneyReview({ onCount }: { onCount?: (n: number) => void }) {
  const [rows, setRows] = useState<Txn[]>([]);
  const [cats, setCats] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [undo, setUndo] = useState<{ id: string; label: string } | null>(null);
  // Said out loud, because "Always" used to change nothing she was looking at.
  const [flash, setFlash] = useState<string | null>(null);

  // Bumped to refetch — after an undo, when the row has to come back.
  const [reloadKey, setReloadKey] = useState(0);
  const reload = useCallback(() => {
    // setLoading belongs here, in an event handler — not in the effect, where
    // a synchronous setState is what react-hooks/set-state-in-effect forbids.
    setLoading(true);
    setReloadKey((k) => k + 1);
  }, []);

  // Promise chain rather than an async call, matching the other studio
  // screens: state is set in .then(), not synchronously inside the effect.
  useEffect(() => {
    let alive = true;
    Promise.all([
      supabase
        .from("bank_transactions")
        .select("id,posted_on,amount_cents,description,merchant,category_id,category_source,pending")
        .is("reviewed_at", null)
        .order("posted_on", { ascending: true })
        .limit(500),
      supabase
        .from("expense_categories")
        .select("id,name,kind")
        .order("sort_order", { ascending: true }),
    ]).then(([t, c]) => {
      if (!alive) return;
      if (t.error) setError(t.error.message);
      const list = (t.data ?? []) as Txn[];
      setRows(list);
      setCats((c.data ?? []) as Category[]);
      onCount?.(list.length);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [reloadKey, onCount]);

  async function setCategory(id: string, categoryId: string | null) {
    setRows((r) =>
      r.map((x) =>
        x.id === id ? { ...x, category_id: categoryId, category_source: "manual" } : x,
      ),
    );
    await supabase
      .from("bank_transactions")
      .update({ category_id: categoryId, category_source: categoryId ? "manual" : null })
      .eq("id", id);
  }

  // reviewed_at and is_business move together — the table's check constraint
  // enforces it, and the queue's whole definition is "reviewed_at is null".
  async function decide(row: Txn, isBusiness: boolean) {
    setBusyId(row.id);
    setError(null);
    setFlash(null);
    const { error: e } = await supabase
      .from("bank_transactions")
      .update({ is_business: isBusiness, reviewed_at: new Date().toISOString() })
      .eq("id", row.id);
    if (e) {
      setError(e.message);
      setBusyId(null);
      return;
    }
    setRows((r) => {
      const next = r.filter((x) => x.id !== row.id);
      onCount?.(next.length);
      return next;
    });
    setUndo({
      id: row.id,
      label: `${row.merchant ?? "That one"} — ${isBusiness ? "business" : "personal"}`,
    });
    setBusyId(null);
  }

  async function undoLast() {
    if (!undo) return;
    await supabase
      .from("bank_transactions")
      .update({ is_business: null, reviewed_at: null })
      .eq("id", undo.id);
    setUndo(null);
    reload();
  }

  /**
   * Rule for next time, the siblings already queued, and this row filed.
   *
   * That last part matters. "Always file Walgreens as back bar" plainly means
   * this one too, and leaving the row she just pressed sitting in the queue
   * made the button look broken — the only thing that changed was another
   * row's stripe, several rows away.
   */
  async function always(row: Txn) {
    const merchant = row.merchant?.trim();
    const categoryId = row.category_id;
    if (!merchant || !categoryId) return;
    setBusyId(row.id);
    setError(null);

    // 0040 put a unique index on lower(pattern), so pressing this twice is a
    // 23505 rather than a second rule. That is the desired end state — the
    // rule exists — so treat it as success and carry on.
    const { error: ruleErr } = await supabase.from("category_rules").insert({
      pattern: merchant,
      category_id: categoryId,
      is_business: true,
      priority: 100,
    });
    if (ruleErr && ruleErr.code !== "23505") {
      setError(`Couldn't save that rule: ${ruleErr.message}`);
      setBusyId(null);
      return;
    }

    const siblings = rows.filter(
      (x) => x.id !== row.id && x.merchant?.trim() === merchant && !x.category_id,
    );
    if (siblings.length > 0) {
      await supabase
        .from("bank_transactions")
        .update({ category_id: categoryId, category_source: "rule" })
        .in(
          "id",
          siblings.map((s) => s.id),
        );
    }

    // File the row she pressed it on, the same way Business would.
    const { error: fileErr } = await supabase
      .from("bank_transactions")
      .update({ is_business: true, reviewed_at: new Date().toISOString() })
      .eq("id", row.id);
    if (fileErr) {
      setError(fileErr.message);
      setBusyId(null);
      return;
    }

    const catName = cats.find((c) => c.id === categoryId)?.name ?? "that category";
    setRows((r) => {
      const next = r
        .filter((x) => x.id !== row.id)
        .map((x) =>
          siblings.some((s) => s.id === x.id)
            ? { ...x, category_id: categoryId, category_source: "rule" }
            : x,
        );
      onCount?.(next.length);
      return next;
    });
    setUndo({ id: row.id, label: `${merchant} — business` });
    setFlash(
      `${merchant} will file as ${catName} from now on` +
        (siblings.length > 0
          ? ` — ${siblings.length} other row${siblings.length === 1 ? "" : "s"} filled in`
          : ""),
    );
    setBusyId(null);
  }

  // Rendered in both the list and the empty state: pressing "Always" on the
  // last queued row empties the queue, and that is exactly when she most needs
  // telling what just happened.
  const flashLine = flash && (
    <div className="mt-6 flex max-w-prose items-center gap-2.5 rounded-xl border border-accent/30 bg-accent/5 px-4 py-3 text-sm">
      <Wand2 size={15} className="shrink-0 text-accent" />
      <p className="flex-1">{flash}</p>
      <button
        onClick={() => setFlash(null)}
        className="text-xs text-muted transition hover:text-foreground"
      >
        Dismiss
      </button>
    </div>
  );

  if (loading) return <p className="mt-6 text-sm text-muted">Loading…</p>;

  if (rows.length === 0) {
    return (
      <>
        {flashLine}
        <div className="mt-4 flex max-w-prose items-center gap-3 rounded-xl border border-foreground/15 bg-white p-4 text-sm shadow-sm">
          <Check size={16} className="text-accent" />
          <p>Nothing waiting. Every transaction has been looked at.</p>
        </div>
      </>
    );
  }

  return (
    <div className="mt-6">
      {flashLine}
      <div className="mb-3 mt-4 flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-display text-lg">
          Needs you{" "}
          <span className="ml-1 text-sm font-normal text-muted">
            {rows.length} transaction{rows.length === 1 ? "" : "s"}
          </span>
        </h3>
        {undo && (
          <button
            onClick={undoLast}
            className="inline-flex items-center gap-1.5 text-xs text-muted transition hover:text-foreground"
          >
            <Undo2 size={13} />
            Undo — {undo.label}
          </button>
        )}
      </div>

      {error && (
        <p className="mb-3 max-w-prose text-sm text-red-600">{error}</p>
      )}

      <div className="overflow-hidden rounded-xl border border-foreground/15 bg-white shadow-sm">
        {rows.map((row) => {
          const suggested = row.category_source === "rule" && row.category_id;
          return (
            <div
              key={row.id}
              className="flex gap-3 border-t border-foreground/10 first:border-t-0"
            >
              {/* Status on the left, as a stripe: amber until it's been decided. */}
              <span
                className={`w-1 shrink-0 ${suggested ? "bg-accent/50" : "bg-amber-400"}`}
                aria-hidden
              />

              <div className="min-w-0 flex-1 py-3 pr-4">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {row.merchant || "—"}
                      {row.pending && (
                        <span className="ml-2 text-xs font-normal text-muted">pending</span>
                      )}
                    </p>
                    <p className="truncate text-xs text-muted">
                      {day(row.posted_on)} · {row.description}
                    </p>
                  </div>
                  <p
                    className={`shrink-0 text-sm font-medium tabular-nums ${
                      row.amount_cents < 0 ? "text-foreground" : "text-accent"
                    }`}
                  >
                    {money(row.amount_cents)}
                  </p>
                </div>

                <div className="mt-2.5 flex flex-wrap items-center gap-2">
                  <select
                    value={row.category_id ?? ""}
                    onChange={(e) => setCategory(row.id, e.target.value || null)}
                    className="max-w-[15rem] rounded-lg border border-foreground/15 bg-white px-2 py-1.5 text-sm"
                  >
                    <option value="">Choose a category…</option>
                    {cats.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>

                  <button
                    onClick={() => decide(row, true)}
                    disabled={busyId === row.id || !row.category_id}
                    title={row.category_id ? undefined : "Pick a category first"}
                    className="rounded-lg border border-foreground/15 px-3 py-1.5 text-sm font-medium transition hover:border-foreground/30 disabled:opacity-40"
                  >
                    Business
                  </button>
                  <button
                    onClick={() => decide(row, false)}
                    disabled={busyId === row.id}
                    className="rounded-lg px-3 py-1.5 text-sm text-muted transition hover:text-foreground disabled:opacity-40"
                  >
                    Personal
                  </button>

                  {row.merchant && row.category_id && (
                    <button
                      onClick={() => always(row)}
                      disabled={busyId === row.id}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-accent/30 bg-accent/5 px-3 py-1.5 text-sm font-medium text-accent transition hover:bg-accent/10 disabled:opacity-40"
                    >
                      <Wand2 size={14} />
                      Always, for {row.merchant}
                    </button>
                  )}

                  {suggested && (
                    <span className="text-xs text-muted">suggested by a rule</span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <p className="mt-3 max-w-prose text-xs text-muted">
        Personal doesn&rsquo;t need a category — it&rsquo;s leaving the books either way.
        &ldquo;Always&rdquo; files this one as business, writes a rule so future imports
        skip it, and fills in anything else from that merchant still waiting here —
        as a suggestion rather than a decision, since one Walgreens trip being back-bar
        supplies doesn&rsquo;t make the next one so.
      </p>
    </div>
  );
}
