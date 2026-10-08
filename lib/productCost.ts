// Product cost per visit, for Money → Services. Two kinds, kept apart because
// they're known in different ways (agreed with Paul and Evelyn 2026-10-08):
//
//   MEASURED   colour and lightener. She gave amounts per service (60 g
//              lightener + 120 developer for a full highlight, …), so a visit
//              costs amount × what she paid per gram or ml. Prices come from her
//              inventory, so a new price flows through.
//   LEARNED    bowl and styling products, which vary client to client. Each
//              back-bar bottle she has FINISHED, divided by the paid visits
//              between the day it went on the bar and the day it was finished.
//              Gets better with every bottle; says "learning" until there's one.
//
// Grams are counted as ml for liquids (developer, colour, gloss). Developer is
// a touch denser than water (~1.05), so this overstates it by a few cents.
// Lightener is sold by weight, so it needs no such assumption.

export type InvProduct = { name: string; size: string | null; unit_cost_cents: number | null };

type Unit = "ml" | "g" | "foils" | "pieces" | "m";

const ML_PER_FLOZ = 29.5735;
const G_PER_LB = 453.59237;

/** A bottle's contents in ml or g, from its size field or its name. */
export function contents(p: Pick<InvProduct, "name" | "size">): { amount: number; unit: Unit } | null {
  // The size field can say grams or plain "L"; a name can't be trusted to --
  // "GLOSS COLLECTION 10.3G" is a shade, not 10.3 grams.
  const sources: [string, RegExp][] = [
    [p.size ?? "", /(\d+(?:\.\d+)?)\s*(fl\.?\s*oz|oz|litre|liter|l|ml|lb|g)\b\.?/i],
    [p.name, /(\d+(?:\.\d+)?)\s*(fl\.?\s*oz|oz|litre|liter|ml|lb)\b\.?/i],
  ];
  // Counted things: gloves "100 pieces", beads, caps.
  const pieces = (p.size ?? "").match(/(\d+)\s*(pieces?|pcs?|ct)\b/i);
  if (pieces) return { amount: Number(pieces[1]), unit: "pieces" };
  // A box of foils: "500 ct."
  const count = p.name.match(/(\d+)\s*ct\b/i);
  if (count) return { amount: Number(count[1]), unit: "foils" };
  for (const [text, re] of sources) {
    const m = text.match(re);
    if (m) {
      const n = Number(m[1]);
      const u = m[2].toLowerCase().replace(/\s|\./g, "");
      if (u === "floz" || u === "oz") return { amount: n * ML_PER_FLOZ, unit: "ml" };
      if (u === "litre" || u === "liter" || u === "l") return { amount: n * 1000, unit: "ml" };
      if (u === "ml") return { amount: n, unit: "ml" };
      if (u === "lb") return { amount: n * G_PER_LB, unit: "g" };
      if (u === "g") return { amount: n, unit: "g" };
    }
    // "… Liter" with no number in front.
    if (/\b(liter|litre)\b/i.test(text)) return { amount: 1000, unit: "ml" };
  }
  return null;
}

// ---- Measured: the recipes -------------------------------------------------

type Ingredient = {
  key: string;
  label: string;
  match: RegExp;
  /** A price she's told us, used until the thing is in her inventory. */
  fallback?: { cents: number; amount: number; unit: Unit; from: string };
};

// Which inventory products price each ingredient. Several shades of the same
// line are averaged (they cost the same today).
export const INGREDIENTS: Record<string, Ingredient> = {
  lightener: { key: "lightener", label: "Lightener", match: /Blonde IQ/i },
  developer: { key: "developer", label: "Developer", match: /Pro-Oxide/i },
  gloss: { key: "gloss", label: "Toner", match: /^GLOSS COLLECTION (?!LIQUID|CLEAR)/i },
  activator: { key: "activator", label: "Toner activator", match: /GLOSS COLLECTION LIQUID ACTIVATOR/i },
  colour: { key: "colour", label: "Color", match: /^Tinta (?!.*Developer)/i },
  colourDev: { key: "colourDev", label: "Color developer", match: /^Tinta.*Developer/i },
  // The pop-up sheets, which come counted. The roll is cut to length, so it
  // can't be priced per foil.
  foil: { key: "foil", label: "Foils", match: /Pop Up Foil/i },
  // Priced as single gloves; a pair is two.
  gloves: { key: "gloves", label: "Gloves", match: /^Gloves\b/i },
  // Caps, string and beads aren't in her inventory yet (8 Oct): the prices
  // Paul gave stand in until they are, then the inventory's price wins.
  cap: {
    key: "cap",
    label: "Plastic cap",
    match: /plastic cap|processing cap/i,
    fallback: { cents: 939, amount: 100, unit: "pieces", from: "$9.39 for 100" },
  },
  string: {
    key: "string",
    label: "String",
    match: /extension (string|thread)|beading thread/i,
    fallback: { cents: 899, amount: 1700, unit: "m", from: "$8.99 a spool of 1,700 m" },
  },
  beads: {
    key: "beads",
    label: "Beads",
    match: /\bbeads?\b/i,
    fallback: { cents: 1499, amount: 2500, unit: "pieces", from: "$14.99 for 2,500" },
  },
};

