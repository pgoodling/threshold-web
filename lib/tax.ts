// What she should put by.
//
// The point of this file is one number — the share of each profit dollar that
// is not hers — because four form-shaped answers is how tax software makes
// people feel stupid. The breakdown exists so the number can be argued with,
// not so it has to be read.
//
// NOT ADVICE, AND THE CODE SHOULD NOT PRETEND OTHERWISE
//
// Every rate arrives from the tax_rates table carrying a source and a date it
// was checked. Nothing is hardcoded here, because a constant in a .ts file is
// a bug with a delay fuse: brackets, the standard deduction and the Social
// Security wage base all move every year.
//
// THE FOUR JURISDICTIONS, AND WHICH ARE CERTAIN
//
//   Federal SE tax     mechanical. 15.3% of 92.35% of profit, the Social
//                      Security half stopping at the wage base.
//   Federal income     depends on the HOUSEHOLD, not the salon. Needs filing
//                      status and any other income; without them it is a
//                      guess made from the bottom bracket up, and low.
//   Ohio               almost certainly zero — the Business Income Deduction
//                      exempts the first $250,000. Worth saying out loud, or
//                      a $0 reads as a bug.
//   Kettering          mechanical. 2.25% of profit, where the work happens.
//   Oakwood            2.5% less a 90% credit for Kettering — about 0.475%
//                      more. The line everyone misses.

export type FilingStatus = "single" | "married_jointly";

/**
 * Federal estimated-tax quarters. Payment is due the 15th, or the next
 * business day — which this does not model, because a deadline shown a day
 * early is harmless and one shown a day late is not.
 */
const QUARTERS: [month: number, day: number, label: string][] = [
  [3, 15, "first quarter"],
  [5, 15, "second quarter"],
  [8, 15, "third quarter"],
  [0, 15, "fourth quarter"], // January of the following year
];

export type Deadline = {
  dueOn: string;
  label: string;
  daysAway: number;
};

/** The next federal 1040-ES date after `from`. */
export function nextQuarterlyDue(from = new Date()): Deadline {
  const y = from.getFullYear();
  const candidates = QUARTERS.map(([m, d, label]) => {
    // The fourth quarter is paid in January of the NEXT year.
    const year = m === 0 ? y + 1 : y;
    return { at: new Date(year, m, d), label };
  });
  // January's own deadline belongs to last year's fourth quarter.
  candidates.unshift({ at: new Date(y, 0, 15), label: "fourth quarter" });

  const next = candidates.find((c) => c.at.getTime() >= from.getTime()) ?? candidates[0];
  return {
    dueOn: next.at.toISOString().slice(0, 10),
    label: next.label,
    daysAway: Math.ceil((next.at.getTime() - from.getTime()) / 86_400_000),
  };
}

/**
 * What being late actually costs, so the deadline means something.
 *
 * Deliberately not a calculation. These are published rates with sources, and
 * the municipal one is the sharp edge people don't expect: a flat 15% that
 * doesn't care how small the amount was, where the federal penalty is
 * interest and scales with the sum.
 */
export type PenaltyNote = {
  who: string;
  what: string;
  sourceUrl: string;
};

/**
 * Ohio municipalities only require estimated payments once the tax payable
 * reaches $200 (ORC 718.08 / 718.88). Below that, it is settled at filing and
 * there is nothing to be late for.
 *
 * Which separates the two cities cleanly rather than lumping them:
 *
 *   Kettering   2.25% of profit, so $200 lands at about $8,900 of profit —
 *               she will pass it.
 *   Oakwood     about 0.475% after the 90% credit for Kettering, so $200
 *               needs roughly $42,100 of profit. Almost certainly a
 *               year-end settlement, not a quarterly chore.
 *
 * The same 15% penalty applies to unpaid ESTIMATED tax as to unpaid tax — so
 * knowing which city actually requires prepayment is the difference between a
 * real exposure and an imagined one.
 */
export const MUNICIPAL_ESTIMATE_THRESHOLD_CENTS = 20_000;

export type MunicipalDuty = {
  city: string;
  owedCents: number;
  mustPrepay: boolean;
  /** Profit at which this city's tax reaches $200. Null when its rate is 0. */
  profitAtThresholdCents: number | null;
};

export function municipalDuties(est: TaxEstimate): MunicipalDuty[] {
  return est.lines
    .filter((l) => l.key === "kettering" || l.key === "oakwood")
    .map((l) => {
      // Back out the effective rate from what this city actually costs her,
      // rather than re-deriving it — Oakwood's is net of the credit and only
      // the computed figure knows that.
      const effective = est.profitCents > 0 ? l.cents / est.profitCents : 0;
      return {
        city: l.label,
        owedCents: l.cents,
        mustPrepay: l.cents >= MUNICIPAL_ESTIMATE_THRESHOLD_CENTS,
        profitAtThresholdCents:
          effective > 0
            ? Math.round(MUNICIPAL_ESTIMATE_THRESHOLD_CENTS / effective)
            : null,
      };
    });
}

