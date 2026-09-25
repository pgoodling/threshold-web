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

**She banks with Relay** (confirmed 2026-09-23), which settles this.

**Teller is out.** Relay is not among Teller's 7,008 institutions — checked
directly against `https://api.teller.io/institutions`, which is public and
needs no auth. The earlier plan to lead with Teller is dead.

> **Trap, for whoever looks next.** Teller *does* list **Thread Bank**, which
> is Relay's partner bank, so the list appears to contain a match. It does not.
> Relay customers authenticate at `relayfi.com` and have no Thread
> online-banking credentials; picking that entry produces a login failure with
> nothing explaining why. Same trap applies to any aggregator: match on Relay,
> never on Thread.

> **DECIDED 2026-09-23, later the same day: no Plaid.** Evelyn uploads the CSV
> from her phone once a month. The section below is kept because the reasoning
> and the numbers are still the right starting point if this is ever revisited
> — but the live feed is not being built.
>
> What settled it wasn't cost, in the end. Plaid's real prices turned out to be
> $0.30/item/month for Transactions, $0.12 per Refresh call, $0.10 per Balance
> call — and the free Trial plan covered her use entirely, indefinitely. It was
> that a monthly upload is enough for questions that are inherently
> retrospective. Tax and cost-per-service don't get better answers from
> knowing about a purchase four hours sooner.
>
> The practical consequence, which the build has to honour: **the import screen
> is a phone screen.** She exports from the Relay app on her phone, so the
> upload has to work from iOS Files, and the review queue has to be usable with
> a thumb. That is not a nice-to-have — it is now the only way data gets in.

**Superseded: Plaid for the live feed, CSV import for backfill.** Both, and
neither is a fallback for the other — they cover different ground.

**Plaid, because live was the requirement** (Paul, 2026-09-23: "I want this
data live all the time"). That rules out the monthly options, which is all of
the others:

- Relay's own **Other service → "OXF transactions"** integration tile (their
  typo for OFX) emails exports **monthly**, tied to the statement cycle. Same
  for the Hubdoc/Dext tiles. Monthly is the ceiling on every push Relay offers.
- Manual download is monthly by the same constraint — Relay has no transaction
  export separate from a statement period.

Plaid supports Relay (institution `ins_117228`). Set expectations honestly:
"live" means Plaid refreshes a few times a day, not instantly — and it reports
**pending** transactions whose amounts can still change. `/transactions/sync`
gives added, modified and removed, so pending-then-settled is an update rather
than a duplicate. That is the correct handling of a problem the per-transaction
alert emails could not solve at all, and it is why `bank_transactions.pending`
exists (0037).

**Cost: none, for her.** Paul opened a Plaid account on 2026-09-23 and it
landed on the **Trial plan** — available to US/Canada teams created on or after
15 April 2026.

- **Not time-limited.** It persists indefinitely; the only constraint is a cap
  of **10 Production Items**. She needs one, maybe two with the savings
  account.
- **Transactions is bundled into it**, along with Auth, Balance, Identity and
  the rest. The product this feature depends on costs nothing at this size.
- Trial reaches most OAuth institutions without full Production approval.

**Products requested on the Production form** (2026-09-23): **Transactions**,
**Transactions Refresh** and **Balance**. Refresh is what makes "live" mean
on-demand rather than whenever Plaid last synced — but it bills per request on
paid plans, so it belongs behind a deliberate refresh action, never on page
load. Balance gives the live figure to check the app's own totals against,
carrying over the completeness check the CSV's running balance provides.

Deliberately not requested: Auth and Identity (payments and ownership
verification — the app never moves money), Assets and Income (lending),
Statements (PDFs), Enrich (redundant, Transactions already returns enriched
merchants), and Recurring Transactions — which looks aimed at break-even but
isn't needed, because categorising Salon Lofts once as a fixed cost already
tells the app that $250 lands every week.

> **Spend the Items carefully.** Removing an Item **does not give the quota
> back** — the cap counts Items ever created, not Items currently live. Ten
> connect-disconnect cycles while testing and the allowance is gone for good,
> with no way to reset it. Develop against **Sandbox**; only create a Production
> Item when connecting an account for real.

If it ever does need a paid plan, Pay-as-you-go has no minimum and no
commitment. One trap on that path: after upgrading, you keep Production access
only to products **explicitly listed on the Production request form**, so
Transactions must be named on it even though Trial bundled it for free.

