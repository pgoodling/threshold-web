"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { readableTxn } from "../../lib/bankNames";
import { owed, PAID_PERSONALLY_ACCOUNT, REIMBURSEMENT_CATEGORY, type Paid } from "../../lib/reimburse";

// Money → Bank: what she paid personally for the business, what Relay has
// paid her back, and what's still owed. See lib/reimburse.ts.

const money = (c: number) =>
  `${c < 0 ? "−" : ""}$${(Math.abs(c) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const day = (d: string) =>
  new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

type Raw = {
  id: string;
  posted_on: string;
  amount_cents: number;
  merchant: string | null;
  description: string | null;
  expense_categories: { name: string } | { name: string }[] | null;
};

const toPaid = (r: Raw): Paid => {
  const c = Array.isArray(r.expense_categories) ? r.expense_categories[0] : r.expense_categories;
  return {
    id: r.id,
    posted_on: r.posted_on,
    amount_cents: Number(r.amount_cents),
    payee: readableTxn({ merchant: r.merchant, description: r.description, amount_cents: Number(r.amount_cents) }),
    category: c?.name ?? null,
  };
};

export default function MoneyReimburse({ reloadKey }: { reloadKey: number }) {
  const [paid, setPaid] = useState<Paid[] | null>(null);
  const [repaid, setRepaid] = useState<Paid[]>([]);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const acct = await supabase.from("bank_accounts").select("id").eq("name", PAID_PERSONALLY_ACCOUNT).maybeSingle();
      const cat = await supabase.from("expense_categories").select("id").eq("name", REIMBURSEMENT_CATEGORY).maybeSingle();
      const cols = "id,posted_on,amount_cents,merchant,description,expense_categories(name)";
      const [p, r] = await Promise.all([
        acct.data
          ? supabase.from("bank_transactions").select(cols).eq("account_id", acct.data.id).eq("is_business", true).order("posted_on")
          : Promise.resolve({ data: [] as Raw[] }),
        cat.data
          ? supabase.from("bank_transactions").select(cols).eq("category_id", cat.data.id).order("posted_on")
          : Promise.resolve({ data: [] as Raw[] }),
      ]);
      if (!alive) return;
      setPaid(((p.data ?? []) as unknown as Raw[]).map(toPaid));
      setRepaid(((r.data ?? []) as unknown as Raw[]).map(toPaid));
    })();
    return () => {
      alive = false;
    };
  }, [reloadKey]);

  if (paid === null) return null;
  const o = owed(paid, repaid);
  const shown = showAll ? paid : paid.slice(-5);

  return (
    <section className="mt-8">
      <div className="flex items-baseline gap-3">
        <h3 className="text-xs uppercase tracking-[0.15em] text-muted">Paid by Evelyn, owed back</h3>
        <span className="h-px flex-1 bg-foreground/10" />
      </div>
      <div className="mt-2 overflow-hidden rounded-xl border border-foreground/15 bg-white text-sm">
        {paid.length === 0 ? (
          <p className="px-4 py-3 text-muted">
            Nothing yet. Add each thing she paid for herself with &ldquo;A purchase the bank didn&rsquo;t
            see&rdquo; below; when Relay pays her back, file that payment as &ldquo;{REIMBURSEMENT_CATEGORY}&rdquo;.
          </p>
        ) : (
          <>
            {paid.length > shown.length && (
              <button onClick={() => setShowAll(true)} className="flex min-h-11 w-full items-center px-4 text-left text-xs text-accent">
                Show all {paid.length}
              </button>
            )}
            {shown.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-3 border-t border-foreground/10 px-4 py-2 first:border-t-0">
                <span className="min-w-0">
                  <span className="mr-2 text-muted">{day(p.posted_on)}</span>
                  {p.payee}
                  {p.category && <span className="block text-xs text-muted">{p.category}</span>}
                </span>
                <span className="shrink-0 tabular-nums">{money(-p.amount_cents)}</span>
              </div>
            ))}
            <Line label="Paid by Evelyn" value={money(o.paidCents)} />
            {repaid.map((r) => (
              <Line key={r.id} label={`Paid back ${day(r.posted_on)}`} value={money(-Math.abs(r.amount_cents))} muted />
            ))}
            <Line label="Still owed to her" value={money(o.owedCents)} strong />
          </>
        )}
      </div>
    </section>
  );
}

function Line({ label, value, strong, muted }: { label: string; value: string; strong?: boolean; muted?: boolean }) {
  return (
    <div
      className={`flex items-center justify-between gap-3 border-t border-foreground/10 px-4 py-2 ${strong ? "font-medium" : ""} ${muted ? "text-muted" : ""}`}
    >
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