export function penaltyNotes(federalOwedCents: number): PenaltyNote[] {
  const notes: PenaltyNote[] = [];

  if (federalOwedCents < 100_000) {
    notes.push({
      who: "Federal",
      what:
        "Under $1,000 owed means no underpayment penalty at all. On the estimate " +
        "so far she is below that line — but it moves as the year fills in.",
      sourceUrl: "https://www.irs.gov/taxtopics/tc306",
    });
  } else {
    notes.push({
      who: "Federal",
      what:
        "Interest of roughly 7% a year on whatever was paid late. The usual " +
        "escape — paying 100% of last year's tax — doesn't exist in a first " +
        "year, so the test is 90% of this year's.",
      sourceUrl: "https://www.irs.gov/taxtopics/tc306",
    });
  }

  notes.push({
    who: "Kettering and Oakwood",
    what:
      "A flat 15% of anything unpaid, including unpaid estimated tax, plus 9% " +
      "a year interest for 2026. It does not scale down for a small amount, " +
      "which makes it the sharper of the two.",
    sourceUrl: "https://codes.ohio.gov/ohio-revised-code/section-718.27",
  });

  return notes;
}

/** A row of tax_rates, as the app reads it. */
export type RateRow = {
  jurisdiction: string;
  label: string;
  rate: number;
  filing_status: string | null;
  bracket_floor_cents: number | null;
  cap_cents: number | null;
  exempt_below_cents: number | null;
  source_url: string;
  checked_on: string;
  notes: string | null;
};

export type TaxLine = {
  key: string;
  label: string;
  cents: number;
  /** Shown beside the figure, e.g. "2.25%, where she works". */
  detail: string;
  /** True when the line is expected to be zero, so a 0 doesn't read as broken. */
  expectedZero?: boolean;
};

export type TaxEstimate = {
  profitCents: number;
  lines: TaxLine[];
  totalCents: number;
  /** The honest estimate: share of each profit dollar owed. 0.22 = 22 cents. */
  effectiveRate: number;
  /**
   * What to actually put by — the estimate rounded up, never below 25 cents.
   *
   * Kept separate from effectiveRate rather than baked into it, because
   * padding an estimate quietly turns it into a worse estimate. This is the
   * number to act on; that one is the number to argue with.
   *
   * Erring high costs her the use of money sitting in her own savings
   * account. Erring low costs a penalty and a scramble in April, and every
   * assumption above — filing status, other income, a full year of spending
   * not yet reviewed — pushes the true figure up rather than down.
   */
  suggestedRate: number;
  /** Anything that had to be assumed, named so she can correct it. */
  assumptions: string[];
  /** Blocking gaps — the estimate is not meaningful until these are answered. */
  missing: string[];
};

const SE_BASE = 0.9235; // SE tax applies to 92.35% of net profit.

/**
 * Never suggest putting by less than a quarter of profit.
 *
 * At $60,000 the honest estimate is 22 cents; at $30,000 it is 19. Both are
 * close enough to a quarter that the difference is smaller than the things
 * this model doesn't know — a spouse's income, a month of spending still
 * unreviewed, a rate that moved. A floor removes the temptation to trust a
 * decimal place that isn't earned.
 */
const FLOOR_RATE = 0.25;

/** Estimate rounded up to the next five cents, and never below the floor. */
function suggest(effective: number): number {
  return Math.max(FLOOR_RATE, Math.ceil(effective * 20) / 20);
}

const pick = (rows: RateRow[], jurisdiction: string, status?: FilingStatus) =>
  rows.filter(
    (r) =>
      r.jurisdiction === jurisdiction &&
      (r.filing_status === null || r.filing_status === status),
  );

/** Progressive tax across a bracket schedule. */
function acrossBrackets(taxableCents: number, brackets: RateRow[]): number {
  if (taxableCents <= 0 || brackets.length === 0) return 0;
  const sorted = [...brackets].sort(
    (a, b) => (a.bracket_floor_cents ?? 0) - (b.bracket_floor_cents ?? 0),
  );
  let owed = 0;
  for (let i = 0; i < sorted.length; i++) {
    const floor = sorted[i].bracket_floor_cents ?? 0;
    if (taxableCents <= floor) break;
    const ceiling = sorted[i + 1]?.bracket_floor_cents ?? Infinity;
    const slice = Math.min(taxableCents, ceiling) - floor;
    owed += slice * sorted[i].rate;
  }
  return Math.round(owed);
}