Plaid publishes no per-item figure for Transactions on any tier — the pricing
page marks it "Included" across all three and shows rates only after the
production-access application. The commonly cited ~$0.30/item/month is a
community number, not a quote. Moot at this size, but worth not repeating as
fact.

**CSV import stands on its own, but not for the reason first given.** An
earlier draft of this file argued Plaid's first pull was a short window and
that August's startup spending — $3,300 of owner capital, Premier Beauty
Supply, Sherwin-Williams, HomeGoods — would be lost to a connector starting in
October. That was wrong: Plaid's Transactions product returns **24 months** of
history, so it reaches back past her opening date comfortably.

The real reasons to have it, which survive:

- **It works today.** Plaid needs a production-access review and a build. The
  importer already runs against the statements in hand, so categorisation,
  review and reporting are unblocked rather than waiting on a vendor.
- **It owes nothing to anyone.** If the connection breaks, the institution
  changes hands, or the Item quota runs out, a CSV export still works. A
  finance feature with exactly one way to get data in is a feature with a
  single point of failure.

**CSV is a better format than expected**, and better than OFX here:

- **No stable transaction id** in Relay's CSV, so `import_hash` is the path —
  the OFX `FITID` advantage is moot because OFX isn't offered in Relay's export
  dialog anyway, whatever the help docs say.
- **But every row carries a running `Balance`, and the chain links across
  statement files** — August closes at 2470.36, September's amounts sum to
  +1892.95, September closes at 4363.31, exactly. So the importer can *prove*
  it has every transaction. That was assumed to require OFX. It doesn't.

Bank credentials never touch our code, on any of these paths. We do not
screen-scrape and we do not store a banking password — if that ever looks like
the only way, the answer is the file importer, not stored credentials.

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

> **Revisit this.** A supplier invoice (2026-09-23) put real unit costs on the
> table and a bill of materials is now plausible for colour, which allocation
> was chosen to avoid:
>
> - Keune Tinta, 2 fl oz tube: **$9.35**. Tinta Developer, 1 litre: **$11.90**
>   (≈$0.35/oz). So a single-process colour is roughly **$10 of product**.
> - Keune Tinta SKUs *are* shade codes — `26093` is Tinta 9.3, Very Light
>   Golden Blonde — and `clients.hair_formula` already stores level-and-tone
>   from the regrowth work. Appointment → formula → SKU → actual cost, with
>   both ends already built.
>
> The objection to a BoM was that it needs data she'd have to maintain. That
> objection weakens when the formula is already on the client card and the
> price is already on an invoice. It does not vanish — quantities still vary
> per head — but this is worth costing properly rather than dismissing.
>
> Also: **per-merchant rules can't split a mixed order.** SalonCentric supplies
> bleach, developer, foils *and* tools; a bank row saying `SALONCENTRIC $88.12`
> cannot be divided across categories. Only line items can. So invoice
> ingestion isn't a refinement on top of the bank feed — it's the only route to
> an accurate cost side.
>
> Suppliers, per Paul (2026-09-23): **Premier Beauty Supply** — colour,
> developer, shampoo, conditioner. **SalonCentric** — bleach, developer, foils,
> some tools.

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

## Purchases the bank feed will never show

Confirmed 2026-09-23 by a supplier invoice: order #891488, Keune and maria
nila, **$2,043.38**, dated 24 August, paid "CardOnFile". It appears nowhere in
either Relay statement — her single largest purchase, entirely invisible, and
more than the **$1,801.40** of pre-opening spend the statements *do* show. Her
real startup costs are more than double what the bank feed implies, which
matters for the §195 figure.

Paul reports several more like it, records not yet to hand. Two possible
causes, needing different fixes:

- **Pre-Relay.** A one-time backfill with an end.
- **A card that isn't in Relay.** A hole that reopens every month.

Unresolved, and worth resolving: the Relay account was already live on 24
August (the statement opens at $0.00 on 5 August, and Premier Beauty Supply was
paid from it on the 11th), so this order falls *inside* the Relay window. Either
it was ordered before the supplier's "Received" date, or another card paid it.

**Where they go:** `bank_transactions`, against an account named "Paid outside
Relay" with `source='manual'` — not a table of their own. One pipeline, one
review queue, one Schedule C rollup. A parallel table would need its own copy
of categories, allocation and reporting, and the first report to forget it
existed would be quietly wrong.

