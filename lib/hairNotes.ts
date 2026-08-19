// The hair-notes vocabulary, defined once.
//
// The form asks the questions and the studio reads the answers back, so both
// need the same option lists and the same labels. Two copies would drift, and
// the failure would be silent — a client answering "coily" and Evelyn seeing a
// blank because the studio spelled it "coil".

export const HAIR_TYPE = [
  { value: "straight", label: "Straight" },
  { value: "wavy", label: "Wavy" },
  { value: "curly", label: "Curly" },
  { value: "coily", label: "Coily" },
  { value: "unsure", label: "Not sure" },
];

export const STRAND = [
  { value: "fine", label: "Fine" },
  { value: "medium", label: "Medium" },
  { value: "coarse", label: "Coarse" },
  { value: "unsure", label: "Not sure" },
];

export const DENSITY = [
  { value: "low", label: "Not much" },
  { value: "average", label: "Average" },
  { value: "high", label: "A lot" },
];

export const LENGTH = [
  { value: "above", label: "Above shoulders" },
  { value: "shoulders", label: "Shoulders" },
  { value: "midback", label: "Mid-back" },
  { value: "longer", label: "Longer" },
];

export const LAST_CUT = [
  { value: "under6w", label: "Under 6 weeks" },
  { value: "2to3m", label: "2–3 months" },
  { value: "6m", label: "About 6 months" },
  { value: "over1y", label: "Over a year" },
];

// What they're struggling with, and what it's worth offering. The suggestion
// lives beside the problem so the two can't fall out of step -- and so adding a
// problem forces a decision about what she'd do about it.
export const STRUGGLES = [
  { value: "breakage", label: "Breakage", offer: "Bond-building treatment" },
  { value: "split_ends", label: "Split ends", offer: "Dusting or a proper trim" },
  { value: "dryness", label: "Dryness", offer: "Deep conditioning" },
  { value: "frizz", label: "Frizz", offer: "Smoothing treatment or a gloss" },
  { value: "oily", label: "Oily roots", offer: "Clarifying wash" },
  { value: "flat", label: "Flat, no volume", offer: "Volumising cut and product" },
  { value: "scalp", label: "Itchy or flaky scalp", offer: "Scalp treatment" },
  { value: "fading", label: "Colour fading fast", offer: "Gloss or toner refresh" },
  { value: "tangles", label: "Tangles", offer: "Conditioning and a shape-up" },
  { value: "growing", label: "Growing it out", offer: "Trim plan, not a cut" },
  { value: "greys", label: "Greys", offer: "Root coverage or blending" },
];

const label = (list: { value: string; label: string }[], v: string | null) =>
  list.find((o) => o.value === v)?.label ?? null;

export type Intake = {
  hair_type: string | null;
  strand: string | null;
  density: string | null;
  length: string | null;
  last_cut: string | null;
  struggles: string[];
  allergies: string | null;
  note: string | null;
};

// Her hair, as one readable line: "Wavy · Coarse · A lot of it · Mid-back".
export function hairSummary(i: Intake): string[] {
  return [
    label(HAIR_TYPE, i.hair_type),
    label(STRAND, i.strand),
    i.density === "high"
      ? "A lot of it"
      : i.density === "low"
        ? "Not much of it"
        : label(DENSITY, i.density),
    label(LENGTH, i.length),
    i.last_cut ? `Last cut ${label(LAST_CUT, i.last_cut)?.toLowerCase()}` : null,
  ].filter((x): x is string => !!x);
}

export function offersFor(struggles: string[]): { problem: string; offer: string }[] {
  return STRUGGLES.filter((s) => struggles.includes(s.value)).map((s) => ({
    problem: s.label.toLowerCase(),
    offer: s.offer,
  }));
}

// Whether this one is likely to run over, and why — in words, not minutes.
//
// A number invented from four dropdowns would be wrong often enough that she'd
// stop trusting it, and once she stops trusting it she stops reading it. The
// flag plus the reason lets her make the call, which she'd do anyway.
export function timingFlag(i: Intake): string | null {
  const reasons: string[] = [];
  if (i.density === "high") reasons.push("a lot of hair");
  if (i.strand === "coarse") reasons.push("coarse");
  if (i.length === "midback" || i.length === "longer") {
    reasons.push(i.length === "longer" ? "very long" : "mid-back");
  }
  if (i.hair_type === "curly" || i.hair_type === "coily") reasons.push("curly");

  // One factor is normal. Two or more together is what actually overruns a slot.
  if (reasons.length < 2) return null;

  const last = reasons.pop();
  return `${reasons.join(", ")} and ${last}`;
}
