"use client";

import { useEffect, useState } from "react";
import { Segments } from "./ui";
import { Package, History, type LucideIcon } from "lucide-react";
import MoneyInventory from "./MoneyInventory";
import MoneyActivity from "./MoneyActivity";

// Inventory, as its own item in the studio rather than a tab of Money.
//
// Split out 2026-09-30: she opens this every working day — putting a bottle on
// the bar, selling one, counting — and Money once a month to upload a
// statement. Two jobs on different clocks don't belong behind the same door.
//
//   Stock      every change to stock: Sell, Add stock, Count, the bar
//   Activity   what happened, Today / Week / Month; nothing to press
//
// Deep-linkable as #inventory/activity, same shape as #money/taxes.

type Tab = "stock" | "activity";

const TABS: [Tab, string, LucideIcon][] = [
  ["stock", "Stock", Package],
  ["activity", "Activity", History],
];

export default function Inventory() {
  const [tab, setTab] = useState<Tab>("stock");
  // Bumped after a sale or a delivery, so Activity shows it when she switches.
  const [dataKey, setDataKey] = useState(0);

  useEffect(() => {
    const read = () => {
      const sub = window.location.hash.replace(/^#/, "").split("/")[1];
      setTab(sub === "activity" ? "activity" : "stock");
    };
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);

  function select(next: Tab) {
    setTab(next);
    window.history.replaceState(null, "", next === "stock" ? "#inventory" : `#inventory/${next}`);
    // replaceState fires nothing; the studio menu marks the tab from this.
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  }

  return (
    <div>
      <h2 className="mb-4 font-display text-2xl leading-none sm:text-3xl">Inventory</h2>

      <Segments
        label="View"
        options={TABS.map(([key, label]) => [key, label] as const)}
        value={tab}
        onChange={select}
      />

      <div className="mt-6">
        {tab === "stock" && <MoneyInventory onChanged={() => setDataKey((k) => k + 1)} />}
        {tab === "activity" && <MoneyActivity key={`activity-${dataKey}`} />}
      </div>
    </div>
  );
}
