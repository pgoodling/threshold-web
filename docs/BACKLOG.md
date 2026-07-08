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
| 4 | **Cancellation policy** | Shown at booking | Policy **wording** (or approve draft) |
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

## 🔧 Small / no info needed (I just build)
- Top-level "New appointment" in Appointments (manual booking is per-client only today)

## Also shipped
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

## Marketing ideas (parked — SMS/AI bucket)
- **Mass-text a discount to fill an open slot** — blast lapsed/all clients when there's a last-minute opening. Needs Twilio + **A2P 10DLC registration** (US business-texting approval) + opt-out compliance; ~1¢/text.
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
4. **No-show/cancellation policy** — fee amount + cutoff window?
5. Booking **min-notice, buffer, and max-advance** numbers?
6. Reminder timing — 24h, 48h, or both?
