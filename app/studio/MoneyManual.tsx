"use client";

import { useEffect, useState } from "react";
import { Plus, Check } from "lucide-react";
import { supabase } from "../../lib/supabase";

// Purchases the bank feed will never show.
//
// Some spending predates the Relay account, and some was paid by a card that
// isn't in it. The $2,043.38 Keune and maria nila order of 24 August is the
// example that forced this: her single largest purchase, entirely invisible,
// and more than the $1,801.40 of pre-opening spend the statements DO show.
//
// These go into bank_transactions like everything else, against an account
// flagged source='manual' rather than into a table of their own. One pipeline,
// one review queue, one set of reports — a parallel table would need its own
// copy of categories, allocation and the Schedule C rollup, and the first
// report to forget about it would be quietly wrong.
//
// Typing a purchase in IS the review, so these land reviewed and business.
// Nobody enters an expense by hand while unsure whether it was one.

const MANUAL_ACCOUNT = "Paid outside Relay";

type Category = { id: string; name: string; kind: string };

export default function MoneyManual({ onAdded }: { onAdded?: () => void }) {
  const [open, setOpen] = useState(false);
  const [cats, setCats] = useState<Category[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const [postedOn, setPostedOn] = useState("");
  const [payee, setPayee] = useState("");
  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    let alive = true;
    supabase
      .from("expense_categories")
      .select("id,name,kind")
      .order("sort_order", { ascending: true })
      .then(({ data }) => {
        if (alive) setCats((data ?? []) as Category[]);
      });
    return () => {
      alive = false;
    };
  }, []);

  async function save() {
    setError(null);
    const cents = Math.round(Number(amount.replace(/[$,\s]/g, "")) * 100);
    if (!postedOn || !payee.trim() || !Number.isFinite(cents) || cents === 0) {
      setError("Needs a date, who it was paid to, and an amount.");
      return;
    }
    if (!categoryId) {
      setError("Pick a category — that's the whole point of recording it.");
      return;
    }
    setBusy(true);

    // Find or create the account these live in.
    let accountId: string | null = null;
    const { data: existing } = await supabase
      .from("bank_accounts")
      .select("id")
      .eq("name", MANUAL_ACCOUNT)
      .limit(1)
      .maybeSingle();
    if (existing?.id) {
      accountId = existing.id as string;
    } else {
      const { data: made, error: e } = await supabase
        .from("bank_accounts")
        .insert({ source: "manual", name: MANUAL_ACCOUNT })
        .select("id")
        .single();
      if (e || !made) {
        setError(e?.message ?? "Couldn't create the account.");
        setBusy(false);
        return;
      }
      accountId = made.id as string;
    }

    // Money out is negative, matching the Relay convention the rest of the
    // schema uses. Typing 2043.38 means she SPENT it, so flip the sign unless
    // an explicit + says otherwise.
    const signed = amount.trim().startsWith("+") ? Math.abs(cents) : -Math.abs(cents);

    const { error: insErr } = await supabase.from("bank_transactions").insert({
      account_id: accountId,
      posted_on: postedOn,
      amount_cents: signed,
      description: note.trim() || payee.trim(),
      merchant: payee.trim(),
      // No bank id and nothing to hash against — a manual entry is unique by
      // definition, and two identical ones are two real purchases.
      import_hash: `manual:${crypto.randomUUID()}`,
      category_id: categoryId,
      category_source: "manual",
      is_business: true,
      reviewed_at: new Date().toISOString(),
    });

    if (insErr) {
      setError(insErr.message);
      setBusy(false);
      return;
    }

    setDone(`${payee.trim()} — $${Math.abs(signed / 100).toFixed(2)} recorded.`);
    setPayee("");
    setAmount("");
    setNote("");
    setBusy(false);
    onAdded?.();
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mt-4 inline-flex items-center gap-2 rounded-xl border border-foreground/15 bg-white px-4 py-2.5 text-sm font-medium shadow-sm transition hover:border-foreground/30"
      >
        <Plus size={16} />
        Add a purchase the bank doesn&rsquo;t show
      </button>
    );
  }

  return (
    <div className="mt-4 max-w-prose rounded-xl border border-foreground/15 bg-white p-4 shadow-sm">
      <p className="text-sm font-medium">A purchase the bank doesn&rsquo;t show</p>
      <p className="mt-1 text-xs text-muted">
        Paid before the Relay account existed, or on a card that isn&rsquo;t in it.
        Counts everywhere a bank row would — including startup costs, if it&rsquo;s
        dated before she opened.
      </p>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <label className="text-xs text-muted">
          Date
          <input
            type="date"
            value={postedOn}
            onChange={(e) => setPostedOn(e.target.value)}
            className="mt-1 w-full rounded-lg border border-foreground/15 px-2 py-1.5 text-sm text-foreground"
          />
        </label>
        <label className="text-xs text-muted">
          Amount
          <input
            inputMode="decimal"
            placeholder="2043.38"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="mt-1 w-full rounded-lg border border-foreground/15 px-2 py-1.5 text-sm text-foreground"
          />
        </label>
        <label className="text-xs text-muted sm:col-span-2">
          Paid to
          <input
            placeholder="Premier Beauty Supply"
            value={payee}
            onChange={(e) => setPayee(e.target.value)}
            className="mt-1 w-full rounded-lg border border-foreground/15 px-2 py-1.5 text-sm text-foreground"
          />
        </label>
        <label className="text-xs text-muted sm:col-span-2">
          Category
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="mt-1 w-full rounded-lg border border-foreground/15 bg-white px-2 py-1.5 text-sm text-foreground"
          >
            <option value="">Choose…</option>
            {cats.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-muted sm:col-span-2">
          Note <span className="font-normal">(optional — an order number helps)</span>
          <input
            placeholder="Order #891488, Keune + maria nila opening order"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="mt-1 w-full rounded-lg border border-foreground/15 px-2 py-1.5 text-sm text-foreground"
          />
        </label>
      </div>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      {done && (
        <p className="mt-3 flex items-center gap-2 text-sm text-accent">
          <Check size={15} />
          {done}
        </p>
      )}

      <div className="mt-3 flex gap-2">
        <button
          onClick={save}
          disabled={busy}
          className="rounded-lg border border-foreground/15 px-3 py-1.5 text-sm font-medium transition hover:border-foreground/30 disabled:opacity-60"
        >
          {busy ? "Saving…" : "Record it"}
        </button>
        <button
          onClick={() => {
            setOpen(false);
            setDone(null);
            setError(null);
          }}
          className="rounded-lg px-3 py-1.5 text-sm text-muted transition hover:text-foreground"
        >
          Done
        </button>
      </div>
    </div>
  );
}
