// Size as a number and a unit, written to products.size as "10.1 fl oz".
// Kept to these units so the text is always "<number> <unit>" — the
// per-service product costing will need to read it back.
export const UNITS = ["fl oz", "oz", "ml", "L", "g", "lb", "pieces"] as const;

/** "10.1 oz" / "1 litre" / "68 pc" → { amount, unit }, or blanks. */
export function splitSize(size: string | null | undefined): { amount: string; unit: string } {
  const m = (size ?? "").trim().match(/^(\d+(?:\.\d+)?)\s*(.*)$/);
  if (!m) return { amount: "", unit: "fl oz" };
  const u = m[2].toLowerCase().replace(/\.$/, "");
  const unit =
    u === "" ? "fl oz"
    : /^l(itre|iter)?$/.test(u) ? "L"
    : /^ml$/.test(u) ? "ml"
    : /^(fl\s*)?oz$/.test(u) ? "fl oz"
    : /^lb/.test(u) ? "lb"
    : /^g$/.test(u) ? "g"
    : /^(pc|pcs|pieces?)$/.test(u) ? "pieces"
    : "fl oz";
  return { amount: m[1], unit };
}

