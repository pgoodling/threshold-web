# Threshold — Studio by Evelyn

The public site **and** the booking / client-management app for Threshold Salon
in Kettering, Ohio. One Next.js app on Vercel, backed by Supabase.

- **Public:** homepage, `/book`, `/products`, `/appointment/[id]`, `/hair-notes/[id]`,
  plus `/messaging`, `/privacy`, `/terms` (carrier compliance).
- **Evelyn's studio:** `/studio` — password-protected dashboard. Eight menu
  items (`NAV` in `app/studio/page.tsx`): Overview (+ To-do), Calendar
  (+ Upcoming, Time off), Clients (+ Outreach), Messages (Inbox, To send),
  Inventory (Stock, Activity), **Money**, Reports, Settings (+ Hours, Services).

**Inventory** has been its own menu item since 30 Sep 2026 (supplier orders,
shelf and back bar, Sell, stock count). **Money** is four sub-tabs,
deep-linkable as `#money/bank` and so on: Overview, Bank (statement import,
review queue), Taxes (what to set aside) and Services (earnings per hour,
less product cost). See `docs/MONEY.md` — especially before changing a tax
rate or a category kind.

## Running it

```bash
npm install
npm run dev     # http://localhost:3000
```

`/studio` needs Evelyn's login, so most of the app can't be exercised locally
without it. `.env.local` also has no `SUPABASE_SERVICE_ROLE_KEY`, which means
**no API route that uses the admin client works locally** — they all return
`503 Server not configured`.

The way round both is the test rig — a local copy of the database and app
with a seeded salon and its own login. `npm run test:all` runs everything;
see `docs/TESTING.md`. Run it before deploying.

## Deploying

Vercel deploys `threshold.salon` on every push to `main`. **Not** via GitHub
Actions: the workflow in `.github/workflows/deploy.yml` is a retired GitHub
Pages build, kept for reference and wired to `workflow_dispatch` only.

You can also deploy straight from your machine:

```bash
npx vercel --prod --yes
```

This uploads local files and builds on Vercel, so it needs no push. The
consequence worth remembering: **production can get ahead of `main`.** Push
after deploying this way.

Environment variables live in the Vercel dashboard; `.env.example` documents
every one and why it exists. Two are load-bearing in non-obvious ways:

- `SALON_OWNER_PHONE` — not optional. The salon number is virtual, so this is
  what an incoming call actually rings. Unset it and every caller goes to
  voicemail with nothing surfaced to anyone.
- `SMS_AUTOMATION_ENABLED` — an operator kill switch for all automated texting.
  Evelyn has her own switch in Settings; **both** must be on.

## Database

Supabase project `threshold-salon` (ref `jlfzwqkybmlldmchjqrk`).

**Migrations are applied one file at a time**, in order, from
`supabase/migrations/` (latest: `0049_day_hours.sql`; two files share the
number 0032), with the Supabase CLI:

```bash
npx supabase db query --linked --project-ref jlfzwqkybmlldmchjqrk -f supabase/migrations/<file>.sql
```

Pasting into the Supabase SQL editor does the same thing. There is no
migration runner and no table recording what ran — so there is a script that
asks the database instead:

```bash
bash scripts/check-migrations.sh
```

It probes the live schema with the public anon key (no secret needed, reads no
data) and reports which migrations are applied. It can only see *structure*;
migrations that only change cron jobs, policies or functions are listed
separately with the SQL that proves they ran. A new migration needs one line
added to its list before it can see it (current through 0050).

> **Trap:** the Supabase MCP connection in this project's sessions points at a
> different project (Paul's golf app), not the salon. Never run salon
> migrations through it.

Deploys and SQL move independently, so **a deploy can land before its
migration**. The house pattern is a resilient write — select `*` rather than
naming a new column, and retry an insert without it. See `insertStudioAppointment`
and `lib/settings.ts`.

## Scheduled jobs

Two, in two different places, for a reason:

| Job | Where | When |
|---|---|---|
| Day-before reminder texts to clients | Vercel Cron (`vercel.json`) | 13:00 UTC = 9am Eastern |
| Evelyn's schedule email | pg_cron (`threshold-digest`) | hourly |

The digest runs hourly and the route decides whether this is the hour Evelyn
chose in Settings. That indirection is the whole point: a Vercel schedule is
fixed at deploy, so a time picker over it would be a control that does nothing.
It also makes daylight saving a non-issue.

Vercel Hobby allows 100 cron jobs, each **once per day** at hour precision
(±59 min) — not one run per day across the account, which an old comment here
claimed.

## Texting

Automated SMS is live; the A2P 10DLC campaign cleared on 9 Sep 2026 after four
rejection cycles. Message wording lives in `lib/smsTemplates.ts`, and every
send goes through `plainText()` in `lib/sms.ts` to stay in the GSM-7 alphabet.
`docs/A2P-CAMPAIGN.md` holds the submission, the history, and the reasoning —
read it before changing any message template, because carriers compare traffic
against what was registered.

## Docs

| File | What it is |
|---|---|
| `docs/A2P-CAMPAIGN.md` | Current. The carrier submission and its history. |
| `docs/BACKLOG.md` | What's built, what's next, what's still needed from Paul. |
| `docs/TESTING.md` | Current. The three test layers, the local rig, and what isn't covered. |
| `docs/MONEY.md` | Current. Bank feed, cost allocation and the four tax jurisdictions. Read before touching a rate — they carry a source and a checked-on date for a reason. |
| `docs/BUILD-PLAN.md` | Historical. The July 2026 decision record for building this instead of buying GlossGenius. Kept as rationale, not as a plan to follow. |
| `AGENTS.md` | Read this first if you're an agent. |
