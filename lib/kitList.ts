// Reading a pasted "what's in the box" list.
//
// Suppliers print kit contents as quantity-then-name —
//
//   3 Color Brillianz Anti-fade Sulfate-Free Shampoo 10.1 oz.
//   2 Long & Strong Super Serum 3.4 oz.
//   1 Care Studio Plus Merchandising Kit
//
// — and that is the shape they arrive in when copied off a product page or a
// packing slip. The Keune Care Studio Plus Intro is twenty-nine such lines,
// which is exactly the length of list a person abandons halfway through
// retyping.
//
// Lives here rather than beside the form so it can be tested without dragging
// React and the Supabase client in behind it.

export type KitLine = { name: string; qty: string };

/**
 * Parse pasted lines into quantities and names.
 *
 * A line with no leading number is kept at quantity one rather than dropped.
 * A wrong quantity is visible in the form and takes a second to fix; a dropped
 * line is a bottle that exists on the shelf and in no record, which nothing
 * downstream will ever flag.
 */
export function parsePastedList(text: string): KitLine[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l !== "")
    .map((l) => {
      // Optional x or × between the count and the name: "3 x Shampoo".
      const m = l.match(/^(\d+)\s*[x×]?\s+(.+)$/i);
      if (m) return { qty: m[1], name: m[2].trim() };
      return { qty: "1", name: l };
    });
}

/** Total pieces described by a parsed list — for checking against "68 pc.". */
export function totalUnits(lines: KitLine[]): number {
  return lines.reduce((t, l) => t + (Number(l.qty) || 0), 0);
}
