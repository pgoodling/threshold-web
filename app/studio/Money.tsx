"use client";

import { useCallback, useEffect, useState } from "react";
import { BarChart3, Landmark, Receipt, TrendingUp, type LucideIcon } from "lucide-react";
import MoneyBank from "./MoneyBank";
import MoneyOverview from "./MoneyOverview";
import MoneyColourCost from "./MoneyColourCost";
import MoneyTax from "./MoneyTax";

// Money: the monthly and quarterly jobs.
//
//   Overview revenue against expenses, by week, month, quarter or year
//   Bank     upload a statement, see what came in, fix a category
//   Taxes    what to set aside, when it's due, sales tax collected
//   Costs    when she's wondering whether her prices work
//
// Inventory used to be two tabs here. It moved to its own studio item
// (2026-09-30) because she uses it every day and this once a month, and taxes
// came out of the bank page because the two stacked made neither readable.
//
// Not called "Books", tempting as it was. In a salon "my book" is the
// appointment schedule — "the book's full" — so a money tab called Books
// invites exactly the wrong guess.

type Tab = "overview" | "bank" | "taxes" | "costs";

const TABS: [Tab, string, LucideIcon][] = [
  ["overview", "Overview", BarChart3],
  ["bank", "Bank", Landmark],
  ["taxes", "Taxes", Receipt],
  ["costs", "Costs", TrendingUp],
];

export default function Money() {
  const [tab, setTab] = useState<Tab>("overview");
  // Bumped after an upload or a re-categorised row, so Taxes reflects it.
  const [dataKey, setDataKey] = useState(0);
  const changed = useCallback(() => setDataKey((k) => k + 1), []);

  // Deep-linkable and survives a reload, as #money/taxes. Old inventory links
  // are redirected by the studio before they get here.
  useEffect(() => {
    const read = () => {
      const sub = window.location.hash.replace(/^#/, "").split("/")[1];
      if (sub && TABS.some(([k]) => k === sub)) setTab(sub as Tab);
    };
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);

  function select(next: Tab) {
    setTab(next);
    // replaceState, not pushState: switching sub-tab shouldn't put entries in
    // her history for Back to walk out through one at a time.
    window.history.replaceState(null, "", `#money/${next}`);
  }

  return (
    <div>
      <h2 className="mb-4 font-display text-2xl leading-none sm:text-3xl">Money</h2>

      <div className="-mx-1 flex flex-wrap items-center gap-1 border-b border-foreground/15">
        {TABS.map(([key, label, Icon]) => (
          <button
            key={key}
            onClick={() => select(key)}
            className={`-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm transition ${
              tab === key
                ? "border-foreground font-medium"
                : "border-transparent text-muted hover:text-foreground"
            }`}
          >
            <Icon size={15} />
            {label}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {tab === "overview" && <MoneyOverview key={`ov-${dataKey}`} />}
        {tab === "bank" && <MoneyBank onChanged={changed} />}
        {tab === "taxes" && <MoneyTax key={`tax-${dataKey}`} />}
        {tab === "costs" && <MoneyColourCost key={`cc-${dataKey}`} />}
      </div>
    </div>
  );
}