export function estimateTax(opts: {
  profitCents: number;
  rates: RateRow[];
  filingStatus: FilingStatus | null;
  otherIncomeCents: number | null;
}): TaxEstimate {
  const { profitCents, rates } = opts;
  const assumptions: string[] = [];
  const missing: string[] = [];

  if (profitCents <= 0) {
    return {
      profitCents,
      lines: [],
      totalCents: 0,
      effectiveRate: 0,
      suggestedRate: FLOOR_RATE,
      assumptions: [],
      missing:
        profitCents === 0
          ? ["No reviewed income or spending yet, so there is no profit to tax."]
          : [],
    };
  }

  const status = opts.filingStatus;
  if (status === null) {
    missing.push(
      "How she files — single or jointly. The standard deduction and every " +
        "bracket threshold roughly double between them.",
    );
  }
  const effectiveStatus: FilingStatus = status ?? "single";
  if (status === null) assumptions.push("Assuming single until told otherwise.");

  const otherIncome = opts.otherIncomeCents;
  if (otherIncome === null) {
    assumptions.push(
      "Assuming the salon is her only taxable income. If it isn't, her " +
        "profit is taxed at a higher bracket than this shows.",
    );
  }

  const lines: TaxLine[] = [];

  // ---- Self-employment tax ------------------------------------------------
  const seBase = Math.round(profitCents * SE_BASE);

  const ss = pick(rates, "federal_se_ss")[0];
  const medicare = pick(rates, "federal_se_medicare")[0];

  const ssCents = ss
    ? Math.round(Math.min(seBase, ss.cap_cents ?? Infinity) * ss.rate)
    : 0;
  const medicareCents = medicare ? Math.round(seBase * medicare.rate) : 0;
  const seCents = ssCents + medicareCents;

  if (ss || medicare) {
    lines.push({
      key: "federal_se",
      label: "Federal — self-employment",
      cents: seCents,
      detail: "15.3% of 92.35% of profit",
    });
  } else {
    missing.push("Self-employment rates are not in the database.");
  }

  // ---- Federal income tax -------------------------------------------------
  //
  // Half the SE tax is deductible, the QBI deduction takes 20% of business
  // income, and the standard deduction comes off the lot. Order matters: QBI
  // is computed on business income before the standard deduction, which is
  // why it isn't simply subtracted at the end.
  const halfSe = Math.round(seCents / 2);
  const qbiRate = pick(rates, "federal_qbi")[0]?.rate ?? 0;
  const qbiCents = Math.round(Math.max(profitCents - halfSe, 0) * qbiRate);

  const stdDeduction =
    pick(rates, "federal_standard_deduction", effectiveStatus).find(
      (r) => r.filing_status === effectiveStatus,
    )?.exempt_below_cents ?? 0;

  const taxableCents = Math.max(
    profitCents - halfSe - qbiCents + (otherIncome ?? 0) - stdDeduction,
    0,
  );

  const brackets = pick(rates, "federal_income", effectiveStatus).filter(
    (r) => r.filing_status === effectiveStatus,
  );

  // Only the salon's share: if other income exists, the tax on the whole is
  // apportioned rather than charged entirely to the salon.
  const allTax = acrossBrackets(taxableCents, brackets);
  const otherOnlyTaxable = Math.max((otherIncome ?? 0) - stdDeduction, 0);
  const otherTax = acrossBrackets(otherOnlyTaxable, brackets);
  const incomeCents = Math.max(allTax - otherTax, 0);

  if (brackets.length > 0) {
    lines.push({
      key: "federal_income",
      label: "Federal — income tax",
      cents: incomeCents,
      detail: qbiRate > 0 ? "after half the SE tax and the 20% QBI deduction" : "on taxable profit",
    });
  } else {
    missing.push("Federal brackets are not in the database.");
  }

  // ---- Ohio ---------------------------------------------------------------
  const ohio = pick(rates, "ohio")[0];
  if (ohio) {
    const above = Math.max(profitCents - (ohio.exempt_below_cents ?? 0), 0);
    lines.push({
      key: "ohio",
      label: "Ohio",
      cents: Math.round(above * ohio.rate),
      detail: "first $250,000 of business income is exempt",
      expectedZero: above === 0,
    });
  }

  // ---- Kettering, where she works ----------------------------------------
  const kettering = pick(rates, "kettering")[0];
  const ketteringCents = kettering ? Math.round(profitCents * kettering.rate) : 0;
  if (kettering) {
    lines.push({
      key: "kettering",
      label: "Kettering",
      cents: ketteringCents,
      detail: `${(kettering.rate * 100).toFixed(2)}%, where the salon is`,
    });
  }

  // ---- Oakwood, where she lives ------------------------------------------
  //
  // The credit is 90%, not 100%, and it is capped at Oakwood's own tax on the
  // same income — so this can never go negative even if Kettering's rate were
  // the higher of the two.
  const oakwood = pick(rates, "oakwood")[0];
  const credit = pick(rates, "oakwood_credit")[0];
  if (oakwood) {
    const gross = Math.round(profitCents * oakwood.rate);
    const relief = Math.min(Math.round(ketteringCents * (credit?.rate ?? 0)), gross);
    lines.push({
      key: "oakwood",
      label: "Oakwood",
      cents: Math.max(gross - relief, 0),
      detail: credit
        ? `${(oakwood.rate * 100).toFixed(2)}% less a ${(credit.rate * 100).toFixed(0)}% credit for Kettering`
        : `${(oakwood.rate * 100).toFixed(2)}%, where she lives`,
    });
  }

  const totalCents = lines.reduce((t, l) => t + l.cents, 0);

  return {
    profitCents,
    lines,
    totalCents,
    effectiveRate: profitCents > 0 ? totalCents / profitCents : 0,
    suggestedRate: suggest(profitCents > 0 ? totalCents / profitCents : 0),
    assumptions,
    missing,
  };
}