/** Anything priced by a recipe (chemicals and supplies), so the learned pools leave it out. */
export const isChemical = (name: string) =>
  Object.values(INGREDIENTS).some((i) => i.match.test(name)) ||
  /GLOSS (COLLECTION|APPLICATOR)|Lifting Powder|Foil|Glove|\bCaps?\b|\bBeads?\b|String|Thread/i.test(name);

type Part = { ingredient: keyof typeof INGREDIENTS; amount: number; say?: string };
type Recipe = { parts: Part[]; maybe?: Part[]; perRow?: Part[]; waiting?: string[] };

const toner: Part[] = [
  { ingredient: "gloss", amount: 30 },
  { ingredient: "activator", amount: 60 },
];
// 65 foils on a full highlight (Evelyn, 2026-10-08); a partial and a mini
// take the same share as their lightener.
const lift = (share: number): Part[] => [
  { ingredient: "lightener", amount: 60 * share },
  { ingredient: "developer", amount: 120 * share },
  { ingredient: "foil", amount: 65 * share },
];
const colour = (share: number): Part[] => [
  { ingredient: "colour", amount: 50 * share },
  { ingredient: "colourDev", amount: 75 * share },
];

// One pair of gloves per colour service; a cap on signature colours only.
const gloves: Part = { ingredient: "gloves", amount: 2, say: "Gloves, 1 pair" };
const cap: Part = { ingredient: "cap", amount: 1, say: "Plastic cap" };

// An arm's length of string taken as 70 cm -- an assumption, and it barely
// matters: string is half a cent a metre.
const ARM_M = 0.7;

const FULL: Recipe = { parts: [...lift(1), ...toner] };
const PARTIAL: Recipe = { parts: [...lift(0.5), ...toner] };
const MINI: Recipe = { parts: [...lift(0.25), ...toner] };
const ALLOVER: Recipe = { parts: [...colour(1), gloves, cap], maybe: toner };
const ROOT: Recipe = { parts: [...colour(0.5), gloves], maybe: toner };
// Per row: 4 arm's lengths of string and 15 beads. Extensions are priced by
// the row -- $115 a row (Paul, 2026-10-08) -- so a visit's rows are what it
// was paid ÷ $115.
const EXTENSIONS: Recipe = {
  parts: [],
  perRow: [
    { ingredient: "string", amount: 4 * ARM_M, say: "String, 4 arm's lengths (about 2.8 m)" },
    { ingredient: "beads", amount: 15, say: "Beads, 15" },
  ],
};

export const ROW_PRICE_CENTS = 11500;

/** Rows in an extension visit: paid ÷ $115, rounded, at least one. */
export const rowsFor = (paidCents: number) => Math.max(1, Math.round(paidCents / ROW_PRICE_CENTS));

/** Average rows across a service's visits. */
export const averageRows = (paid: number[]) =>
  paid.length ? paid.reduce((t, c) => t + rowsFor(c), 0) / paid.length : 0;

// By service name. "Cut & X" is X's chemicals; the cut's wash and styling come
// from the learned pool every service shares.
export const RECIPES: Record<string, Recipe> = {
  "Custom Full Highlight": FULL,
  "Custom Cut & Full Highlight": FULL,
  "Custom Balayage": FULL,
  "Custom Cut & Balayage": FULL,
  "Seamless Grey Blending": FULL,
  "Seamless Cut & Grey Blending": FULL,
  "Custom Partial Highlights": PARTIAL,
  "Custom Cut & Partial Highlight": PARTIAL,
  "Custom Mini Foil": MINI,
  "Signature Color": ALLOVER,
  "Signature Cut & Color": ALLOVER,
  "Root Retouch": ROOT,
  "Cut & Root Refresh": ROOT,
  "Hand-tied Extension Application": EXTENSIONS,
  "Custom Hand-tied Extension Maintenance": EXTENSIONS,
};

export type PricedIngredient = {
  label: string;
  /** Cents per ml or g. */
  rate: number;
  unit: Unit;
  /** "Blonde IQ $23.00 ÷ 499 g" */
  working: string;
};

export function priceIngredient(key: keyof typeof INGREDIENTS, products: InvProduct[]): PricedIngredient | null {
  const ing = INGREDIENTS[key];
  const found = products
    .filter((p) => ing.match.test(p.name) && p.unit_cost_cents != null)
    .map((p) => ({ p, c: contents(p) }))
    .filter((x): x is { p: InvProduct; c: { amount: number; unit: Unit } } => x.c !== null);
  if (found.length === 0) {
    const f = ing.fallback;
    if (!f) return null;
    return { label: ing.label, rate: f.cents / f.amount, unit: f.unit, working: `${f.from} (not in inventory yet)` };
  }
  const rates = found.map((x) => x.p.unit_cost_cents! / x.c.amount);
  const rate = rates.reduce((a, b) => a + b, 0) / rates.length;
  const first = found[0];
  const same = found.every((x) => x.p.unit_cost_cents === first.p.unit_cost_cents);
  const name = found.length > 1 ? `${found.length} shades` : first.p.name.replace(/\s+\d.*$/, "");
  return {
    label: ing.label,
    rate,
    unit: first.c.unit,
    working: `${name} ${same ? usd(first.p.unit_cost_cents!) : "avg"} ÷ ${Math.round(first.c.amount).toLocaleString("en-US")} ${first.c.unit}`,
  };
}

