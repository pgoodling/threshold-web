# Threshold — Product Backlog

_Living list of what's built, what's next, and what we need to build it. Updated 2026-09-23._

Related: [BUILD-PLAN.md](BUILD-PLAN.md) (the July decision record) and
[A2P-CAMPAIGN.md](A2P-CAMPAIGN.md) (carrier submission — read before touching a
message template).

**The salon opened 7 September 2026.** Sections further down this file are dated
session notes and are kept as history; where they disagree with this top
section, this section is right.

---

## ✅ Shipped (live on threshold.salon)

**Public**
- Online booking: service → month calendar → time → confirm. No double-booking;
  availability driven by her hours and time off.
- Confirmation by email **and** text; day-before reminder texts.
- `/appointment/[id]` — details, hair-notes form, self-service cancel inside the
  window the client was quoted.
- `/products` — the brands she uses and why (Keune, Maria Nila).
- `/messaging`, `/privacy`, `/terms` — carrier compliance.

**Studio**
- Overview, to-do, messages, calendar (month/week/day, drag to move), appointments,
  clients CRM, services, reports, outreach, texts, time off, **settings**.
- Calendar shows her time off, and warns when she blocks over a booked client.
- "Booked while you were away" strip; short-notice booking alert texted to her.
- Booking forms say whether a time is free, taken, blocked or outside her hours
  *before* she books — judged against `appointment_busy`, so a cut that fits in a
  colour client's processing gap reads as free.
- **Settings**: her morning email (on/off, hour, include takings), booking alert
  window, minimum booking notice, cancellation window, how far ahead clients can
  book, automated-text switches, quiet hours, reminder lookahead, monthly target.

**Behind it**
- Stripe live; card on file, deposits, no-show fees.
- Twilio: two-way texting, voicemail, missed calls, click-to-call. A2P approved
  9 Sep 2026.
- Her schedule emailed each morning at the hour she picks — the whole day in the
  body, phone numbers included, so it works when the site doesn't.
- **Email is live (23 Sep 2026).** Resend verified on `threshold.salon`;
  `RESEND_API_KEY` + `EMAIL_FROM` set in Vercel. Until this afternoon
  `emailConfigured()` was false, so *nothing* the app ever tried to email had
  sent — not the digest, not a single booking confirmation since she opened.
  - Resend now verifies with **DKIM TXT + two SPF CNAMEs** (`send`, `rsend`) and
    **no MX record**, which is what made this safe on Namecheap: their own docs
    still describe the older MX pattern, and adding an MX there means switching
    Mail Settings to Custom MX, which would have killed the free forwarding that
    `evelyn@threshold.salon` depends on. Keep **Enable Receiving off** in Resend
    — turning it on reintroduces the MX and the collision.
  - Consequence: the Cloudflare DNS migration is still optional, not forced.
- `scripts/check-migrations.sh` — asks the database which migrations actually ran.

---

## 🎯 Tier 1 — target before September launch