Typing a purchase in *is* the review, so manual entries land reviewed and
business. Nobody hand-enters an expense while unsure whether it was one.

## Sales tax, and the licence nobody has yet

Found 2026-09-25, while scoping retail-at-checkout. Not built on, not resolved
— written down because it is a live obligation rather than a design question.

**Ohio requires a vendor's licence for any retail sale of tangible goods.**
$25, issued by the County Fiscal Officer. Cosmetology services are explicitly
exempt — cuts, colour and styling are not taxable — but **product sales are**,
at 6.5%–8% depending on county. One bottle sold triggers it. Paul confirmed she
does not have one.

If she has sold retail since opening on 7 September, the obligation predates
anyone noticing.

### The back bar / retail split is a tax treatment, not just a label

This is the part that surprised:

- **Back bar** — dye, developer, shampoo used on clients — is consumed
  delivering a service, not resold. Sales tax is correctly paid **when she
  buys it**. Nothing to change.
- **Retail** — bottles she sells — is bought **for resale**, so it can be
  purchased tax-exempt with an Ohio blanket exemption certificate, and tax is
  collected at the till instead.

Her Premier invoices charge tax on everything: $150.03 on order #891488,
$16.77 on #888385. So she is paying sales tax on stock she intends to resell
and would charge tax on it again at the point of sale. The same money, taxed
twice.

**The app already holds the split.** `products.sells_retail` and
`products.used_at_backbar` — the checkboxes she ticks in the catalogue — are
exactly the distinction that decides which treatment applies to a line on an
invoice. Nothing new needs modelling to answer "how much of this order should
have been bought exempt".

### Why retail-at-checkout is not being built yet

A checkout that takes $26 for a bottle and adds no sales tax teaches the wrong
habit every time it is used, and creates a liability that compounds quietly.
The sequence has to be: licence first, then the feature.

Once it exists, three things follow, in this order:
1. Sales tax collected per retail sale, at Montgomery County's rate — **which
   needs confirming**; the invoices imply roughly 7.5–8% but that includes
   shipping and has not been verified.
2. Retail revenue tracked **apart from service revenue**. Folding a $26 bottle
   into an appointment's `paid_cents` alongside a $145 highlight is simpler and
   wrong: sales tax applies to one and not the other, cost of goods applies to
   one and supplies to the other, and average ticket and margin-per-service
   both quietly inflate.
3. A resale exemption certificate on file with Premier and SalonCentric, so
   the retail portion of future orders stops being taxed twice.

None of this is advice, and none of it has been checked with her accountant.

## The number that matters most

Not cost-per-service. **Break-even**: fixed costs (Salon Lofts rent,
insurance, phone, software, this app's own bills) divided by her average
ticket, shown as *appointments per week before you're earning*. It falls out of
the same data and it is the one figure a solo stylist can actually steer by
between clients.

**Salon Lofts is $250 a week** — confirmed as rent (Paul, 2026-09-23), not
repayment of supplier orders, which the "RECEIVABLE" label on the statement had
left genuinely ambiguous. That's **$13,000 a year**, and it is the numerator.
Weekly is also the natural unit for the answer, so nothing needs converting in
either direction.

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

1. ~~**Which bank?**~~ **Answered 2026-09-23: Relay.** See above — Teller is
   out, OFX import is the path, Plaid is the later upgrade.
2. **Is the salon account separate from personal?** Changes how aggressive the
   business/personal review step needs to be. Relay's whole pitch is multiple
   named accounts for one business, so she may already have the split — which
   would make the review step much lighter than assumed.
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
   rates. ✅ `0036_money.sql` (applied 2026-09-23), corrected by
   `0037_money_real_data.sql` after reading two real statements. Next is the
   **Relay CSV parser**, which unblocks everything downstream while Plaid
   access is pending.
2. **Review screen** — business/personal, category, bulk-by-merchant.
3. **Where the money went** — categorised spend by month.
4. **Break-even** — fixed costs against average ticket.
5. **Set-aside rate + quarterly estimates** — the four jurisdictions, one number.
6. **Margin per service** — allocated product cost against revenue by service.
7. **Plaid live sync** — `/transactions/sync` plus the webhook, replacing the
   manual step and changing nothing above it. Start the production-access
   application early; it gates nothing else, but it takes days.
8. **Schedule C export** — the year-end summary with transactions behind each line.
