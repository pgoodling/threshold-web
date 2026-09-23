# Threshold — Money: expenses, costs, and what she owes

_Design record for the bank-feed / cost / tax feature. Started 2026-09-23._

Related: [BACKLOG.md](BACKLOG.md). This supersedes the line in backlog item #18
that said "keep general bookkeeping/expenses/taxes in QuickBooks" — see
[Why this is in the app at all](#why-this-is-in-the-app-at-all).

> **This is not tax advice, and the app must never present it as such.** It
> produces estimates from rates that are recorded with a source and a date, and
> exports that a human can check. It does not file anything. Every rate in here
> was looked up on the date shown and needs confirming before she pays money on
> the strength of it.

---

## Why this is in the app at all

The backlog's earlier position was that bookkeeping belongs in QuickBooks and
the app should stay out of it. That was right when the app didn't know what
anything cost. Two things changed it:

1. **The app already owns the revenue side properly.** Every checked-out
   appointment carries `paid_cents`, `payment_method` and a service. No
   bookkeeping package has that granularity, and none of them can be taught it.
2. **Evelyn wants to do her own taxes.** Not "export to an accountant" — she
   wants to understand and file. That makes the gap between "a number" and "a
   number she understands the shape of" the entire product.

QuickBooks can tell her she spent $340 at SalonCentric. It cannot tell her a
full highlight costs her $8.30 in product, or that she needs eleven
appointments a week before she's earning anything. Those questions need the
appointment book and the bank feed in the same place.

## Where the data comes from

**Teller**, free tier — 100 live connections, we need one. Fallback and dev
path is a statement file (OFX/QFX/CSV) through the same ingestion code, so the
bank connection is swappable and nothing above it knows which one ran.

Two constraints that shape the code, not footnotes:

- **Teller requires mutual TLS on every production call.** Client certificate
  and private key live in Vercel env vars; the routes build an `https.Agent`
  from them. This forces those routes onto the **Node runtime** — they cannot
  be Edge. An access token alone is useless without the certificate.
- **The free tier is described as being for "independent developers and teams
  prototyping ideas."** Transactions are $0.30/enrollment/month if we ever need
  to be on the paid tier, which for one account is not a decision worth
  agonising over. Budget for paying it.

Bank credentials never touch our code. Teller Connect is hosted; we receive an
access token. We do not screen-scrape and we do not store a banking password —
if that ever looks like the only way to support her bank, the answer is the
file importer, not stored credentials.

## Business and personal are not the same money

A sole proprietor's accounts are mixed, always, no matter what anyone intends.
Every imported transaction therefore lands as **unreviewed** — not as a guess.

The categoriser proposes; it does not decide. A rule that says "description
contains SALONCENTRIC → Supplies" writes a *suggestion* with the rule that
produced it attached, so a wrong category is traceable to the rule that made it
rather than appearing as an unexplained fact. Nothing counts toward a tax
figure until it has been reviewed once.

This is the part that will feel like work to her, and it is the part that makes
every number downstream true. Design it to be fast — bulk-apply by merchant,
keyboard-first — rather than trying to make it disappear.

## What a service actually costs

**Period allocation, not a bill of materials.** Total product spend in a period
divided across the appointments in that period, weighted by service type: she
spends $340 on colour supplies in March and did 41 colour services, so a colour
carries about $8.30 of product.

The alternative — recording 2 oz of 9G and developer against each appointment —
is more accurate and would survive about a week. Allocation needs nothing from
her beyond categorising the purchase she was going to categorise anyway. The
schema leaves room to grow into per-service costing later if she ever wants it;
it should not be built first.

Allocation is an estimate and the UI says so. "About $8.30" is honest. "$8.27"
is not.

## The number that matters most

Not cost-per-service. **Break-even**: fixed costs (Salon Lofts rent,
insurance, phone, software, this app's own bills) divided by her average
ticket, shown as *appointments per week before you're earning*. It falls out of
the same data and it is the one figure a solo stylist can actually steer by
between clients.

## Tax

Her situation, as of 2026-09-23: **single-member LLC, Schedule C** (no S-corp
election), business in **Kettering**, residence in **Oakwood**.

### The stack

| Jurisdiction | Rate | Applies to | Checked |
|---|---|---|---|
| Federal — SE tax | 15.3% of 92.35% of net profit; Social Security portion capped at the annual wage base | Net profit | 2026-09-23 |
| Federal — income tax | Bracket rate, after ½ SE tax, QBI deduction and standard deduction | Taxable income | 2026-09-23 |
| Ohio | **Business Income Deduction: first $250,000 exempt**, flat 3% above it | Business income | 2026-09-23 |
| Kettering (work) | **2.25%** | Net profit earned there | 2026-09-23 |
| Oakwood (residence) | **2.50%**, less a **90%** credit for tax paid to another municipality | Same profit | 2026-09-23 |

**The Ohio line is probably zero.** A solo salon is an order of magnitude below
$250,000 of business income. This is the opposite of what she will expect, and
worth saying plainly on the screen rather than showing a $0 she assumes is a
bug.

**The Oakwood line is not zero, and it's the one that gets missed.** The credit
is 90%, not 100%. Kettering takes 2.25%; Oakwood credits 90% of that (2.025%)
against its own 2.50%, leaving roughly **0.475%** still owed to Oakwood. On
$60,000 of profit that is about $285 — small enough to forget, large enough to
arrive as a letter.

Combined, federal plus municipal lands somewhere around **a fifth to a quarter
of every profit dollar**. That effective set-aside rate is the headline the
screen should show. Four separate form-shaped answers are how tax software
makes people feel stupid.

### Rates are data, not constants

A `tax_rates` table with jurisdiction, rate, effective dates, **source URL and
date checked**. Three reasons, all of them things that already happened:

- **Oakwood moved off RITA to City Tax on 1 January 2026.** Every guide written
  before then sends her to the wrong agency. Administration changes, not just
  rates.
- Some figures above came from secondary sources because the primary page
  returned 403 or 404. The app should be able to show its working — "Kettering
  2.25%, ketteringoh.org, checked 23 Sep 2026" — so a stale rate is visible
  rather than silently wrong.
- Federal constants (wage base, standard deduction, bracket thresholds) change
  every single year. A constant in a `.ts` file is a bug with a delay fuse.

### Quarterly payments

Federal 1040-ES is due 15 Apr / 15 Jun / 15 Sep / 15 Jan. Safe harbour is the
thing to build toward: paying 100% of last year's tax (110% above an income
threshold) avoids the underpayment penalty regardless of what this year does.
She has no prior year as a salon, so year one is estimate-driven and the app
should be honest that it's estimating.

Kettering and Oakwood both have their own estimated-payment requirements and
thresholds. **Not yet verified** — Kettering's business page doesn't state
them, and the contact number is (937) 296-2502. Oakwood's is (937) 298-0531.
Confirm both before the app tells her a due date.

## Open questions

1. **Which bank?** Teller's coverage is good but not universal, and this
   decides whether the connection path or the file importer is the real one.
2. **Is the salon account separate from personal?** Changes how aggressive the
   business/personal review step needs to be.
3. **Kettering and Oakwood estimated-payment thresholds and due dates** — two
   phone calls, above.
4. **Does she have other income** (W-2, a spouse's, prior employment this year)?
   Federal brackets and the QBI limit depend on total taxable income, so an
   estimate that assumes the salon is her only income will be wrong if it isn't.
5. **Ohio sales tax on retail.** Services aren't taxed in Ohio; retail product
   sales are. Doesn't bite until backlog #18 ships retail, but the two features
   share a schema and it's cheaper to know now.

## Build order

1. **Schema + ingestion** — accounts, transactions, categories, rules, tax
   rates. Source-agnostic, with the file importer first because it needs no
   vendor.
2. **Review screen** — business/personal, category, bulk-by-merchant.
3. **Where the money went** — categorised spend by month.
4. **Break-even** — fixed costs against average ticket.
5. **Set-aside rate + quarterly estimates** — the four jurisdictions, one number.
6. **Margin per service** — allocated product cost against revenue by service.
7. **Teller connection** — replaces manual import, changes nothing above it.
8. **Schedule C export** — the year-end summary with transactions behind each line.
