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

> **Superseded 2026-10-08.** Allocation was tried and withdrawn (an order
> isn't used up the period it arrives, and colour never touches a blowout).
> Product cost is now measured per service from Evelyn's own amounts and
> learned from finished back-bar bottles — see
> [Product cost per service](#product-cost-per-service-2026-10-08). The
> reasoning below is kept as the record of how it got there.

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
Cosmetology services are explicitly exempt — cuts, colour and styling are not
taxable — but **product sales are**. Her rate is **7.5%** (5.75% Ohio + 1.75%
Montgomery County; Kettering adds nothing). One bottle sold triggers it.

**She has sold product and will keep selling it, and has no licence** (Paul,
2026-09-25). So the obligation already exists and every sale until she
registers is one she owes tax on without having collected it.

**Getting it — online, issued immediately.** Ohio Business Gateway
(`business.gateway.ohio.gov`) → **County Vendor's License Registration**. The
paper route is form ST-1 to the Montgomery County Auditor, 451 W Third Street,
Dayton OH 45422, 937-225-4314.

- **The fee is $50.** It rose from $25 on 9 April 2025, and $25 is what
  half the internet still says — including, twice, this file's first draft.
- She wants a **County** licence, not a **Transient** one. County is for a
  fixed place of business, which the Salon Lofts suite is; transient is for
  markets and shows.
- Worth asking at registration: Ohio lets low-volume vendors file
  **semi-annually** rather than monthly. Two chores a year instead of twelve.

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

### Why retail-at-checkout was not built first

> **Since resolved.** She got her vendor's licence on 30 Sep 2026 and retail
> at check-out was built the same day (migration `0047`; see
> [Not built](#not-built), item 1). The rate is 7.5%, stored in `tax_rates`
> as `ohio_sales_tax` (`0045`). Kept for the reasoning.

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

> **Partly built 2026-10-08, in a different shape.** Money → Services draws a
> **fixed-cost line** per hour rather than appointments per week: costs of kind
> `fixed` over the last 28 days the statements reach, ÷ her hands hours in
> that window (`fixedCostLine` in `lib/serviceEarnings.ts`). It's a dashed
> line on each service's bar, and a service's page says what's left per hour
> after it. About $12 an hour on her data. There is still no "appointments
> per week before you're earning" figure.

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

## If a second stylist ever used this

Raised 2026-09-25. Not being built — recorded because the cost of retrofitting
it grows with every feature, and knowing which assumptions are load-bearing is
most of the work.

Everything here is built for one salon. Some of that is easy to undo and some
is not, and the difference is worth knowing before anyone promises otherwise.

**The genuinely hard one: RLS.** Every money table uses
`for all to authenticated using (true) with check (true)` — any signed-in user
sees everything. That is correct for one user and catastrophic for two, and it
is not a column away from being fixed: every policy, every query and every
route would need a tenant to scope by. This is the piece that decides whether
multi-tenant is a project or a rewrite, and today it is the latter.

**Easy, mostly mechanical:**
- `salon_settings` admits exactly one row by construction
  (`id boolean primary key check (id)`). It becomes a row per salon.
- `opened_on`, the monthly target, quiet hours, digest hour — all hers.
- Default supplier strings, and the salon's own phone and address.

**Awkward, because they are judgements rather than data:**
- **`tax_rates` has no tenant.** Kettering and Oakwood are seeded as *the*
  municipalities, not as *her* municipalities. A stylist in Columbus needs
  different rows, a different resident-credit rule, possibly a different
  state entirely — and the Ohio Business Income Deduction that makes her state
  line zero is not federal. The table's shape survives; its contents do not.
- **The sales tax rate is Montgomery County's.** Ohio alone has 88 county
  rates.
- **The colour-cost model assumes one person's appointment book.** Two
  stylists sharing a stock room breaks the "this order covered these
  appointments" premise entirely.

**The honest summary:** the schema would mostly survive, the RLS would not, and
the tax content would have to become per-tenant configuration with a way to
populate it. Worth doing deliberately if it ever matters, and worth not
pretending is a weekend.

## Open questions

1. ~~**Which bank?**~~ **Answered 2026-09-23: Relay.** See above — Teller is
   out, CSV import is the path, and Plaid was dropped.
2. **Is the salon account separate from personal?** Changes how aggressive the
   business/personal review step needs to be. Relay's whole pitch is multiple
   named accounts for one business, so she may already have the split — which
   would make the review step much lighter than assumed.
3. **Kettering and Oakwood estimated-payment thresholds and due dates** — two
   phone calls, above.
4. **Does she have other income** (W-2, a spouse's, prior employment this year)?
   Federal brackets and the QBI limit depend on total taxable income, so an
   estimate that assumes the salon is her only income will be wrong if it isn't.
5. ~~**Ohio sales tax on retail.**~~ **Answered and built 2026-09-30:** 7.5%
   on product lines only, collected at check-out or Sell (`0045`, `0047`).

## Where it got to

Updated 2026-10-08. **Inventory** is its own studio item (tabs **Stock** and
**Activity**), because she uses it daily and Money monthly. **Money** is
**Overview** (revenue from check-outs and product sales against sorted
business expenses, by week / month / quarter / year, each side tappable down
to categories and transactions; 'capital' categories shown apart as Setting
up), **Bank** (upload, then month by month, tap a row to change its category;
what's owed back to Evelyn), **Taxes** (set-aside in dollars, next payment,
one line per place, sales tax collected; the working behind a toggle; the
year-end summary) and **Services** (each service ranked by what it earns per
hour of her hands, after product and card fees, against the fixed-cost line;
replaced Costs on 2026-09-30; product counted from 2026-10-08). Its choices
(tabs, periods, filters) are segmented buttons since "direction B" on
2026-10-08. Old `#money/inventory`
and `#money/activity` links redirect to Inventory, and `#money/costs` to
Services.

### Built and live

**Money in.** Relay CSV import (`MoneyStatement`) with the balance-chain proof,
a review queue (`MoneyReview`) where the only question is business or personal
and "always, for X" writes a rule, and manual entry (`MoneyManual`) for
purchases the bank never saw — into `bank_transactions` against an account
called "Paid outside Relay", not a table of their own. Since 2026-10-08 it's a
batch form: a line per receipt, a running total, all recorded together, and a
category dropdown grouped furniture and equipment / product / other.

**Inventory** — migrations `0042`–`0043`, `0045`, `0046`.

*Redesigned 2026-09-30 with Evelyn.* Every change to stock happens on
Inventory → Stock (`MoneyInventory`), and each has one way in:

| She does | Shelf | Bar | Kind |
|---|---|---|---|
| Add stock — order PDF or by hand (`MoneyAddStock`, cost required) | +n | | `received` |
| Put one on bar | −1 | +1 | `used` — **the cost is taken here** |
| Finished one — empty, in the bin | | −1 | `finished` — not a cost |
| Sells one — at check-out or with Sell (`MoneySell`) | −1 | | `sold` |
| Count comes up short | −n | | `missing` — not a cost |

Two numbers per product because she works in two places: sealed on the shelf,
open on the back bar. The bar isn't stored; it's `used − finished` (`0046`), so every
`used` row from before `0046` landed on the bar and she clears the empty ones
with *Finished one*. A count shortfall used to be booked as `used`; it's now
`missing`, because theft and unrecorded sales look identical to a count and
shouldn't inflate product cost. There's no −/+ on a product on purpose: a −
would look like "opened one" without being recorded as use.

Names are split into range and product (`lib/productLine.ts`) so a phone shows
"Long & Strong" once as a heading and "Super Serum" in full on the row.
**Activity** (`MoneyActivity`, formerly Today) is read-only, with Today / Week /
Month. Month is the calendar month and leads with totals — to the bar,
finished, orders in, missing, and the dollar value of product put to use. An
order is one line, a count is one line, everything else a line per product.

- Supplier order PDFs parse into products and stock (`MoneyInvoice`,
  `lib/supplierInvoice.ts`), refusing any invoice whose lines don't sum to its
  own subtotal, and spreading an intro kit's price across the contents the
  order itemises at $0.00.
- Kits the order *doesn't* itemise get broken open by hand
  (`MoneyKitBreakout`) — paste the contents, cost splits across them, matched
  against existing products so nothing becomes a near-duplicate.
- Stock count (`MoneyCount`) counts the shelf only, shows no expected numbers,
  and afterwards lists only what was missing or extra.
- Gone: the old catalogue's "Needs you" default view and bulk actions, and the
  six back-bar tiles on Today. The catalogue opening on a filter is likely why
  she "couldn't see everything"; Inventory now opens on All.

**Tax** — migration `0044`, `lib/tax.ts`, `MoneyTax`.
One headline: put by 25¢ of every profit dollar, held apart from the honest
estimate so the cushion is visible. Compared against what she has actually
moved to savings. Penalties and the ORC 718.08 $200 rule, so it says which
city needs prepaying and which waits for filing.

**Overview** — `lib/overview.ts`, `MoneyOverview`. Revenue against expenses by
week / month / quarter / year, with drill-down; capital shown apart as
Setting up.

**Services** — `lib/serviceEarnings.ts`, `lib/productCost.ts`,
`MoneyServices`. Earnings per hour of her hands after card fees and product
(`handRate(row, productPerVisit)`), against the fixed-cost line
(`fixedCostLine`, 2026-10-08). The old Costs tab (`MoneyColourCost`) is
gone; `lib/colourCost.ts` is still in the repo but nothing imports it.

### Not built

1. ~~**Retail at check-out**~~ **Built 2026-09-30** — migration `0047`. Products
   go on check-out as separate lines under the service, 7.5% on the products
   only, tax on top. **Sell** on Inventory does the same without an
   appointment (client optional), and "Something else" rings up a one-off item
   that isn't stock. Tax is worked out per unit and rounded. Every sale is a `retail_sales` row with its lines, saved
   by `record_retail_sale()` in one transaction — at check-out, together with
   the appointment. Sales tax for the Ohio return is `sum(tax_cents)` there.
   She got her vendor's licence on 30 Sep 2026. The number is deliberately
   not stored: nothing in the app uses it, and a "no licence on file" note
   that briefly existed was removed the same day. Where it *is* needed is the
   Ohio blanket exemption certificate for Premier and SalonCentric, so the
   retail part of future orders stops being taxed twice.
2. **Break-even** — fixed costs derived from categorised transactions rather
   than stored, so a rent rise carries itself through. Needs her average
   ticket, which needs check-out data. *Partly built 2026-10-08:* the
   fixed-cost line on Services (fixed costs per hour of her hands; see
   [The number that matters most](#the-number-that-matters-most)). No
   visits-a-week figure.
3. ~~**Where the money went**~~ **Built 2026-09-30** as Money → Overview.
4. ~~**Margin per service**~~ **Built 2026-09-30** as Money → Services, ranked
   by earnings per hour of her hands — **after product since 2026-10-08**. A
   first version spread every product order since opening across every visit
   by length; Paul pointed out it's the wrong model (an order isn't used up the
   month it arrives, and colour never touches a blowout) and it was withdrawn
   the same day. Its replacement — a per-service list of what goes on the
   head, priced from each bottle's cost and size — is
   [Product cost per service](#product-cost-per-service-2026-10-08). Every
   service shows the visits behind it and the sum written out, so the
   arithmetic can be checked by hand.
5. ~~**Schedule C export**~~ **Built 2026-10-08** — the year-end summary with
   transactions behind each line, and a CSV. See
   [Year-end summary](#year-end-summary-2026-10-08).

### Abandoned

**Plaid.** Approved, costed and then dropped — see the decision note above.
She uploads the CSV monthly from her phone. Nothing in the ingestion path
assumes it, so this could be revived without touching anything above it.

## Product cost per service (2026-10-08)

`lib/productCost.ts`, shown on Money → Services with the working.

- **Measured** — colour and lightener, from Evelyn's own amounts:
  full highlight / balayage / grey blending 60 g Blonde IQ + 120 ml Redken
  developer; partial half; mini foil a quarter; toner 30 ml Maria Nila gloss +
  60 ml liquid activator on every lightening service (same amount on partials
  and minis). All-over colour 50 g Tinta + 75 ml Tinta developer, root retouch
  half; toner there is "if toned", shown but not counted. Priced from the
  inventory, so new prices flow through. Grams are counted as ml for liquids.
- **Learned** — bowl, styling and masks vary, so: finished back-bar bottles'
  cost ÷ paid visits between the first going on the bar and the last being
  finished. Masks only spread over treatment services; consultations use
  nothing. Only bottles put on the bar from 1 Oct count (`LEARN_FROM`): the
  25 and 29 Sep entries were the back bar being set up with bottles already in
  use, and counting them gave a misleading $6.67 a visit.
- **Foils** — 65 pop-up foils on a full highlight (partial and mini take the
  same share as their lightener), priced per sheet from the 500-count box.
  The roll is cut to length, so it isn't counted.
- **Gloves and caps** — one pair of gloves (2 of the 100-piece box) on every
  colour service; a plastic cap on signature colours only, at $9.39 for 100
  until caps are in the inventory (the inventory's price wins once they are).
- **Extensions** — per row: 4 arm's lengths of string (an arm taken as 70 cm;
  $8.99 a 1,700 m spool) and 15 beads ($14.99 for 2,500), about 10.5¢ a row.
  Extensions are priced by the row at $115, so a visit's rows = paid ÷ $115.
  String and beads use Paul's prices until they're in the inventory.
- The four Keune liter back-bar products were corrected from $10.30 to $34
  (products and their movements) on 2026-10-08.
- The Style Intro package ($585) was entered the same day as 21 products × 3,
  its price spread by Keune's US prices.

## Year-end summary (2026-10-08)

Money → Taxes → **Year-end summary**: the year on Schedule C lines for her
tax preparer (`lib/yearEnd.ts`, `MoneyYearEnd.tsx`).

- Same rows as the Taxes estimate: business bank rows posted in the year,
  grouped by each category's `schedule_c_line` (0036). Line names as printed
  on the form; 24b takes half of what was spent.
- Line 1 is card deposits plus cash/other taken at check-out (counted from
  the check-outs, `lib/takings.ts` — see below), **less sales tax collected**
  (`retail_sales.tax_cents`) — it arrives in card deposits but isn't income.
  Taxes now subtracts it too, so the estimate and the summary agree.
- Setting-up purchases (capital) are listed item by item and counted in full
  in net profit, as Taxes assumes; the preparer chooses the line.
- For the preparer: retail stock on the shelf at cost (today's count — take
  it on 31 Dec), card and other takings recorded at check-out against what
  reached the bank (card deposits run higher than check-outs by the tips,
  which are labelled as such; cash and other are shown as counted in line 1),
  rows still to sort, and owner money that isn't on the form.
- Before-opening costs get their own section in the opening year — see
  [Before opening](#before-opening-startup-costs-equipment-product-2026-10-08).
- Every line opens onto its transactions; **Download for preparer** writes
  the same as a CSV.
- First run on her data (8 Oct): $295 of cash taken at check-out had not
  been entered as income. That's why cash is now counted from the check-outs
  instead of typed in.

## Cash, tips and paying Evelyn back (2026-10-08)

- **Cash counts from check-out.** Cash (and Venmo/Zelle/other, which she
  doesn't use) taken at check-out is income straight from the check-outs
  (`lib/takings.ts`) — Taxes and the year-end summary add it to the bank's
  card deposits. Overview already read check-outs. A cash deposit into Relay
  is filed **Cash deposit (already counted)** (0050, kind owner) so it isn't
  counted twice.
- **No tip field.** Tips go through another service. Card tips still arrive
  in the Intuit deposits, so card deposits run higher than card check-outs by
  the tips; the year-end summary labels the difference as tips.
- **Owed back to Evelyn** (renamed 2026-10-08, 0051). One figure: what she
  moved into Relay from her own bank (Owner contribution — $3,300 in Aug
  2026) plus receipts she paid herself, less every transfer back to her, all
  filed **Paid back to Evelyn**. Her own money returning: not taxed, not a
  business cost. The spending it funded was already deducted from Relay's
  statements, which is why paying it back isn't another expense.
- **Reimbursements.** Costs she paid herself before Relay are entered with
  "Add something Evelyn paid for" in that section (account *Paid outside Relay*;
  the batch form in `MoneyManual`) — expenses when paid. Relay paying her back is filed **Paid back to Evelyn** (0050, renamed 0051;
  kind owner: not a second expense, not a draw). Money → Bank shows paid,
  paid back and still owed (`lib/reimburse.ts`, `MoneyReimburse.tsx`).

## Before opening: startup costs, equipment, product (2026-10-08)

Spending dated before `salon_settings.opened_on` (7 Sep 2026) — including
anything paid in 2025 — is taken out of the year it was paid and shown in the
**opening year's** summary under "Before opening", split three ways
(`lib/costGroups.ts`):

- **Furniture and equipment** (capital kinds, plus "Tools and equipment") —
  deducted as equipment, in full on the de minimis assumption Taxes already
  makes.
- **Product** (back bar, colour, retail stock) — a cost as used or sold;
  counted in full.
- **Startup costs** (everything else) — 26 U.S.C. § 195: up to $5,000 in the
  opening year, less any excess over $50,000; the rest over 180 months from
  the opening month (`startupDeduction`). Her total on 8 Oct: $350.43, all
  deductible in 2026.

Taxes now gets its profit from the same `yearEnd()` function, so the estimate
and the summary can't disagree. The purchase form's category dropdown is
grouped the same three ways and leaves out income, owner money and personal.

The § 195 split depends on the amount, not on profit. What the preparer
decides with profit in mind — equipment by de minimis, Section 179 or
depreciation; whether to elect out of the startup deduction — isn't automated.
