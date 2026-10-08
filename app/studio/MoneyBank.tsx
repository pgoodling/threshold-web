"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import MoneyStatement from "./MoneyStatement";
import MoneyReview from "./MoneyReview";
import MoneyManual from "./MoneyManual";
import MoneyReimburse from "./MoneyReimburse";
import { supabase } from "../../lib/supabase";
import { readableTxn as readable } from "../../lib/bankNames";

// Bank: what came in from her statements, month by month.
//
// Before this, uploading a statement showed a count and then a queue of
// whatever still needed sorting — once it was sorted there was nowhere to see
// what had actually been uploaded. Now the months are the page: tap one and
// every transaction is there, by date, under a name a person would use.
//
// Tapping a transaction lets her change its category. Nothing else could fix
// a row once it had left the review queue, and seeing them all is exactly
// when she'd notice one in the wrong place.

type Txn = {
  id: string;
  posted_on: string;
  amount_cents: number;
  merchant: string | null;
  description: string | null;
  is_business: boolean | null;
  reviewed_at: string | null;
  category_id: string | null;
  pending: boolean | null;
  expense_categories: { name: string } | null;
  bank_accounts: { name: string } | null;
};

type Category = { id: string; name: string; kind: string };

const usd = (c: number) =>
  `$${(Math.abs(c) / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const whole = (c: number) => `$${Math.round(Math.abs(c) / 100).toLocaleString("en-US")}`;

function sortedAs(t: Txn): string {
  if (t.reviewed_at === null) return "Not sorted yet";
  if (t.is_business === false) return "Personal";
  return t.expense_categories?.name ?? "No category";
}

const monthKey = (ymd: string) => ymd.slice(0, 7);
const monthName = (key: string) =>
  new Date(`${key}-15T12:00:00Z`).toLocaleDateString("en-US", {
    month: "long",
    year: key.slice(0, 4) === String(new Date().getFullYear()) ? undefined : "numeric",
    timeZone: "UTC",
  });
const dayName = (ymd: string) =>
  new Date(`${ymd}T12:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });

export default function MoneyBank({ onChanged }: { onChanged?: () => void }) {
  const [txns, setTxns] = useState<Txn[] | null>(null);
  const [cats, setCats] = useState<Category[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [manual, setManual] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Two keys, not one. The months refetch when anything is sorted; the review
  // list only remounts after an upload. Sharing a key would loop: the list
  // reports its count on every load, which would refetch, which would remount
  // it, which would report again.
  const [reloadKey, setReloadKey] = useState(0);
  const [reviewKey, setReviewKey] = useState(0);
  const reload = useCallback(() => setReloadKey((k) => k + 1), []);
  const lastCount = useRef<number | null>(null);
  const onReviewCount = useCallback(
    (n: number) => {
      if (lastCount.current !== null && n !== lastCount.current) reload();
      lastCount.current = n;
    },
    [reload],
  );

  useEffect(() => {
    let alive = true;
    Promise.all([
      supabase
        .from("bank_transactions")
        .select(
          "id,posted_on,amount_cents,merchant,description,is_business,reviewed_at,category_id,pending,expense_categories(name),bank_accounts(name)",
        )
        .order("posted_on", { ascending: false })
        .order("created_at", { ascending: false }),
      supabase.from("expense_categories").select("id,name,kind").order("sort_order"),
    ]).then(([t, c]) => {
      if (!alive) return;
      if (t.error) setError(t.error.message);
      setTxns(
        ((t.data ?? []) as unknown as Txn[]).map((r) => ({
          ...r,
          // Embedded parents can come back as one-element arrays.
          expense_categories: Array.isArray(r.expense_categories)
            ? (r.expense_categories[0] ?? null)
            : r.expense_categories,
          bank_accounts: Array.isArray(r.bank_accounts)
            ? (r.bank_accounts[0] ?? null)
            : r.bank_accounts,
        })),
      );
      setCats((c.data ?? []) as Category[]);
    });
    return () => {
      alive = false;
    };
  }, [reloadKey]);

  // Account → months, newest first.
  const accounts = useMemo(() => {
    const by = new Map<string, Map<string, Txn[]>>();
    for (const t of txns ?? []) {
      const acct = t.bank_accounts?.name ?? "Other";
      const months = by.get(acct) ?? new Map<string, Txn[]>();
      const k = monthKey(t.posted_on);
      months.set(k, [...(months.get(k) ?? []), t]);
      by.set(acct, months);
    }
    return [...by.entries()].map(([name, months]) => ({
      name,
      months: [...months.entries()].map(([key, rows]) => ({ key, rows })),
    }));
  }, [txns]);

  async function recategorise(t: Txn, value: string) {
    const personal = value === "personal";
    const category = personal ? null : cats.find((c) => c.id === value) ?? null;
    const change = personal
      ? { is_business: false, category_id: null, category_source: null }
      : { is_business: true, category_id: value, category_source: "manual" };
    // reviewed_at and is_business move together — a check constraint says so.
    const reviewed = new Date().toISOString();
    setTxns((ts) =>
      (ts ?? []).map((x) =>
        x.id === t.id
          ? {
              ...x,
              ...change,
              reviewed_at: reviewed,
              expense_categories: category ? { name: category.name } : null,
            }
          : x,
      ),
    );
    setEditing(null);
    const { error: e } = await supabase
      .from("bank_transactions")
      .update({ ...change, reviewed_at: reviewed })
      .eq("id", t.id);
    if (e) {
      setError(e.message);
      reload();
    } else onChanged?.();
  }

  function changed() {
    reload();
    setReviewKey((k) => k + 1);
    lastCount.current = null;
    onChanged?.();
  }

  // ---- A month, opened --------------------------------------------------------
  const opened = open
    ? accounts.flatMap((a) => a.months.filter((m) => `${a.name}|${m.key}` === open))[0]
    : null;

  if (opened) {
    const inC = opened.rows.filter((t) => t.amount_cents > 0).reduce((s, t) => s + t.amount_cents, 0);
    const outC = opened.rows.filter((t) => t.amount_cents < 0).reduce((s, t) => s - t.amount_cents, 0);
    const byDay = new Map<string, Txn[]>();
    for (const t of opened.rows) byDay.set(t.posted_on, [...(byDay.get(t.posted_on) ?? []), t]);
    const unsorted = opened.rows.filter((t) => t.reviewed_at === null).length;

    return (
      <div className="max-w-xl">
        <button
          onClick={() => {
            setOpen(null);
            setEditing(null);
          }}
          className="-ml-1 inline-flex min-h-11 items-center gap-1 font-display text-xl"
        >
          <ChevronLeft size={20} /> {monthName(opened.key)}
        </button>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <div className="rounded-xl bg-foreground/[0.04] px-3 py-2.5">
            <p className="text-lg font-medium tabular-nums text-green-800">{whole(inC)}</p>
            <p className="text-xs text-muted">came in</p>
          </div>
          <div className="rounded-xl bg-foreground/[0.04] px-3 py-2.5">
            <p className="text-lg font-medium tabular-nums">{whole(outC)}</p>
            <p className="text-xs text-muted">went out</p>
          </div>
        </div>

        {unsorted > 0 && (
          <p className="mt-3 text-sm">
            <span className="font-medium">{unsorted} to sort</span>
            <span className="text-muted"> — they&rsquo;re at the top of Bank.</span>
          </p>
        )}

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

        {[...byDay.entries()].map(([d, rows]) => (
          <section key={d} className="mt-4">
            <h4 className="px-1 text-xs text-muted">{dayName(d)}</h4>
            <div className="mt-1 overflow-hidden rounded-xl border border-foreground/15 bg-white shadow-sm">
              {rows.map((t) => (
                <div key={t.id} className="border-t border-foreground/10 first:border-t-0">
                  <button
                    onClick={() => setEditing(editing === t.id ? null : t.id)}
                    className="flex w-full items-start gap-3 px-3 py-2.5 text-left"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15px] leading-snug">{readable(t)}</span>
                      <span
                        className={`block text-xs ${
                          t.reviewed_at === null ? "text-amber-700" : "text-muted"
                        }`}
                      >
                        {sortedAs(t)}
                        {t.pending && " · pending"}
                      </span>
                    </span>
                    <span
                      className={`shrink-0 tabular-nums ${
                        t.amount_cents > 0 ? "text-green-800" : ""
                      }`}
                    >
                      {t.amount_cents > 0 ? "+" : "−"}
                      {usd(t.amount_cents)}
                    </span>
                  </button>
                  {editing === t.id && (
                    <div className="px-3 pb-3">
                      <select
                        autoFocus
                        defaultValue={
                          t.is_business === false ? "personal" : (t.category_id ?? "")
                        }
                        onChange={(e) => e.target.value && recategorise(t, e.target.value)}
                        className="w-full rounded-lg border border-foreground/15 bg-white px-2 py-2 text-base sm:text-sm"
                      >
                        <option value="" disabled>
                          Choose a category
                        </option>
                        {cats.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                        <option value="personal">Personal — not the salon&rsquo;s</option>
                      </select>
                      {t.description && t.description !== t.merchant && (
                        <p className="mt-1.5 text-xs text-muted">{t.description}</p>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    );
  }

  // ---- The months ---------------------------------------------------------------
  return (
    <div className="max-w-xl">
      <MoneyStatement onImported={changed} />

      <MoneyReview key={`review-${reviewKey}`} quietWhenEmpty onCount={onReviewCount} />

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      {txns === null ? (
        <p className="mt-6 text-sm text-muted">Loading…</p>
      ) : accounts.length === 0 ? (
        <p className="mt-6 text-sm text-muted">No statements yet.</p>
      ) : (
        accounts.map((a) => (
          <section key={a.name} className="mt-6">
            <h4 className="px-1 text-xs text-muted">{a.name}</h4>
            <div className="mt-1 overflow-hidden rounded-xl border border-foreground/15 bg-white shadow-sm">
              {a.months.map((m) => {
                const inC = m.rows.filter((t) => t.amount_cents > 0).reduce((s, t) => s + t.amount_cents, 0);
                const outC = m.rows.filter((t) => t.amount_cents < 0).reduce((s, t) => s - t.amount_cents, 0);
                const unsorted = m.rows.filter((t) => t.reviewed_at === null).length;
                return (
                  <button
                    key={m.key}
                    onClick={() => setOpen(`${a.name}|${m.key}`)}
                    className="flex w-full items-center gap-3 border-t border-foreground/10 px-3 py-3 text-left first:border-t-0 hover:bg-foreground/[0.02]"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15px]">{monthName(m.key)}</span>
                      <span
                        className={`block text-xs ${unsorted ? "text-amber-700" : "text-muted"}`}
                      >
                        {m.rows.length} · {unsorted ? `${unsorted} to sort` : "all sorted"}
                      </span>
                    </span>
                    <span className="text-right text-sm tabular-nums">
                      {inC > 0 && <span className="block text-green-800">+{whole(inC)}</span>}
                      {outC > 0 && <span className="block text-xs text-muted">−{whole(outC)}</span>}
                    </span>
                    <ChevronRight size={16} className="shrink-0 text-muted" />
                  </button>
                );
              })}
            </div>
          </section>
        ))
      )}

      <MoneyReimburse reloadKey={reloadKey + reviewKey} />

      {manual ? (
        <MoneyManual
          onAdded={() => {
            setManual(false);
            changed();
          }}
        />
      ) : (
        <button
          onClick={() => setManual(true)}
          className="mt-5 inline-flex items-center gap-1.5 text-sm text-accent hover:text-accent-dark"
        >
          <Plus size={15} /> A purchase the bank didn&rsquo;t see
        </button>
      )}
    </div>
  );
}
