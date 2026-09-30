// Turning a supplier's product name into something readable on a phone.
//
// The supplier writes "Long & Strong Strengthening Shampoo 10.1 oz." — the
// range, the product and the size run together, and on a phone the useful part
// is exactly the part that gets cut off. So the range becomes a heading she
// scrolls past once, and each row carries only what's left: "Strengthening
// Shampoo", with "10.1 oz" underneath.
//
// Ranges are listed rather than guessed. A guess from the first two words
// would file "Tinta Clear" under a range called "Tinta Clear" and "Pure Volume
// Mousse" under "Pure Volume". An unknown product falls back to its brand,
// which is always right, if less tidy.

const LINES: Record<string, string[]> = {
  keune: [
    "Absolute Volume",
    "Care Studio",
    "Color Brillianz",
    "Confident Curl",
    "Long & Strong",
    "Radiant Gloss",
    "Silver Savior",
    "Tinta",
    "Ultimate Blonde",
    "Velvet Smooth",
    "Vital Nutrition",
  ],
  "maria nila": ["Gloss Collection"],
};

// Trailing sizes as the supplier prints them: "10.1 oz.", "2 Fl. Oz.",
// "Liter", "68 pc.".
const SIZE = /\s+((?:\d+(?:\.\d+)?\s*(?:fl\.?\s*)?oz\.?)|liter|litre|(?:\d+\s*pc\.?))$/i;

/** "MIRROR GLOSS MASK" → "Mirror Gloss Mask"; leaves "10.0N" and "9.7WN" alone. */
function tame(s: string): string {
  if (s !== s.toUpperCase() && s !== s.toLowerCase()) return s;
  return s
    .toLowerCase()
    .split(" ")
    .map((w) => (/\d/.test(w) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}

export type Named = {
  /** "Keune · Long & Strong", or just "Moroccanoil". */
  group: string;
  /** "Strengthening Shampoo". */
  short: string;
  /** "10.1 oz", or null when the name carries none. */
  size: string | null;
};

export function nameProduct(p: {
  name: string;
  brand: string | null;
  size: string | null;
}): Named {
  let rest = p.name.trim();
  let size = p.size;

  const m = rest.match(SIZE);
  if (m) {
    // "2 Fl. Oz." → "2 oz". Fluid ounces are the only ounces on a bottle.
    size =
      size ??
      m[1]
        .toLowerCase()
        .replace(/fl\.?\s*/, "")
        .replace(/\.$/, "")
        .replace(/\s+/g, " ")
        .replace(/^liter$|^litre$/, "1 litre");
    rest = rest.slice(0, m.index).trim();
  }

  const brand = p.brand ? tame(p.brand.trim()) : "Other";
  const lines = LINES[(p.brand ?? "").trim().toLowerCase()] ?? [];
  const line = lines.find((l) => rest.toLowerCase().startsWith(l.toLowerCase() + " "));

  if (!line) return { group: brand, short: tame(rest), size };

  rest = rest.slice(line.length).trim();

  // Tinta shades arrive as "6- Dark Blonde"; the dash is the supplier's, not
  // hers. And the developer's name repeats three product ranges before it gets
  // to the point.
  if (line === "Tinta") {
    rest = rest.replace(/^([\w.]+)-\s+/, "$1 ");
    const dev = rest.indexOf("Developer");
    if (dev > 0) rest = rest.slice(dev);
  }

  return { group: `${brand} · ${line}`, short: tame(rest), size };
}

/** Shade order, so 10.0N comes after 9.9P rather than before 2. */
export const byName = (a: string, b: string) =>
  a.localeCompare(b, "en", { numeric: true, sensitivity: "base" });
