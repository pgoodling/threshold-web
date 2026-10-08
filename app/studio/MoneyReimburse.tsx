"use client";

import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import MoneyManual from "./MoneyManual";
import { supabase } from "../../lib/supabase";
import { readableTxn } from "../../lib/bankNames";
import { owed, PAID_PERSONALLY_ACCOUNT, REIMBURSEMENT_CATEGORY, type Paid } from "../../lib/reimburse";

// Money → Bank: everything the business owes Evelyn, in one figure -- what she
// moved into Relay from her own bank, what she paid on her own card, less what
// Relay has paid back. See lib/reimburse.ts.

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

const COLS = "id,posted_on,amount_cents,merchant,description,expense_categories(name)";

export default function MoneyReimburse({ reloadKey, onChanged }: { reloadKey: number; onChanged?: () => void }) {
  const [paid, setPaid] = useState<Paid[] | null>(null);
  const [putIn, setPutIn] = useState<Paid[]>([]);
  const [repaid, setRepaid] = useState<Paid[]>([]);
  const [open, setOpen] = useState<"in" | "receipts" | null>(null);
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState(0);

  useEffect(() => {
    let alive = true;
    (async () => {
      const [acct, back, contrib] = await Promise.all([
        supabase.from("bank_accounts").select("id").eq("name", PAID_PERSONALLY_ACCOUNT).maybeSingle(),
        supabase.from("expense_categories").select("id").eq("name", REIMBURSEMENT_CATEGORY).maybeSingle(),
        supabase.from("expense_categories").select("id").eq("kind", "contribution"),
      ]);
      const none = Promise.resolve({ data: [] as Raw[] });
      const contribIds = (contrib.data ?? []).map((c) => c.id as string);
      const [p, r, c] = await Promise.all([
        acct.data
          ? supabase.from("bank_transactions").select(COLS).eq("account_id", acct.data.id).eq("is_business", true).order("posted_on")
          : none,
        back.data ? supabase.from("bank_transactions").select(COLS).eq("category_id", back.data.id).order("posted_on") : none,
        contribIds.length ? supabase.from("bank_transactions").select(COLS).in("category_id", contribIds).order("posted_on") : none,
      ]);
      if (!alive) return;
      setPaid(((p.data ?? []) as unknown as Raw[]).map(toPaid));
      setRepaid(((r.data ?? []) as unknown as Raw[]).map(toPaid));
      setPutIn(((c.data ?? []) as unknown as Raw[]).map(toPaid));
    })();
    return () => {
      alive = false;
    };
  }, [reloadKey, added]);

  if (paid === null) return null;
  const o = owed(paid, repaid, putIn);
  const span = (rows: Paid[]) =>
    rows.length === 0 ? "" : rows.length === 1 ? day(rows[0].posted_on) : `${day(rows[0].posted_on)} – ${day(rows[rows.length - 1].posted_on)}`;

  return (
    <section className="mt-8">
      <div className="flex items-baseline gap-3">
        <h3 className="text-xs uppercase tracking-[0.15em] text-muted">Owed back to Evelyn</h3>
        <span className="h-px flex-1 bg-foreground/10" />
      </div>
      <div className="mt-2 overflow-hidden rounded-xl border border-foreground/15 bg-white text-sm">
        {paid.length === 0 && putIn.length === 0 ? (
          <p className="px-4 py-3 text-muted">
            Nothing yet. Add each thing she paid for herself below. When Relay pays her back, file that
            payment as &ldquo;{REIMBURSEMENT_CATEGORY}&rdquo;.
          </p>
        ) : (
          <>
            <Group
              label="Put into Relay from her own bank"
              sub={putIn.length ? `${putIn.length} transfer${putIn.length === 1 ? "" : "s"}, ${span(putIn)}` : "none"}
              cents={o.putInCents}
              rows={putIn}
              sign={1}
              open={open === "in"}
              onToggle={() => setOpen(open === "in" ? null : "in")}
            />
            <Group
              label="Paid with her own card"
              sub={paid.length ? `${paid.length} receipt${paid.length === 1 ? "" : "s"}, ${span(paid)}` : "none yet"}
              cents={o.receiptsCents}
              rows={paid}
              sign={-1}
              open={open === "receipts"}
              onToggle={() => setOpen(open === "receipts" ? null : "receipts")}
            />
            {repaid.map((r) => (
              <Line key={r.id} label={`Paid back ${day(r.posted_on)}`} value={money(-Math.abs(r.amount_cents))} muted />
            ))}
            <Line label="Still hers to take back" value={money(o.owedCents)} strong />
            <p className="border-t border-foreground/10 px-4 py-2 text-xs text-muted">
              Her own money coming back: not taxed, not a business cost. File each transfer to her as
              &ldquo;{REIMBURSEMENT_CATEGORY}&rdquo;; one transfer or several, any amounts.
            </p>
          </>
        )}
      </div>
      {adding ? (
        <MoneyManual
          startOpen
          onAdded={() => {
            setAdded((n) => n + 1);
            onChanged?.();
          }}
          onClose={() => setAdding(false)}
        />
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="mt-3 inline-flex min-h-11 items-center gap-1.5 text-sm text-accent hover:text-accent-dark"
        >
          <Plus size={15} /> Add something Evelyn paid for
        </button>
      )}
    </section>
  );
}

function Group({
  label,
  sub,
  cents,
  rows,
  sign,
  open,
  onToggle,
}: {
  label: string;
  sub: string;
  cents: number;
  rows: Paid[];
  /** Transfers in are positive, purchases negative; both shown as positive. */
  sign: 1 | -1;
  open: boolean;
  onToggle: () => void;
}) {
  const head = (
    <>
      <span className="min-w-0">
        {label}
        <span className="block text-xs text-muted">{sub}</span>
      </span>
      <span className="shrink-0 tabular-nums">{money(cents)}</span>
    </>
  );
  return (
    <div className="border-t border-foreground/10 first:border-t-0">
      {rows.length ? (
        <button onClick={onToggle} aria-expanded={open} className="flex min-h-11 w-full items-center justify-between gap-3 px-4 py-2 text-left">
          {head}
        </button>
      ) : (
        <div className="flex min-h-11 items-center justify-between gap-3 px-4 py-2">{head}</div>
      )}
      {open && (
        <div className="border-t border-foreground/10 bg-foreground/[0.02] px-4 py-1.5">
          {rows.map((p) => (
            <div key={p.id} className="flex justify-between gap-3 py-1 text-xs">
              <span className="min-w-0 truncate">
                <span className="mr-2 text-muted">{day(p.posted_on)}</span>
                {p.payee}
                {p.category && sign === -1 && <span className="text-muted"> · {p.category}</span>}
              </span>
              <span className="shrink-0 tabular-nums">{money(sign * p.amount_cents)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
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
