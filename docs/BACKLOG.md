# Threshold — Product Backlog

_Living list of what's built, what's next, and what we need to build it. Updated 2026-07-08._

Related: [BUILD-PLAN.md](BUILD-PLAN.md) (architecture + rationale).

---

## ✅ Shipped (live on threshold.salon)
- Public online booking: service → month calendar → time → confirm.
- No-double-booking, availability driven by Evelyn's hours + time off.
- `/studio` admin: login, **Overview**, **Appointments** (confirm / reschedule / complete / no-show / cancel), **Clients** CRM (directory, profiles, history, add, book-for-client), **Services** management, **Hours**, **Time off**.
- Hosted on Vercel, custom domain + HTTPS, Supabase backend.

---

## 🎯 Tier 1 — target before September launch

| # | Feature | What it does | What we need from you |
|---|---|---|---|
| 1 | **Confirmation + reminder emails** | "You're booked" + 24h reminder to client; Evelyn notified | **Resend** account; the "from" address; reminder timing. I draft the copy. |
| 2 | **Real contact info** | Replace placeholder phone/email on the site | Real **phone + email** |
| 3 | **Booking rules** | Min notice (e.g. no booking within 2h), buffer between appts, max advance | Your **numbers** |
| 4 | **Cancellation policy** | Shown at booking | Policy **wording** (or approve draft) |
| 5 | **Client & service metrics** _(new)_ | See below | Which metrics matter most (defaults proposed) |
| 6 | **Deposits / no-show protection** | Deposit at booking; fee for no-shows | Payments decision (see below); deposit amounts + policy |

## 📸 Tier 2 — client experience

| # | Feature | What it does | What we need from you |
|---|---|---|---|
| 7 | **Photo upload at booking** _(new)_ | Client optionally uploads a photo of their hair today + inspiration pics | Confirm; max # photos. Needs Storage + a migration (I write it). |
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
- "Add to Home Screen" PWA polish (app icon/name)

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

**Recommendation:** Intuit for in-person; **only** add Stripe if/when we build online deposits — and honestly we may not need deposits at launch. **Open question:** does Evelyn want to *require online deposits* at booking, or is taking payment in-person (Intuit) enough for launch? If in-person is enough, **we don't need Stripe at all** for now.

---

## ❓ Open questions
1. Require **online deposits** at booking, or in-person payment (Intuit) only? _(decides whether we need Stripe)_
2. Real **phone + email** for the site?
3. Deposit amounts + **no-show/cancellation policy** (fee + cutoff window)?
4. Booking **min-notice, buffer, and max-advance** numbers?
5. Reminder timing — 24h, 48h, or both?
