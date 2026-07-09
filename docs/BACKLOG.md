# Threshold — Product Backlog

_Living list of what's built, what's next, and what we need to build it. Updated 2026-07-08._

Related: [BUILD-PLAN.md](BUILD-PLAN.md) (architecture + rationale).

---

## ✅ Shipped (live on threshold.salon)
- Public online booking: service → month calendar → time → confirm.
- No-double-booking, availability driven by Evelyn's hours + time off.
- `/studio` admin: login, **Overview**, **Appointments** (confirm / reschedule / complete / no-show / cancel), **Clients** CRM (directory, profiles, history, add, book-for-client), **Services** management, **Reports** (client & service metrics), **Hours**, **Time off**.
- Hosted on Vercel, custom domain + HTTPS, Supabase backend.

---

## 🎯 Tier 1 — target before September launch

| # | Feature | What it does | What we need from you |
|---|---|---|---|
| 1 | **Confirmation + reminder emails** | "You're booked" + 24h reminder to client; Evelyn notified | **Resend** account; the "from" address; reminder timing. I draft the copy. |
| 2 | **Real contact info** | Replace placeholder phone/email on the site | Real **phone + email** |
| 3 | **Booking rules** | Min notice (e.g. no booking within 2h), buffer between appts, max advance | Your **numbers** |
| 4 | ~~**Cancellation policy**~~ ✅ **SHIPPED** | "Reserving your time" note at booking: 24h notice; late cancels / no-shows may be charged up to full service price (Evelyn's discretion) | — |
| 5 | ~~**Client & service metrics**~~ ✅ **SHIPPED** | Reports tab: revenue, completed, avg ticket, no-show rate; by-service + top-clients tables; range selector | — (populates as appts are marked completed) |
| 6 | **Card on file + per-service deposits** (Stripe) | Save a card at booking; collect a deposit on *some* services; charge no-show fees at Evelyn's discretion | **Evelyn's Stripe account** (the blocker); which services get a deposit + amount (set in the Services tab — field already exists); no-show fee + cutoff |

## 📸 Tier 2 — client experience

| # | Feature | What it does | What we need from you |
|---|---|---|---|
| 7 | ~~**Photo upload at booking**~~ ✅ **SHIPPED** (run migration `0003` to activate) | Up to 3 optional photos at booking; Evelyn views them per-appointment in `/studio` | **Run `supabase/migrations/0003_booking_photos.sql`** in the SQL editor |
| 8 | **Client self-service** | Cancel/reschedule from the email link | Cancel cutoff window; depends on #1 |
| 9 | **SMS text reminders** | Texts alongside/instead of email | **Twilio** account + carrier registration |
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
| 18 | **Retail + inventory + cost-of-goods** (the salon-shaped gap QuickBooks handles poorly) | Go/no-go. Sell retail at checkout, track product/color stock + low-stock nudges, rough product cost per service → true margins. Keep general bookkeeping/expenses/taxes in QuickBooks. Own mini-project; needs a migration. |

## 🔧 Small / no info needed (I just build)
- Top-level "New appointment" in Appointments (manual booking is per-client only today)

## Also shipped
- **Check in / Check out** — appointment lifecycle is now Booked → Confirmed → **Checked in** (arrived) → **Checked out** (paid & done), replacing the single "Completed". Check-out records the **amount paid** (editable) + **payment method** (Card (Intuit) / Cash / Venmo / Zelle / Other). Reports counts checked-out visits as revenue and adds a **By payment method** breakdown so the **Card total reconciles against Intuit deposits**. Needs migration `0006_check_in_out.sql`.
- **Card on file at booking** (Stripe SetupIntent, no charge) — clean **card-only** field, plus an **Apple Pay / Google Pay** button that appears only on wallet-capable devices. Needs the domain registered in Stripe → Payment method domains (per mode: test now, **live before launch**).
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
- ▢ **Command-center redesign (Design C)** — mocked + approved-in-principle by Paul (2026-07-09), **pending Evelyn's feedback** before build. Left **sidebar** nav (→ hamburger on phones) replacing top tabs; **greeting**, a **"needs attention"** banner (running-late clients), and a **"taken today"** ($ from checkouts) stat; today's-schedule rows show **status as a left stripe** + **service type as a fixed-width solid color block flush right** (no pills). Status colors: green=checked in, charcoal=checked out, red=running late. Service colors: Highlights=soft yellow, Custom Color=peach/terracotta, Cut and Style=rose, Treatments=lavender, Blowouts=clay, Men's=blue (all distinct, off the status hues).

## Two-way texting + SMS automation (planned — own feature, phased)
Goal: automate as much client texting as possible around the appointment lifecycle, and put replies **in front of Evelyn even when she's busy with another client**. Everything here dovetails with the Design-C **"needs attention"** banner (that's where alerts/replies surface).

**Hard dependency:** **A2P 10DLC registration** must clear before any of this can go live — automated/two-way US business texting legally requires it. (As of 2026-07-09: waiting for the pending registration to fail so Paul can resubmit with the correct number — the OTP had gone to his wife's number. This is the critical path.) Also needs opt-out (STOP) handling, quiet-hours rules, and the existing `/api/sms/booking-confirm` hardened.

**Foundation (Phase 1):**
- `messages` table (client_id, appointment_id?, direction in/out, body, twilio_sid, status, created_at, read_at) + RLS.
- **Inbound webhook** `/api/sms/inbound` — Twilio posts incoming texts; match `from` → client by E.164; store; respond TwiML. Handle STOP/START.
- **Studio inbox/thread** — see + reply to client texts; unread badge; inbound surfaces on the appointment + Overview "needs attention".

**Late-arrival flow (Phase 2):**
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

**Blocker to build:** Evelyn's Stripe account (business + bank for payouts). **Tech note:** Stripe's secret key must run server-side — plan is Supabase Edge Functions (keeps the current static site as-is); deploying those needs the Supabase MCP pointed at the salon project or Paul deploying via CLI/dashboard.

---

## ❓ Open questions
1. ~~Online deposits vs in-person only~~ — **DECIDED:** card-on-file for all + per-service deposits, via Stripe; in-person via Intuit.
2. Which **services get a deposit**, and how much? (Evelyn can set these in the Services tab now.)
3. Real **phone + email** for the site?
4. ~~No-show/cancellation policy~~ — **DECIDED:** 24h notice; late cancels / no-shows may be charged up to full service price, at Evelyn's discretion.
5. Booking **min-notice, buffer, and max-advance** numbers?
6. Reminder timing — 24h, 48h, or both?
