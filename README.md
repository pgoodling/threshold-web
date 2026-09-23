# Threshold — Studio by Evelyn

The public site **and** the booking / client-management app for Threshold Salon
in Kettering, Ohio. One Next.js app on Vercel, backed by Supabase.

- **Public:** homepage, `/book`, `/products`, `/appointment/[id]`, `/hair-notes/[id]`,
  plus `/messaging`, `/privacy`, `/terms` (carrier compliance).
- **Evelyn's studio:** `/studio` — password-protected dashboard. Overview,
  to-do, messages, calendar, appointments, clients, services, reports,
  outreach, texts, time off, settings.

## Running it

```bash
npm install
npm run dev     # http://localhost:3000
```

`/studio` needs Evelyn's login, so most of the app can't be exercised locally
without it. `.env.local` also has no `SUPABASE_SERVICE_ROLE_KEY`, which means
**no API route that uses the admin client works locally** — they all return
`503 Server not configured`. Those are only testable in production.

## Deploying

**Not** via GitHub Actions. The workflow in `.github/workflows/deploy.yml` is a
retired GitHub Pages build, kept for reference and wired to `workflow_dispatch`
only — pushing does not deploy.

```bash
npx vercel --prod --yes
```

This uploads local files and builds on Vercel, so it needs no GitHub at all.
Consequence worth remembering: **production can get ahead of `main`.** Push
after deploying.

Environment variables live in the Vercel dashboard; `.env.example` documents
every one and why it exists. Two are load-bearing in non-obvious ways:

- `SALON_OWNER_PHONE` — not optional. The salon number is virtual, so this is
  what an incoming call actually rings. Unset it and every caller goes to
  voicemail with nothing surfaced to anyone.
- `SMS_AUTOMATION_ENABLED` — an operator kill switch for all automated texting.
  Evelyn has her own switch in Settings; **both** must be on.

## Database

Supabase project `threshold-salon` (ref `jlfzwqkybmlldmchjqrk`).

**Migrations are applied by hand** in the Supabase SQL editor, in order, from
`supabase/migrations/`. There is no migration runner and no table recording
what ran — so there is a script that asks the database instead:

```bash
bash scripts/check-migrations.sh
```

It probes the live schema with the public anon key (no secret needed, reads no
data) and reports which migrations are applied. It can only see *structure*;
migrations that only change cron jobs, policies or functions are listed
separately with the SQL that proves they ran.

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
rejection cycles. `docs/A2P-CAMPAIGN.md` holds the submission, the history, and
the reasoning — read it before changing any message template, because carriers
compare traffic against what was registered.

## Docs

| File | What it is |
|---|---|
| `docs/A2P-CAMPAIGN.md` | Current. The carrier submission and its history. |
| `docs/BACKLOG.md` | What's built, what's next, what's still needed from Paul. |
| `docs/BUILD-PLAN.md` | Historical. The July 2026 decision record for building this instead of buying GlossGenius. Kept as rationale, not as a plan to follow. |
| `AGENTS.md` | Read this first if you're an agent. |