export type CostLine = { label: string; amount: number; unit: string; cents: number; working: string; say?: string };

/** A service's measured lines, the toner-if-toned lines, and what's waiting. */
export function measured(serviceName: string, products: InvProduct[]) {
  const recipe = RECIPES[serviceName];
  if (!recipe)
    return { lines: [] as CostLine[], maybe: [] as CostLine[], perRow: [] as CostLine[], waiting: [] as string[], missing: [] as string[] };
  const missing: string[] = [];
  const price = (parts: Part[]) =>
    parts.flatMap((part) => {
      const p = priceIngredient(part.ingredient, products);
      if (!p) {
        missing.push(INGREDIENTS[part.ingredient].label);
        return [];
      }
      return [{ label: p.label, amount: part.amount, unit: p.unit, cents: part.amount * p.rate, working: p.working, say: part.say }];
    });
  return {
    lines: price(recipe.parts),
    maybe: price(recipe.maybe ?? []),
    perRow: price(recipe.perRow ?? []),
    waiting: recipe.waiting ?? [],
    missing,
  };
}

// ---- Learned: finished back-bar bottles ------------------------------------

export type Movement = {
  product_name: string;
  kind: string;
  quantity: number;
  unit_cost_cents: number | null;
  occurred_on: string;
  created_at: string;
};

export type Bottle = { name: string; cents: number; opened: string; finished: string };

/**
 * Bottles opened and finished, paired first-in first-out per product. A
 * "used" of −2 is two bottles. Bottles still open are counted separately.
 */
export function finishedBottles(moves: Movement[], include: (name: string) => boolean) {
  const by = new Map<string, Movement[]>();
  for (const m of moves) {
    if (!include(m.product_name) || (m.kind !== "used" && m.kind !== "finished")) continue;
    by.set(m.product_name, [...(by.get(m.product_name) ?? []), m]);
  }
  const done: Bottle[] = [];
  let stillOpen = 0;
  for (const [name, ms] of by) {
    ms.sort((a, b) => a.occurred_on.localeCompare(b.occurred_on) || a.created_at.localeCompare(b.created_at));
    const open: { day: string; cents: number }[] = [];
    for (const m of ms) {
      const n = Math.round(Math.abs(m.quantity));
      for (let i = 0; i < n; i++) {
        if (m.kind === "used") open.push({ day: m.occurred_on, cents: m.unit_cost_cents ?? 0 });
        else {
          const o = open.shift();
          if (o) done.push({ name, cents: o.cents, opened: o.day, finished: m.occurred_on });
        }
      }
    }
    stillOpen += open.length;
  }
  return { done, stillOpen };
}

// The back bar was set up on 25 and 29 Sep 2026: dozens of bottles recorded
// as "on the bar" that she was already using, so their real opening dates
// aren't known. A bottle "opened 25 Sep, finished 30 Sep" was really open far
// longer, and counting it over five days' visits made bowl and styling look
// like $6.67 a visit. Only bottles put on the bar from here on are counted.
export const LEARN_FROM = "2026-10-01";

export type Pool = {
  bottles: Bottle[];
  stillOpen: number;
  costCents: number;
  from: string | null;
  to: string | null;
  visits: number;
  /** Cents per visit, or null while nothing is finished or no visits fall inside. */
  perVisit: number | null;
};

/**
 * Finished bottles' cost ÷ the paid visits (that use this pool) from the
 * first of those bottles going on the bar to the last being finished.
 */
export function pool(
  moves: Movement[],
  include: (name: string) => boolean,
  visitDays: string[],
  since: string = LEARN_FROM,
): Pool {
  const all = finishedBottles(moves, include);
  const done = all.done.filter((b) => b.opened >= since);
  const stillOpen = all.stillOpen;
  if (done.length === 0) return { bottles: [], stillOpen, costCents: 0, from: null, to: null, visits: 0, perVisit: null };
  const from = done.map((b) => b.opened).sort()[0];
  const to = done.map((b) => b.finished).sort().slice(-1)[0];
  const visits = visitDays.filter((d) => d >= from && d <= to).length;
  const costCents = done.reduce((t, b) => t + b.cents, 0);
  return { bottles: done, stillOpen, costCents, from, to, visits, perVisit: visits > 0 ? costCents / visits : null };
}

export const isMask = (name: string) => /\bmask\b/i.test(name);
/** Bowl and styling: every back-bar product that isn't a chemical or a mask. */
export const inWashPool = (name: string) => !isChemical(name) && !isMask(name);

/** Which services draw on which pool. Consultations use nothing. */
export const usesWash = (service: string) => !/consultation/i.test(service);
export const usesMask = (service: string) => /treatment/i.test(service) && !/keratin/i.test(service);

function usd(c: number) {
  return `$${(c / 100).toFixed(2)}`;
}
