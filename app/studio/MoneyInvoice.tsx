"use client";

import { useRef, useState } from "react";
import { FileUp, Check, CircleAlert } from "lucide-react";
import { supabase } from "../../lib/supabase";

// Uploading a supplier order.
//
// The point of this screen is that it asks her for nothing. A PDF goes in;
// products, costs and stock come out. Anything it can't work out — whether a
// shampoo sells or goes on the back bar — is a guess she can correct once in
// the catalogue, after which it stays corrected.

type Result = {
  alreadyImported?: boolean;
  orderRef: string | null;
  receivedOn?: string | null;
  lines: number;
  productsCreated: number;
  productsMatched?: number;
  movements: number;
  totalCents?: number | null;
  backBarCents?: number;
};

const money = (c: number) =>
  `$${(c / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function MoneyInvoice({ onImported }: { onImported?: () => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<Result | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setErr(null);
    setRes(null);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const body = new FormData();
      body.append("file", file);
      const r = await fetch("/api/money/invoice", {
        method: "POST",
        headers: { Authorization: `Bearer ${sess.session?.access_token ?? ""}` },
        body,
      });
      const json = await r.json();
      if (!r.ok) {
        // The detail matters. Hiding it behind a friendly sentence is how the
        // first production failure of this cost a round trip to diagnose.
        const detail = json.detail as string | undefined;
        setErr(
          [(json.error as string) ?? "That didn't work.", detail]
            .filter(Boolean)
            .join(" — "),
        );
      } else {
        setRes(json as Result);
        onImported?.();
      }
    } catch {
      setErr("Couldn't reach the server. Try again.");
    } finally {
      setBusy(false);
      if (ref.current) ref.current.value = "";
    }
  }

  return (
    <div className="mt-10 border-t border-foreground/15 pt-8">
      <h3 className="font-display text-lg">Add stock from an order</h3>
      <p className="mt-1 max-w-prose text-sm text-muted">
        Drop in a supplier order PDF. Anything new goes into the catalogue with its
        cost, and everything on it is added to stock. Uploading the same order twice
        does nothing.
      </p>

      <input
        ref={ref}
        id="supplier-pdf"
        type="file"
        accept="application/pdf,.pdf"
        onChange={onPick}
        className="hidden"
      />
      <label
        htmlFor="supplier-pdf"
        className={`mt-4 inline-flex cursor-pointer items-center gap-2 rounded-xl border border-foreground/15 bg-white px-4 py-2.5 text-sm font-medium shadow-sm transition hover:border-foreground/30 ${
          busy ? "pointer-events-none opacity-60" : ""
        }`}
      >
        <FileUp size={16} />
        {busy ? "Reading the order…" : "Choose a supplier order PDF"}
      </label>

      {err && (
        <div className="mt-4 flex max-w-prose gap-3 rounded-xl border border-foreground/15 bg-white p-4 text-sm shadow-sm">
          <span className="-my-4 -ml-4 mr-1 w-1 shrink-0 rounded-l-xl bg-red-500" />
          <CircleAlert size={16} className="mt-0.5 shrink-0 text-red-600" />
          <p>{err}</p>
        </div>
      )}

      {res && (
        <div className="mt-4 max-w-prose overflow-hidden rounded-xl border border-foreground/15 bg-white text-sm shadow-sm">
          <div className="flex items-center gap-2 border-b border-foreground/10 px-4 py-3">
            <Check size={16} className="text-accent" />
            <p className="font-medium">
              {res.alreadyImported
                ? `Order ${res.orderRef} was already in — nothing changed.`
                : `Order ${res.orderRef ?? ""} added.`}
            </p>
          </div>
          {!res.alreadyImported && (
            <dl>
              <Row label="Lines on the order" value={String(res.lines)} />
              <Row
                label="New products"
                value={String(res.productsCreated)}
                note={
                  res.productsMatched
                    ? `${res.productsMatched} already known`
                    : undefined
                }
              />
              <Row label="Added to stock" value={String(res.movements)} />
              {res.totalCents != null && (
                <Row label="Order total" value={money(res.totalCents)} />
              )}
              {res.backBarCents != null && res.backBarCents > 0 && (
                <Row
                  label="Colour and back bar"
                  value={money(res.backBarCents)}
                  note="the rest is shelf stock"
                />
              )}
            </dl>
          )}
          <p className="border-t border-foreground/10 px-4 py-3 text-xs text-muted">
            Whether something sells or goes on the back bar is a first guess. Correct it
            once in the catalogue and it stays corrected.
          </p>
        </div>
      )}
    </div>
  );
}

function Row({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="flex items-center justify-between border-t border-foreground/10 px-4 py-2.5 first:border-t-0">
      <dt className="text-muted">{label}</dt>
      <dd className="font-medium tabular-nums">
        {value}
        {note && <span className="ml-2 text-xs font-normal text-muted">{note}</span>}
      </dd>
    </div>
  );
}
