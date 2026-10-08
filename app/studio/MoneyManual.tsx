"use client";

import { useEffect, useState } from "react";
import { Plus, Check, X } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { PAID_PERSONALLY_ACCOUNT, checkLines, blankLine, type DraftLine } from "../../lib/reimburse";
import { costGroup, GROUP_LABEL } from "../../lib/costGroups";

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
//
// A list, not one at a time (2026-10-08): reimbursements come as a pile of
// receipts, so she adds a line per receipt, watches the total, and records the
// lot. A new line starts with the date and category of the one above.

type Category = { id: string; name: string; kind: string };

const usd = (c: number) => `$${(c / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const field = "mt-1 w-full rounded-lg border border-foreground/15 bg-white px-2 py-1.5 text-base text-foreground sm:text-sm";

export default function MoneyManual({
  onAdded,
  onClose,
  startOpen = false,
}: {
  onAdded?: () => void;
  /** Closing the form, when the caller is the one showing it. */
  onClose?: () => void;
  startOpen?: boolean;
}) {
  const [open, setOpen] = useState(startOpen);
  const [cats, setCats] = useState<Category[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [lines, setLines] = useState<DraftLine[]>([blankLine()]);

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

  const set = (key: string, patch: Partial<DraftLine>) => {
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
    setError(null);
    setDone(null);
  };
  const addLine = () => setLines((ls) => [...ls, blankLine(ls[ls.length - 1])]);
  const removeLine = (key: string) => setLines((ls) => (ls.length > 1 ? ls.filter((l) => l.key !== key) : [blankLine()]));

  const check = checkLines(lines);

  async function save() {
    setError(null);
    if (check.problem) return setError(check.problem);
    if (check.ready.length === 0) return setError("Add at least one thing she paid for.");
    setBusy(true);

    // Find or create the account these live in.
    let accountId: string | null = null;
    const { data: existing } = await supabase
      .from("bank_accounts")
      .select("id")
      .eq("name", PAID_PERSONALLY_ACCOUNT)
      .limit(1)
      .maybeSingle();
    if (existing?.id) {
      accountId = existing.id as string;
    } else {
      const { data: made, error: e } = await supabase
        .from("bank_accounts")
        .insert({ source: "manual", name: PAID_PERSONALLY_ACCOUNT })
        .select("id")
        .single();
      if (e || !made) {
        setError(e?.message ?? "Couldn't create the account.");
        setBusy(false);
        return;
      }
      accountId = made.id as string;
    }

    // One insert for the lot: all of them land, or none do.
    const { error: insErr } = await supabase.from("bank_transactions").insert(
      check.ready.map((l) => ({
        account_id: accountId,
        posted_on: l.postedOn,
        // Money out is negative, matching the Relay convention. A leading +
        // (a refund to her card) stays positive.
        amount_cents: l.cents,
        description: l.note.trim() || l.payee.trim(),
        merchant: l.payee.trim(),
        // No bank id and nothing to hash against — a manual entry is unique by
        // definition, and two identical ones are two real purchases.
        import_hash: `manual:${crypto.randomUUID()}`,
        category_id: l.categoryId,
        category_source: "manual",
        is_business: true,
        reviewed_at: new Date().toISOString(),
      })),
    );
    setBusy(false);
    if (insErr) return setError(insErr.message);

    setDone(`${check.ready.length} recorded · ${usd(-check.totalCents)}`);
    // Start again from one line, keeping the last date and category.
    setLines([blankLine(lines[lines.length - 1])]);
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
      <p className="text-sm font-medium">Things Evelyn paid for herself</p>
      <p className="mt-1 text-xs text-muted">
        Paid before Relay existed, or on her own card. One line per receipt; each counts as a
        business cost on the day she paid, and goes on what she&rsquo;s owed back.
      </p>

      {lines.map((l, i) => (
        <div key={l.key} className="mt-3 border-t border-foreground/10 pt-3 first-of-type:border-t-0">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted">{i + 1}</span>
            <button
              onClick={() => removeLine(l.key)}
              aria-label={`Remove line ${i + 1}`}
              className="-my-2 -mr-2 inline-flex h-11 w-11 items-center justify-center text-muted hover:text-foreground"
            >
              <X size={15} />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs text-muted">
              Date
              <input type="date" value={l.postedOn} onChange={(e) => set(l.key, { postedOn: e.target.value })} className={field} />
            </label>
            <label className="text-xs text-muted">
              Amount
              <input
                inputMode="decimal"
                placeholder="2043.38"
                value={l.amount}
                onChange={(e) => set(l.key, { amount: e.target.value })}
                className={field}
              />
            </label>
            <label className="col-span-2 text-xs text-muted">
              Paid to
              <input placeholder="Premier Beauty Supply" value={l.payee} onChange={(e) => set(l.key, { payee: e.target.value })} className={field} />
            </label>
            <label className="col-span-2 text-xs text-muted">
              Category
              <select value={l.categoryId} onChange={(e) => set(l.key, { categoryId: e.target.value })} className={field}>
                <option value="">Choose…</option>
                {/* Grouped the way the year-end summary splits pre-opening
                    spending, and only things that are spending -- no income,
                    owner money or personal in a list of purchases. */}
                {(["equipment", "product", "other"] as const).map((g) => (
                  <optgroup key={g} label={GROUP_LABEL[g]}>
                    {cats
                      .filter((c) => costGroup(c) === g)
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                  </optgroup>
                ))}
              </select>
            </label>
            <label className="col-span-2 text-xs text-muted">
              Note <span className="font-normal">(optional — an order number helps)</span>
              <input
                placeholder="Order #891488, Keune + maria nila opening order"
                value={l.note}
                onChange={(e) => set(l.key, { note: e.target.value })}
                className={field}
              />
            </label>
          </div>
        </div>
      ))}

      <button onClick={addLine} className="mt-3 inline-flex min-h-11 items-center gap-1.5 text-sm text-accent hover:text-accent-dark">
        <Plus size={15} /> Add another
      </button>

      <div className="mt-2 flex items-center justify-between border-t border-foreground/15 pt-3 text-sm">
        <span>
          Total
          <span className="ml-2 text-xs text-muted">
            {check.ready.length} item{check.ready.length === 1 ? "" : "s"}
          </span>
        </span>
        <span className="font-medium tabular-nums">{usd(-check.totalCents)}</span>
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
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition hover:bg-accent-dark disabled:opacity-60"
        >
          {busy ? "Saving…" : check.ready.length > 1 ? `Record all ${check.ready.length}` : "Record it"}
        </button>
        <button
          onClick={() => {
            setOpen(false);
            setDone(null);
            setError(null);
            onClose?.();
          }}
          className="rounded-lg px-3 py-2 text-sm text-muted transition hover:text-foreground"
        >
          Done
        </button>
      </div>
    </div>
  );
}
