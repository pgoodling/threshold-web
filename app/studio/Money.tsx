"use client";

import { useCallback, useEffect, useState } from "react";
import { Segments } from "./ui";
import { BarChart3, Landmark, Receipt, Scissors, type LucideIcon } from "lucide-react";
import MoneyBank from "./MoneyBank";
import MoneyOverview from "./MoneyOverview";
import MoneyServices from "./MoneyServices";
import MoneyTax from "./MoneyTax";

// Money: the monthly and quarterly jobs.
//
//   Overview revenue against expenses, by week, month, quarter or year
//   Bank     upload a statement, see what came in, fix a category
//   Taxes    what to set aside, when it's due, sales tax collected
//   Services what each service earns per hour of her hands, after product
//
// Inventory used to be two tabs here. It moved to its own studio item
// (2026-09-30) because she uses it every day and this once a month, and taxes
// came out of the bank page because the two stacked made neither readable.
//
// Not called "Books", tempting as it was. In a salon "my book" is the
// appointment schedule — "the book's full" — so a money tab called Books
// invites exactly the wrong guess.

type Tab = "overview" | "bank" | "taxes" | "services";

const TABS: [Tab, string, LucideIcon][] = [
  ["overview", "Overview", BarChart3],
  ["bank", "Bank", Landmark],
  ["taxes", "Taxes", Receipt],
  ["services", "Services", Scissors],
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
      let sub = window.location.hash.replace(/^#/, "").split("/")[1];
      if (sub === "costs") sub = "services"; // Costs became Services, 2026-09-30
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
    // replaceState fires nothing; the studio menu marks the tab from this.
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  }

  return (
    <div>
      <h2 className="mb-4 font-display text-2xl leading-none sm:text-3xl">Money</h2>

      <Segments
        label="View"
        options={TABS.map(([key, label]) => [key, label] as const)}
        value={tab}
        onChange={select}
      />

      <div className="mt-6">
        {tab === "overview" && <MoneyOverview key={`ov-${dataKey}`} />}
        {tab === "bank" && <MoneyBank onChanged={changed} />}
        {tab === "taxes" && <MoneyTax key={`tax-${dataKey}`} />}
        {tab === "services" && <MoneyServices key={`sv-${dataKey}`} />}
      </div>
    </div>
  );
}
