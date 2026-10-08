// Three kinds of thing she buys, which the tax rules treat differently
// (2026-10-08). Shared by the purchase form's dropdown and the year-end
// summary's "Before opening" section, so the two always agree.
//
//   equipment  furniture, fixtures, salon equipment, decor, tools -- deducted
//              as equipment (the de minimis election at her amounts), never as
//              a startup cost
//   product    back bar, colour, stock for resale -- a cost as it's used or sold
//   other      everything else: rent, licences, insurance, services, software...
//              Before opening, these are the startup costs (26 U.S.C. § 195).

export type CostGroup = "equipment" | "product" | "other";

export const GROUP_LABEL: Record<CostGroup, string> = {
  equipment: "Furniture and equipment",
  product: "Product",
  other: "Other business costs",
};

/** Kinds that are spending at all. Income, owner money and personal aren't. */
export const SPENDING_KINDS = ["fixed", "product", "variable", "resale", "capital"];

export function costGroup(c: { name: string; kind: string }): CostGroup | null {
  if (!SPENDING_KINDS.includes(c.kind)) return null;
  if (c.kind === "capital" || /tools and equipment/i.test(c.name)) return "equipment";
  if (c.kind === "product" || c.kind === "resale") return "product";
  return "other";
}
