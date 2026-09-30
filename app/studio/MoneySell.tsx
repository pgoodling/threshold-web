"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, User, X } from "lucide-react";
import SaleLines from "./SaleLines";
import { supabase } from "../../lib/supabase";
import { PAYMENT_METHODS } from "../../lib/format";
import {
  loadSaleContext,
  totals,
  usd,
  percent,
  recordSale,
  type SaleContext,
  type SaleLine,
} from "../../lib/retail";

// Selling product without an appointment — someone who drops in for a bottle.
// Check-out does the same thing with the service on top; the lines, tax and
// saving are shared (SaleLines, lib/retail) so the two can't disagree.
//
// Who's buying is optional. Naming them puts the sale on their record; a
// stranger buying a comb shouldn't need to become a client first.

type Client = { id: string; full_name: string | null; phone: string | null };

export default function MoneySell({ onSold }: { onSold?: () => void }) {
  const [ctx, setCtx] = useState<SaleContext | null>(null);
  const [lines, setLines] = useState<SaleLine[]>([]);
  const [method, setMethod] = useState("card");
  const [client, setClient] = useState<Client | null>(null);
  const [q, setQ] = useState("");
  const [clients, setClients] = useState<Client[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    loadSaleContext().then(setCtx);
    supabase
      .from("clients")
      .select("id,full_name,phone")
      .order("full_name")
      .then(({ data }) => setClients((data ?? []) as Client[]));
  }, []);

  const found = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle || client) return [];
    const digits = needle.replace(/\D/g, "");
    return clients
      .filter(
        (c) =>
          (c.full_name ?? "").toLowerCase().includes(needle) ||
          (digits.length >= 3 && (c.phone ?? "").replace(/\D/g, "").includes(digits)),
      )
      .slice(0, 6);
  }, [clients, q, client]);

  const rate = ctx?.rate ?? 0;
  const t = totals(lines, rate);

  async function sell() {
    if (lines.length === 0) return setError("Add a product first.");
    setBusy(true);
    setError(null);
    const { error: e } = await recordSale({
      lines,
      paymentMethod: method,
      clientId: client?.id ?? null,
    });
    setBusy(false);
    if (e) return setError(e.message);
    setDone(`Sold · ${usd(t.total)}${client?.full_name ? ` · ${client.full_name}` : ""}`);
    setLines([]);
    setClient(null);
    setQ("");
    onSold?.();
  }

  return (
    <div className="mt-3">
      {done && (
        <p className="mb-3 flex items-center gap-1.5 text-sm">
          <Check size={15} className="text-accent" /> {done}
        </p>
      )}

      {client ? (
        <div className="flex items-center gap-2 rounded-lg border border-foreground/15 bg-white px-3 py-2 text-sm">
          <User size={15} className="text-muted" />
          <span className="flex-1">{client.full_name}</span>
          <button onClick={() => setClient(null)} aria-label="Remove client" className="text-muted">
            <X size={15} />
          </button>
        </div>
      ) : (
        <div>
          <div className="flex items-center gap-2 rounded-lg border border-foreground/15 bg-white px-3 py-2">
            <User size={15} className="shrink-0 text-muted" />
            <input
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setDone(null);
              }}
              placeholder="Who's buying? (optional)"
              className="w-full bg-transparent text-base outline-none sm:text-sm"
            />
          </div>
          {found.length > 0 && (
            <div className="mt-1 overflow-hidden rounded-lg border border-foreground/15 bg-white">
              {found.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setClient(c)}
                  className="block w-full border-t border-foreground/10 px-3 py-2 text-left text-sm first:border-t-0 hover:bg-foreground/[0.03]"
                >
                  {c.full_name}
                  {c.phone && <span className="ml-2 text-xs text-muted">{c.phone}</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="mt-2">
        <SaleLines
          lines={lines}
          onChange={(l) => {
            setLines(l);
            setDone(null);
            setError(null);
          }}
        />
      </div>

      {lines.length > 0 && (
        <div className="mt-2 border-t border-foreground/20 pt-2 text-sm">
          <div className="flex justify-between text-muted">
            <span>Sales tax, {percent(rate)}</span>
            <span className="tabular-nums">{usd(t.tax)}</span>
          </div>
          <div className="mt-1 flex justify-between text-base font-medium">
            <span>Total</span>
            <span className="tabular-nums">{usd(t.total)}</span>
          </div>
        </div>
      )}

      <p className="mt-4 text-sm text-muted">Paid with</p>
      <div className="mt-1.5 flex flex-wrap gap-2">
        {PAYMENT_METHODS.map((m) => (
          <button
            key={m.value}
            onClick={() => setMethod(m.value)}
            className={`rounded-md border px-3 py-1.5 text-xs transition ${
              method === m.value
                ? "border-accent bg-accent text-white"
                : "border-foreground/15 hover:border-accent"
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      <button
        onClick={sell}
        disabled={busy || !ctx}
        className="mt-4 w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white transition hover:bg-accent-dark disabled:opacity-60"
      >
        {busy ? "Saving…" : lines.length ? `Sell · ${usd(t.total)}` : "Sell"}
      </button>

    </div>
  );
}
