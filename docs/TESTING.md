# Testing

Three layers, each one command. Built 2026-10-07 after a month of features
checked by hand ("build some tests like we did on dogleg … to make sure it's
all functioning the way it is supposed to").

| Command | What it checks | Needs |
|---|---|---|
| `npm test` | **The arithmetic** — sales tax, earnings per hour, Overview's periods and totals, the tax estimate, text segments and wording, bottle sizes, product names, where a service fits in a day. 66 tests, under a second. | Nothing |
| `npm run test:db` | **The database's own rules** — what a sale writes, shelf and bar, wrong-signed stock refused, the overlap rules (incl. checking in under an overlap), online booking refused on blocked/taken time, anonymous visitors seeing nothing. 15 tests. | The rig |
| `npm run walks` | **The studio clicked through like a person**, on a phone-sized screen: Inventory, pricing, Sell, check-out, Taxes, Overview, Services, Bank, Calendar. Screens checked against answers worked out by hand; the database checked behind them. A photo of every step. | The rig, installed Chrome |
| `npm run test:all` | All three. **Run before deploying.** | |

The walks write `e2e-out/walks-<time>/report.html` (gitignored): every step
with its checks (expected vs what the screen said), its photo, a **Usability**
section, and taps per task. Publish it as an Artifact to read on a phone.

## The rig

A throwaway copy of the database in Docker on this computer, built from the
same 49 migrations as production, plus a copy of the app pointed at it.

```
npm run rig:start      # first time, or after a reboot — then leave it running
npm run rig:reset      # rebuild the database from the migrations (after a new one)
npm run rig:stop
```

- Ports **553xx**, project `threshold-rig`, so it runs beside dogleg's rig (543xx).
- The app copy runs on **http://127.0.0.1:3200** with its own build folder
  (`.next-rig`), so it doesn't disturb a normal `npm run dev`. Playwright
  starts it (`tests/rig/app.mjs`).
- **It can't reach Evelyn's data.** Every piece checks for 127.0.0.1 before
  doing anything: `tests/rig/app.mjs`, `tests/db/rig.ts`, `tests/e2e/rig.ts`.
- **It can't text, email or charge anyone.** `.env.local` holds the real
  Twilio, Stripe and Resend keys; the launcher blanks every key it finds there
  and every key the code reads, so those features read as not configured.
- The two migrations both numbered 0032 are copied as 00321 / 00322
  (`tests/rig/prepare-migrations.mjs`) — the CLI refuses duplicate numbers;
  the real files are left alone.
- The walks sign in as `walks@threshold.test` with a fresh random password
  each run (nothing stored), and re-seed a small salon first
  (`tests/e2e/rig.ts` — the hand-worked answers are in `EXPECT`).

## Writing tests

- **Work the expected number out by hand, in a comment above the assert.**
  A test that copies the code's own output proves nothing.
- **Then break the code once and watch the test fail.** On day one the
  sales-tax tests passed with the rounding deliberately broken — none had two
  of the same bottle on one line, the only case where per-unit and per-line
  rounding differ. That test exists now.
- Logic lives in `lib/` (not inside a screen) so tests can import it:
  `serviceEarnings`, `overview`, `dayLayout`, `retailMath`, `stockSize`,
  `smsSegments`. Screens call the same functions.
- Database tests run in a transaction that's rolled back, and should only
  count their own rows — the walks leave data in the rig.
- A walk step = do it, check the screen, check the database. Use
  `open("hash")` to start from a fresh load; going to the same address with
  only the `#` changed keeps whatever panel was open.

## Usability findings

`tests/e2e/ux.ts` looks at every screen a walk visits: tap targets under 32
points (32–44 only counted), text under 12px, anything wider than the
screen, very long pages, and taps per task. Recommendations, not failures.

First run (2026-10-07) found:
- **Filter and choice chips are 30 points tall** — All / On back bar / For
  sale; Week / Month / Quarter / Year; Card / Cash / Venmo / Zelle / Other.
- **The ✕ close button is 13×24.** The ✕ to drop a line from a sale is 23×23;
  the day view's ‹ › are 23–26.
- **Text links are 16 points tall** — Remove from inventory, Edit payment,
  Undo check-out, Book again, Copy.
- **10–11px text** — the shelf/bar labels, the calendar's hours, the chart's
  labels.
- **A product added by hand has no brand**, so it lands under "Other" with
  its full name rather than under its range.
- **Fixed 2026-10-07:** every item above except the brand was resized —
  close buttons, choice chips, filter tabs, the calendar toolbar, the day
  view's arrows, text links, Undo/Cancel/Change/Copy — to a 44-point tap
  area, and the flagged 10–11px text to 12px. Add stock gained a Brand box
  for new products. A re-run found nothing under 32 points and no small text.
  The calendar's month grid keeps its 9–11px text on purpose: each day is a
  small box listing several appointments.
- Found by the walks and fixed the same day: a product's history sorted by
  when it was typed rather than the date it happened; a removed product
  stayed open and the first tap in Removed closed it.

## Not covered

- Anything behind Twilio, Stripe or Resend (blanked on purpose), the PDF
  order import, and the Relay CSV import — they need fixture files.
- The public booking pages, cron jobs, and the iPad two-pane layout.
- Real devices. Playwright's phone is Chrome at 390×844, not Safari on an iPhone.
