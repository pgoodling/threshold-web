"use client";

import { useCallback, useEffect, useState } from "react";
import { Sun, Package, Landmark, TrendingUp, type LucideIcon } from "lucide-react";
import MoneyDaily from "./MoneyDaily";
import MoneyStatement from "./MoneyStatement";
import MoneyManual from "./MoneyManual";
import MoneyReview from "./MoneyReview";
import MoneyInvoice from "./MoneyInvoice";
import MoneyCatalogue from "./MoneyCatalogue";
import MoneyCount from "./MoneyCount";
import MoneyColourCost from "./MoneyColourCost";
import MoneyTax from "./MoneyTax";

// Money, as four jobs rather than one scroll.
//
// This page had grown to seven stacked sections with two near-identical
// product searches in it, and Paul went looking for the catalogue and typed
// into the daily log — which is the page's fault, not his. The reports still
// to come would only have made it longer.
//
// The split is by WHEN she does the thing, not by what the data is:
//
//   Today        between clients, every working day
//   Inventory    when an order arrives, and at a stock count
//   Bank & tax   once a month, and at the quarter
//   Costs        when she's wondering whether her prices work
//
// Not called "Books", tempting as it was. In a salon "my book" is the
// appointment schedule — "the book's full" — so a money tab called Books
// invites exactly the wrong guess.

type Tab = "today" | "inventory" | "bank" | "costs";

const TABS: [Tab, string, LucideIcon][] = [
  ["today", "Today", Sun],
  ["inventory", "Inventory", Package],
  ["bank", "Bank & tax", Landmark],
  ["costs", "Costs", TrendingUp],
];

export default function Money() {
  const [tab, setTab] = useState<Tab>("today");
  // Bumped after anything that writes, so the tab she lands on next shows
  // what just happened rather than what was there when the page loaded.
  const [dataKey, setDataKey] = useState(0);
  const changed = useCallback(() => setDataKey((k) => k + 1), []);
  const noop = useCallback(() => {}, []);

  // Deep-linkable and survives a reload — she is often halfway through pricing
  // a shelf when the phone rings. Written as #money/inventory, matching the
  // #clients/<id> shape the studio already parses as name-slash-detail.
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
    // replaceState, not pushState: switching sub-tab shouldn't put four
    // entries in her history for Back to walk out through one at a time.
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
        {tab === "today" && <MoneyDaily key={`daily-${dataKey}`} />}

        {tab === "inventory" && (
          <>
            <MoneyInvoice onImported={changed} />
            <div className="mt-10 border-t border-foreground/15 pt-8">
              <MoneyCount key={`count-${dataKey}`} />
            </div>
            <div className="mt-10 border-t border-foreground/15 pt-8">
              <h3 className="font-display text-lg">What she stocks</h3>
              <MoneyCatalogue key={`cat-${dataKey}`} />
            </div>
          </>
        )}

        {tab === "bank" && (
          <>
            <h3 className="font-display text-lg">Bring in a statement</h3>
            <div className="mt-1">
              <MoneyStatement onImported={changed} />
            </div>
            <MoneyManual onAdded={changed} />
            <div className="mt-10 border-t border-foreground/15 pt-8">
              <MoneyReview key={dataKey} onCount={noop} />
            </div>
            <MoneyTax key={`tax-${dataKey}`} />
          </>
        )}

        {tab === "costs" && <MoneyColourCost key={`cc-${dataKey}`} />}
      </div>
    </div>
  );
}