| # | Feature | What it does | What we need from you |
|---|---|---|---|
| 1 | ~~**Confirmation + reminder emails**~~ ✅ **SHIPPED** | Email via Resend, plus text confirmations and day-before reminders via Twilio | — |
| 2 | ~~**Real contact info**~~ ✅ **SHIPPED** | (937) 936-2138 and info@threshold.salon, live on the site | — |
| 3 | ~~**Booking rules**~~ ✅ **SHIPPED** | Minimum notice (default 2h), max advance (default 12 weeks), cancellation window — all editable by Evelyn in Settings | — |
| 4 | ~~**Cancellation policy**~~ ✅ **SHIPPED** | "Reserving your time" note at booking: 24h notice; late cancels / no-shows may be charged up to full service price (Evelyn's discretion) | — |
| 5 | ~~**Client & service metrics**~~ ✅ **SHIPPED** | Reports tab: revenue, completed, avg ticket, no-show rate; by-service + top-clients tables; range selector | — (populates as appts are marked completed) |
| 6 | ~~**Card on file + per-service deposits** (Stripe)~~ ✅ **SHIPPED** | Card saved at booking, per-service deposits, no-show fees at her discretion | — (Stripe live) |

## 📸 Tier 2 — client experience

| # | Feature | What it does | What we need from you |
|---|---|---|---|
| 7 | ~~**Photo upload at booking**~~ ✅ **SHIPPED** (run migration `0003` to activate) | Up to 3 optional photos at booking; Evelyn views them per-appointment in `/studio` | **Run `supabase/migrations/0003_booking_photos.sql`** in the SQL editor |
| 8 | ~~**Client self-service**~~ ✅ **SHIPPED (cancel)** | Cancel from the link in the confirmation. Reschedule is still "text or call" on purpose — handing a client the calendar risks colliding their old slot with their new one | — |
| 9 | ~~**SMS text reminders**~~ ✅ **SHIPPED** | Confirmations + day-before reminders; A2P cleared 9 Sep 2026 | — |
| 10 | **Intake / consultation forms** | New-client allergies, patch test, hair history, goals | The questions; needs a migration |
| 11 | **Before/after photos** | Attach result photos to a client's visit history | Confirm; needs Storage + migration |

## 🌱 Tier 3 — growth & polish (post-launch)

| # | Feature | Needs from you |
|---|---|---|
| 12 | Rebooking / birthday nudges | Cadence; depends on email/SMS |
| 13 | Gift cards | Payments; go/no-go |
| 14 | Memberships / packages | Payments; the packages + prices |
| 15 | Waitlist / cancellation fill | Go/no-go; depends on notifications |
| 16 | Reviews & light marketing | Google Business link; go/no-go |
| 17 | Google Calendar sync for Evelyn | Go/no-go (needs Google sign-in setup) |
| 18 | **Retail + inventory + cost-of-goods** (the salon-shaped gap QuickBooks handles poorly) | Go/no-go. Sell retail at checkout, track product/color stock + low-stock nudges, rough product cost per service → true margins. Own mini-project; needs a migration. ⚠️ This item used to say "keep general bookkeeping/expenses/taxes in QuickBooks" — **reversed 2026-09-23**, see [MONEY.md](MONEY.md). Evelyn wants to do her own taxes, so expenses and tax now live in the app and this item is the retail half of the same schema. |
| 19 | **Money: bank feed, costs, tax** — expenses in by OFX statement import, business/personal review, break-even, margin per service, and the set-aside rate across four jurisdictions | Design agreed 2026-09-23; schema `0036_money.sql` applied. She banks with **Relay**, which Teller does not cover — OFX import is the path, Plaid (`ins_117228`) the later upgrade. See [MONEY.md](MONEY.md). |

## 🔧 Small / no info needed (I just build)
- Top-level "New appointment" in Appointments (manual booking is per-client only today)

## Also shipped
- **Check in / Check out** — appointment lifecycle is now Booked → Confirmed → **Checked in** (arrived) → **Checked out** (paid & done), replacing the single "Completed". Check-out records the **amount paid** (editable) + **payment method** (Card (Intuit) / Cash / Venmo / Zelle / Other). Reports counts checked-out visits as revenue and adds a **By payment method** breakdown so the **Card total reconciles against Intuit deposits**. Needs migration `0006_check_in_out.sql`.
- **Card on file at booking** (Stripe SetupIntent, no charge) — clean **card-only** field, plus an **Apple Pay / Google Pay** button that appears only on wallet-capable devices. ✅ **Live mode is done** (verified 2026-08-18: the deployed bundle serves a `pk_live_` key and the Apple Pay button renders, which it only does when the domain is registered in Payment method domains for the *current* mode). Nothing outstanding here for launch.
  - ▢ Genuinely untested, because testing it moves real money: the **no-show / late-cancel charge** path (`/api/stripe/charge-no-show`) against a live saved card. Worth one small real charge to a card you own, then refund it in the Stripe dashboard.
  - ▢ Evelyn hasn't set `deposit_cents` on any service yet, so no booking currently asks for a deposit. That's a decision for her, not a build.
- **Calendar** in `/studio` — Month / Week / Day views, color-coded, click-to-manage; old list kept as "List" tab.
- **PWA install** — web manifest + Apple touch icon + theme color; "Add to Home Screen" launches standalone on iPad/iPhone.
- **Date-range time off** (block weeks/months in one entry, e.g. "closed until September") — the way to pause online booking until she's ready.
- **Demo data seed** (`supabase/seed_demo.sql`) for previewing a populated app.

## Studio UX overhaul (in progress)
Goal: on every page, she sees what she needs for *that* thing, and can act without hunting.
- ✅ **Appointment detail** (calendar): Call/Text/Email, client photos **inline**, **Rebook**, plus reschedule/status. Tap-into-day. Phone required at booking. [PR #8]
- ✅ **Add appointment from the calendar** ("+ New") and a **View-profile link** from an appointment that jumps to the client page. [PR #12]
- ✅ **Shared detail modal on Overview + client-history** (contact, inline photos, actions, rebook, View-profile). [PR #14]
- ✅ **List + Calendar on the same shared modal** — all surfaces now use one ApptDetailModal (removed ~330 lines of duplicate detail code). [PR #15]
- ✅ **Client page reach-out** — Call/Text/Email header + **"Win back"** for lapsed clients (pre-filled text). [PR #10]
- ✅ **Tasks tab** — "Reach out" reminders (no next appt booked, lapsed 8wk flagged) + manual to-dos (one-off + recurring). [PR #11] — **run `0005_tasks.sql`** to enable the to-do list.
- ▢ Client page: show past visits as click-into-detail + a link *from* an appointment *to* the client profile (part of "same detail everywhere").
- ✅ **Command-center redesign (Design C)** — shipped [PR #25]. Left **sidebar** nav with icons (lucide-react) → mobile hamburger; **greeting**, **"needs attention"** banner (running-late clients + unread-texts link), and a **"taken today"** ($ from checkouts) stat; today's-schedule rows show **status as a left stripe** + **service type as a fixed-width solid color block flush right** (no pills). Status colors: green=checked in, charcoal=checked out, red=running late. Service colors (now in `lib/format` `serviceColors`, shared with Calendar): Highlights=soft yellow, Custom Color=peach, Cut and Style=rose, Treatments=lavender, Blowouts=clay, Men's=blue.

## Where things stand (end of 2026-08-17 session)

**Done and live:** studio calendar fixes (drag-to-move, click-to-book, reschedule, cancel confirm), service categories, real hours + phone on the site, `/privacy` + `/terms`, SMS consent capture (transactional + separate marketing opt-in), email confirmation/reminder plumbing (unconfigured — no Resend key, and Evelyn has no client emails), the Outreach sweep screen, 159 clients imported from her paper book, Stripe wallet fixes, and click-to-call.

**Migrations run:** through `0022` (confirmed 2026-08-18). **Still to run:** `0023` (missed calls).

**Waiting on nobody:**
- ✅ `SALON_OWNER_PHONE` (Evelyn's mobile) set in Vercel — click-to-call was 503ing without it.
- ✅ **Inbound texting is LIVE** (2026-08-18). Messaging Service inbound webhook → `https://threshold.salon/api/sms/inbound`, HTTP POST. Verified end to end: a real text reached the route and appeared in the studio Messages tab.
- ✅ The number's **"A call comes in"** webhook → `https://threshold.salon/api/voice/incoming`, HTTP POST. Replaces the "Forward to Evelyn" TwiML Bin, which is now orphaned (kept, not deleted, as a fallback while the new flow is unproven).
- ✅ Twilio account confirmed **upgraded**, not trial — no "you have a trial account" preamble, no verified-number restriction.
- ✅ **CNAM submitted** 2026-08-18 (Trust Hub → Registrations → CNAM), display name `Threshold Salon` — exactly the 15-character maximum, which is why the LLC suffix is dropped. Free. Allow **48–72 hours** after approval to propagate to US carriers.
  - ⚠️ Temper expectations: **mobile carriers often don't dip the CNAM database**, and her clients are nearly all on mobile. CNAM is reliable for landlines; the mobile equivalent is *branded calling* (direct carrier integrations), a separate product. Judge CNAM's value after it propagates before deciding whether to pursue that.

*Confirmed by observation, against earlier doubt:* **inbound SMS is not A2P-gated.** The messaging log shows inbound messages as `Received` while every outbound row is `Undelivered` — receiving works now, sending waits for the campaign. The number's "Messaging disabled — Complete A2P registration" badge refers to sending only, and is misleading if read as covering both.

*Console trap, for next time:* the Messaging Service inbound webhook is **not** in the left sidebar's Settings (that's account-wide General Messaging Settings, and has no inbound routing on it). It's Messaging → Services → the service → the **SETTINGS tab in the horizontal row on that page** → Integration. Two different pages named Settings; only one has the field.

**Waiting on Twilio:** A2P campaign in vetting, submitted 2026-08-17, 10–15 days. Until it clears, no outbound texting of any kind. See the freeze note below.

**Known gaps:** nothing in `/studio` has been verified by anyone but Paul, since it's behind the sign-in.

## Incoming calls + voicemail — ✅ BUILT (needs migration `0022` + the Twilio webhook)

Replaces carrier/TwiML-Bin forwarding, which got the unanswered case wrong: a
forwarded call that Evelyn misses rolls to her **personal** cell greeting, so a
client who just rang "Threshold Salon" hears her private voicemail.

Flow: client rings the salon number → `/api/voice/incoming` rings Evelyn's mobile
(caller hears real ringback via `answerOnBridge`, and her phone shows the
client's number) → she hears a **whisper**: "Threshold call from Sarah Jenkins,
press any key to take it" → keypress bridges the call. No keypress and the leg
drops to `/api/voice/no-answer`, which plays the salon greeting and records a
voicemail.

The keypress is load-bearing, not a nicety: her carrier voicemail will "answer" a
forwarded call and Twilio can't distinguish that from Evelyn answering. Voicemail
can't press a key, so screening is what keeps the call from being swallowed.

Voicemail lands in the **Messages tab** as a row in `messages` (`kind='voicemail'`)
rather than a screen of its own — so it inherits the conversation grouping, the
unread badge, and sits in the same thread as that client's texts. Twilio
transcribes it (~1¢), and the transcript becomes the message body, so she can
read it between clients instead of finding somewhere private to listen. Audio
plays on demand via `/api/voice/recording`, which re-fetches from Twilio
server-side under her session token — Twilio's own media URLs are unauthenticated,
and a client's voicemail must not sit on a public URL.

Routes: `incoming` → `screen` → `accept` → `no-answer` → `voicemail` →
`transcription`, plus `recording` for playback.

**Missed calls (migration `0023`).** A caller who leaves no message used to
vanish entirely — and that's the common case. A `missed_call` row is now written
the moment the dial fails, and *upgraded in place* to a voicemail if they leave
one (matched on call SID), so one call is one line on the banner either way.
Note this logs unknown numbers too, so persistent spam callers will show up; if
that becomes noise, filter to known clients or add a dismiss action.

**Needs-attention banner** now names what's waiting instead of counting it —
each unread text, voicemail and missed call as its own row with sender, opening
words and an icon, collapsing to a count past three. The appointment detail also
shows that client's last three messages, and deliberately does **not** mark them
read (she's glancing, not answering).

- ⚠️ **Untested against a live call.** The one behaviour to watch is the
  declined-screening branch in `/api/voice/no-answer`: a rejected screening leg
  still reports `DialCallStatus=completed`, so voicemail is triggered off
  `DialCallDuration` being zero. If a declined call hangs up instead of recording,
  that's the line to revisit.

## Two-way texting + SMS automation (planned — own feature, phased)
Goal: automate as much client texting as possible around the appointment lifecycle, and put replies **in front of Evelyn even when she's busy with another client**. Everything here dovetails with the Design-C **"needs attention"** banner (that's where alerts/replies surface).

**Hard dependency:** **A2P 10DLC registration** must clear before any of this can go live — automated/two-way US business texting legally requires it. This is the critical path. Also needs quiet-hours rules and the existing `/api/sms/booking-confirm` hardened.

*Status 2026-08-17:* Path is **Low-Volume Standard**, not Sole Proprietor — the business is **Threshold Salon LLC** with an EIN, which avoids the OTP-to-a-personal-mobile step that stalled this since July, and allows multiple sending numbers and up to 5 campaigns at <6,000 segments/day.

- ✅ Business (secondary) Customer Profile — **approved**.
- ✅ A2P Brand (Low-Volume Standard, Threshold Salon LLC) — **approved**.
- ✅ **Campaign submitted 2026-08-17** — now in carrier vetting, **10–15 days**. Opt-in declared as Web Form only (not Verbal). Outcome arrives by email.
- ✅ `evelyn@threshold.salon` set up as Namecheap email forwarding → her Gmail, and **confirmed working**. Needed because Standard brands get rejected for free/personal email, and because both the profile-approval notice and the brand 2FA code go there. Note Namecheap forwarding is receive-only and dies if the nameservers ever move off Namecheap (see the Cloudflare note below).
- ✅ Site prerequisites live: `threshold.salon` reachable, `/privacy`, `/terms` (a real page, not a redirect — redirecting URLs are a rejection cause), and `/book` with two separate unchecked consent boxes, each linking to both.

**🔒 FROZEN until the campaign is approved.** Vetting inspects the live site against the submitted description, so until it clears, do not change: the consent wording or checkboxes on `/book`, `/terms`, `/privacy`, or DNS. A mismatch found during review is a rejection and another 10–15 day cycle.

*Note on the consent model:* it briefly moved to notice-at-point-of-collection (no checkbox) on the correct reading that the TCPA doesn't require written consent for appointment texts. That was reverted — A2P vetting applies CTIA best practice, and Twilio's web-form requirements explicitly demand a checkbox that is not pre-selected. Migration `0019` backfilled existing clients as `provided_at_booking` and that stands; `0020` returned new web bookings to checkbox-driven consent.
- ⚠️ Deferred on purpose: **moving DNS to Cloudflare**. Namecheap's free forwarding only works on Namecheap nameservers, so that move swaps it for Cloudflare Email Routing and must be done in one sitting. Doing it during vetting risks the site being unreachable exactly when carriers check it — a documented rejection cause. Migrate after approval. Records to rebuild: A `216.198.79.1`, CNAME `www` → `cname.vercel-dns.com`, and set them **DNS-only**, not proxied.
- ⚠️ The consent wording covers confirmations, reminders and replies — **not marketing**. A mass-discount blast needs its own separate opt-in and campaign use case.

**Foundation (Phase 1) — ✅ BUILT (needs migration `0007_messages.sql` + env):**
- ✅ `messages` table + `clients.sms_opt_out` + RLS (migration `0007_messages.sql`).
- ✅ **Inbound webhook** `/api/sms/inbound` — Twilio-signature verified; matches `from` → client by last-10 digits; links to the client's nearest current/upcoming appt; logs the text; handles STOP/START. Writes via the service-role key.
- ✅ **Authenticated send route** `/api/sms/send` — verifies Evelyn's session token, respects opt-out, sends via Twilio + logs. 503s until Twilio configured.
- ✅ **Studio Messages tab** — conversation list + thread + reply, mark-read, unread badge on the tab (desktop + mobile).
- ✅ **Express SMS consent** (migration `0013_sms_consent.sql`) — optional unticked checkbox at booking with full carrier-required disclosure (wording in `lib/smsConsent.ts`); `clients.sms_consent_at` + `sms_consent_source`; `create_booking` gained `p_sms_consent`; `merge_client` carries consent across a merge. `/api/sms/booking-confirm` now skips `no_consent`. Replaces the old implied-consent model (`sms_opt_out` defaulting to false), which was a realistic campaign-rejection reason.
- Needs: run migrations `0007` + `0013`, set `SUPABASE_SERVICE_ROLE_KEY` (server env), and point Twilio's inbound webhook at `/api/sms/inbound`. Still gated on A2P for real sending.
- ⚠️ Clients who booked before `0013` have `sms_consent_at = null` and will get **no** automated texts until they tick the box on a future booking. If Evelyn has consent for regulars by another route, record it as `sms_consent_source = 'in_person'`.
- ▢ TODO next: surface inbound on the appointment detail + Overview "needs attention".

## SMS automation — ✅ BUILT 2026-08-18, dormant until A2P (needs migration `0024`)

Written ahead of approval on purpose: if it only started when the campaign
cleared, approval day would begin a build instead of flipping a switch.

**The switch is `SMS_AUTOMATION_ENABLED`** (must be the exact string `true`).
Until it's set, every automated send is skipped with reason `automation_off`.
Evelyn's own replies from the Messages tab are unaffected — those go through
`/api/sms/send` and are her decision, not automation's.

- **`lib/sms.ts`** — the one door every automated text goes through. Enforces
  the rules a person would apply without thinking: no consent → no text (the 159
  clients imported from her paper book have none until they tick the box on a
  future booking), opted out → no text, outside **9am–8pm salon time** → no text.
  Each refusal is a named reason, so a run reports `12 sent, 4 no_consent,
  1 quiet_hours` and a working system is distinguishable from a broken one.
- **`lib/smsTemplates.ts`** — the actual wording, in one file for the same reason
  the consent text is: the campaign submission quotes sample messages, and
  carriers compare what's sent against what was described.
- **Reminder** — folded into the existing daily `/api/cron/reminders` rather than
  a second job, because the question is identical and the free Vercel plan
  allows one cron a day. Sends email and text independently; either can be
  configured without the other.
- **Reply `C` to confirm** — handled in `/api/sms/inbound`. Only promotes an
  appointment that's still `booked`, and only on a bare confirmation word, so
  "ok but can I move to 3?" stays a conversation for Evelyn. Acknowledges with a
  short text so the reply doesn't vanish into silence.
- **`/api/cron/late-arrivals`** — "still on your way?" after a **10-minute** grace
  period, ignoring quiet hours (their appointment is happening now), and never
  more than 90 minutes late. Safe to call as often as you like; does nothing when
  nothing is due.

**Late-arrivals is scheduled in Postgres**, not Vercel — migration `0025` sets up
Supabase Cron (pg_cron + pg_net) to hit the endpoint every 5 minutes. Vercel's
free cron runs once a day, which for this job is worse than not running: it'd
fire at one arbitrary moment and look broken. Not in `vercel.json` for that
reason.

🔴 **`CRON_SECRET` was never set in Vercel** (found 2026-08-18). Both cron routes
refuse to run without it, so the daily reminder job has been returning 401 to
Vercel Cron on every run since it was built — it has never fired. Email was
unconfigured too, so nothing was lost, but the job was dead independently of
that. The same secret must be set in **two** places, with the same value:
Vercel's env vars, and Supabase Vault under the name `cron_secret` (see the
header of `0025`).

**Late-arrival flow (Phase 2) — original notes:**
- **Scheduler** (Supabase pg_cron or Vercel cron, every few min) finds booked/confirmed appts past start + not checked in + not already pinged → auto-text "still on your way?"; record it; flag the appt.
- Client reply lands in front of Evelyn with **one-tap actions**: "can't make it" → mark no-show + send rebook link; "omw" → red flag can ease to amber.
- Clients can also **text first** ("running late") → matched to their appt → needs-attention.

**More automations (Phase 3) — Paul: "all of it will be good":**
- **Reminders** (day-before / 2h) with "Reply C to confirm" → auto-sets Confirmed.
- **"Running behind" heads-up** — when *Evelyn's* late (prev appt overran), one tap texts the next client.
- **No-show follow-up / win-back** — auto or one-tap rebook (ties into Tasks reach-out).
- **Waitlist fill** — slot opens → text the waitlist.

**Later enhancement:** **push notifications** so it buzzes her phone with the app closed (iOS installed-PWA supports it; more setup). In-app alerts cover it until then. Cost ~1¢/text in or out.

## Marketing ideas (parked — SMS/AI bucket)
- **Mass-text a discount to fill an open slot** — blast lapsed/all clients when there's a last-minute opening. Needs Twilio + **A2P 10DLC registration** (US business-texting approval) + opt-out compliance; ~1¢/text. (Same channel as two-way texting above.)
- **AI-generated promo graphics** (Canva-like) — yes, that's an image-generation feature. Either an image-gen API (type the offer → branded graphic) or editable templates. Its own mini-project.

## Competitor research (2026-07-24) — lifecycle & AI content
Deep-research pass on GlossGenius, Boulevard, Fresha, Vagaro (Square/Mangomint not primary-verified). GlossGenius findings are from primary sources; competitor findings are softer/secondary. Full memory: `salon-competitor-research.md`.

**Client lifecycle:** No researched platform exposes a named-stage model (new/regular/VIP/lapsed/at-risk) as first-class UX — genuine whitespace. The industry KPI is **rebooking rate** (GlossGenius markets 75%+), driven by a rebook prompt at checkout + auto "we miss you" texts at ~60 days. Threshold's "Reach out" list already matches best practice. → **Shipped:** auto lifecycle badge on the client card + rebooking-rate metric on Reports (below).

**AI social content:** Nobody in the category generates AI social posts. GlossGenius "Genius AI" (GPT-4) only drafts **email/SMS copy**; its social feature is a static Canva-style template library. So:
- AI **campaign copy** (email/SMS) = emerging table-stakes — easy win once texting is live.
- AI **branded graphics / carousel images** = real differentiator whitespace — the core of what Evelyn's asking for (#16).
- AI **TikTok/Reels video** = heaviest lift, nobody offers it — **defer**.
→ Plan for #16: captions + branded graphic templates first; carousel image-gen as the differentiator; video later. Its own mini-project.

## Just shipped (2026-07-24) — quick wins + lifecycle
- **Photo lightbox** — client photos enlarge in-page (Esc / click to close), no more leaving the app.
- **Prebook presets** — +4 / +6 week buttons on the Rebook form, based on the visit being rebooked from.
- **Tasks: start date + client link** — a task can be scheduled for a day (start + due) and attached to a client; shows on the client card (needs migration `0008`).
- **No-show → follow-up task** — marking no-show drops a dated task on the client's file (groundwork for charging the fee).
- **Reach-out reminders open the client card** — one tap into the client to call/text/note/book/resolve; a client with an open follow-up task drops off the list until it's done.
- **Client lifecycle badge** — New / Regular / At risk / Lapsed / Won back, auto-derived from visit history (no manual tagging). Answers #11.
- **Rebooking-rate metric** — headline retention KPI on the Reports tab.

## Just shipped (2026-07-24) — the "regrowth" client view
Design direction: a stylist reads overdue clients by **grown-out roots**, so the whole Clients experience is built on hair color + regrowth. (Client-approved after design exploration; see mocks.)
- **Client list** — each client is a **strand of her color** with dark regrowth that grows the longer since their last visit; avatar with a **gold dot (new)** / **lavender dot (won back)**; serif colorist captions ("gold blonde · roots at 6w"). No pills; stage/color on the left.
- **Filterable stage key** — New / Regular / Roots showing / Grown out / Won back, each a mini-strand + live count; doubles as the legend.
- **Color-ring summary** — the whole book fanned open like her swatch ring (fresh → grown out), with counts.
- **Strand color source:** her **formula (level + tone)** — "9G", "5N" — mapped to a swatch (`lib/hair.ts`); **service-type default** when none (highlights → blonde). Stored in `clients.hair_formula` (migration `0009`).
- **Client card interior** — hero strand, her formula + swatch, stats (visits / since last / spent), Tasks & follow-ups, appointments, win-back. Complements the list.
- **Intake form** — phone now required; a **formula field with a live swatch preview**; prefilled-from-booking friendly ("complete her card"). Writes degrade gracefully pre-migration (retry without hair_formula).
- **Needs migration `0009_client_hair_formula.sql`** to store formulas; works with service-default colors until then.
- Later: **photo-suggested color** (sample from her uploaded photos), and wiring the color ring / "who needs attention" onto the dashboard.

## Roadmap (next, defined — no info needed)
- **Projected vs. actual earnings (#14)** — actual = checked-out revenue (have it); projected = value of upcoming booked appts. Add to Reports.
- **New-client retention (#15)** — % of first-time clients who book a 2nd visit within 90 days (window TBC with Evelyn).
- **AI content tab (#16)** — own mini-project, per research above.

---

## New item detail

### Client & service metrics (#5)
Mostly computable from the existing `appointments` data — **no schema change needed** for a first version.
- **Per client:** total visits, total spent, last visit, no-show count/rate, most-booked service, first-visit date, average gap between visits.
- **Per service:** bookings count, revenue, share of bookings, no-show rate, trend over time.
- Surfaced as a **Reports** tab in `/studio`, plus a mini stats strip on each client profile.
- _Need from you:_ which of these matter most (I'll ship a sensible default set otherwise).

### Photo upload at booking (#7)
Optional uploads during the public booking flow: a photo of the client's hair today + any inspiration images.
- Requires a **Supabase Storage** bucket + a small **migration** (link photos to the appointment; anon can upload, only Evelyn can view).
- Photos appear on the appointment in `/studio` so Evelyn can prep before the client arrives.
- _Need from you:_ confirm, and a max number of photos (suggest ~3 each).

---

## 💳 Payments approach — Intuit (Salon Lofts) vs Stripe

**Context:** Salon Lofts offers discounted card processing via **Intuit at ~2.3%** (a card-present rate). Our app only needs a payment integration for *online, automated* charges (deposits, no-show fees, card-on-file). These are two different jobs:

- **In-person payment for services** (the bulk of revenue, paid at checkout): **use Intuit / Salon Lofts.** Cheaper rate, and Evelyn just uses their reader — our app doesn't need to touch it.
- **Online deposits / no-show fees** (small, lower volume): needs a developer-friendly payments API. **Stripe** is far easier to integrate than Intuit's API for deposits + card-on-file. The rate difference only applies to these small deposit amounts, so it's negligible.

**DECIDED (2026-07-08):** Split model —
- **In-person service payments → Intuit / Salon Lofts (2.3%).** Our app doesn't touch these.
- **Online → Stripe:** save a **card on file** at booking (wanted for all), and collect a **deposit on select services only** (per-service `deposit_cents` — the field already exists in the Services tab, so Evelyn can set which services and how much). No-show/late-cancel fees charged against the card on file at Evelyn's discretion.

**Blocker to build:** Evelyn's Stripe account (business + bank for payouts). ✅ Resolved; Stripe is live.

**Tech note (superseded).** This said the Stripe secret key would run in Supabase Edge Functions, to keep the site a static export. That's not what happened: the app moved to Vercel, so the secret runs in ordinary Next.js route handlers under `app/api/`. No Edge Functions exist in this project.

---

## ❓ Open questions
1. ~~Online deposits vs in-person only~~ — **DECIDED:** card-on-file for all + per-service deposits, via Stripe; in-person via Intuit.
2. Which **services get a deposit**, and how much? (Evelyn can set these in the Services tab. Still unset — no booking currently asks for one.)
3. ~~Real **phone + email**~~ — **DONE:** (937) 936-2138, info@threshold.salon.
4. ~~No-show/cancellation policy~~ — **DECIDED:** 24h notice; late cancels / no-shows may be charged up to full service price, at Evelyn's discretion.
5. ~~Booking min-notice, buffer, max-advance~~ — **DONE:** minimum notice and max advance are hers to set in Settings (defaults 2 hours / 12 weeks). **Buffer between appointments is still not built** — processing time covers the colour case, but there's no gap-after-every-appointment setting.
6. ~~Reminder timing~~ — **DONE:** one morning sweep, lookahead editable in Settings (default 36 hours, which catches tomorrow plus tonight's late bookings).

## ❓ Open, as of 2026-09-23
1. **Salon Lofts bookings** arrive by email and text and are logged by hand. Automating the email side needs a sample of what Salon Lofts actually sends — forwarded email + screenshot of a text. Texts reach her personal phone, so the app can't see them unless Salon Lofts can send to the salon number.
2. **Blocking time from the calendar** rather than the Time off tab — agreed as the right home, not built.
3. **Buffer between appointments** — see #5 above.
