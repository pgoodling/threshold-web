# Threshold — Booking & Business App: Build Plan

_Research + architecture decision + phased plan for turning threshold.salon from a marketing page into a working booking & client-management app for Evelyn._

Prepared July 2026.

---

## TL;DR — the decisions

| Question | Decision | Why |
|---|---|---|
| **App or website?** | **Responsive web app (PWA)** — no native app | Clients book from a link with zero install. One codebase. No App Store fees/reviews. Evelyn "adds to home screen" and it behaves like an app. |
| **Where does it run?** | Keep the existing **Next.js** app; deploy to **Vercel** (free) instead of GitHub Pages static export | Unlocks secure server code (Stripe, webhooks) that static export can't do. Still $0, still `threshold.salon`. |
| **Database / login / backend** | **Supabase** (free tier, a *new* project) | Managed Postgres + Auth + Row-Level-Security + serverless functions + scheduled jobs. Almost no ops. |
| **Payments / deposits / no-show fees** | **Stripe** (pay-per-transaction, no monthly fee) | Replicates GlossGenius's deposit + card-on-file model. **You** hold the money — avoids the fund-withholding complaints people file against GlossGenius. |
| **Reminders** | **Email** at launch (free), **SMS via Twilio** as a fast-follow | SMS is GlossGenius's killer feature but costs ~1¢/text. Email is free and covers 80% of the value on day one. |
| **Inventory management?** | **Defer it.** Not core for a solo stylist. | She sells *services*, not retail. Add a simple "product used" note later; only build real inventory if she starts selling product off the shelf. |

**Running cost: ~$0–5/month** (vs GlossGenius $24–48/mo), and you own the data and the money flow.

---

## 1. What Gloss Genius actually does (research)

GlossGenius is the market benchmark for solo stylists ($24–48/mo). Its **most-used, highest-value features**, in the order they matter to a one-chair business:

1. **24/7 online booking** — client picks a service, sees real availability, picks a time, books. **No app download, no login.** This is the core of the whole product.
2. **Deposits + no-show protection** — service-specific deposits collected at booking; card kept on file; charge a fee on no-show / late cancel. This is the single biggest revenue protector.
3. **Automated reminders** — 24h & 48h text + email confirmations and reminders, plus rebooking nudges. This is what drives their quoted "75%+ rebooking rate" and reduced no-shows.
4. **Client profiles (CRM)** — contact info, full service history, notes, preferences, before/after photos, birthdays, card on file.
5. **Calendar / schedule management** — day view, set working hours, block time off, reschedule/cancel.
6. **In-person payments** — Tap-to-Pay / card reader / manual entry, flat 2.6% processing, same-day payout.

**Secondary features** (they've added these, but they're not why people sign up): intake/consultation forms ("Genius Forms"), gift cards, memberships & packages, waitlists, email/SMS marketing campaigns, birthday texts, review requests, basic reporting.

**What clients complain about** (our openings to be "better"):
- **Withholding funds / payout disputes** (documented BBB complaints). → *We use Stripe directly, so payouts are Stripe's standard 2-day cycle to Evelyn's bank. No middleman holding her money.*
- **Can't fully delete a stored card** (only replace). → *We can build true delete.*
- **Limited website personalization.** → *We already have a custom-designed brand site; booking lives inside it, not on a generic GlossGenius subdomain.*
- Everything is bundled into a monthly fee whether or not she uses it. → *We pay only for what we use.*

_Sources: [GlossGenius online booking](https://glossgenius.com/online-booking), [client management](https://glossgenius.com/client-management), [no-show protection](https://glossgenius.com/no-shows-protection-card-on-file), [pricing](https://glossgenius.com/pricing), [The Salon Business review](https://thesalonbusiness.com/glossgenius-review/), [Square vs Vagaro vs GlossGenius vs Fresha 2026](https://www.thelocalgem.com/blog/square-vs-vagaro-vs-glossgenius-vs-fresha-2026-salon-pick), [BBB complaints](https://www.bbb.org/us/ny/new-york/profile/marketing-software/glossgenius-inc-0121-87155577/complaints)._

---

## 2. App vs. website — the decision, explained

**Recommendation: build a responsive web app (installable as a PWA). Do not build a native iOS/Android app.**

| | Native app | Web app / PWA ✅ |
|---|---|---|
| Client friction | Must find + install from store before booking | Tap a link, book. Zero install. |
| Cost | $99/yr Apple + $25 Google, per-release review | $0 |
| Maintenance | Two codebases, OS updates, store re-submissions | One codebase |
| "Feels like an app" | Yes | Yes — Evelyn adds it to her home screen |
| Booking conversion | Worse (install step kills it) | Best |

There is **no booking-app reason** to go native. A PWA gives Evelyn an app-like admin experience on her phone and gives clients a frictionless booking link — which is exactly what GlossGenius's own "no app download required" booking flow is optimized for.

---

## 3. Recommended architecture

```
                 threshold.salon  (Next.js on Vercel, free)
                 ├── Marketing site      → existing pages, unchanged
                 ├── /book               → public booking flow (clients)
                 └── /studio             → Evelyn's admin dashboard (login required)
                          │
            ┌─────────────┼───────────────────────────┐
            │             │                           │
        Supabase       Stripe                    Twilio / Resend
     (free tier)    (per-transaction)          (reminders: SMS/email)
   ┌──────────────┐  ┌───────────────┐         ┌──────────────────┐
   │ Postgres DB  │  │ Deposits      │         │ 24h/48h reminders│
   │ Auth (login) │  │ Card on file  │         │ Confirmations    │
   │ RLS security │  │ No-show fees  │         │ Rebooking nudges │
   │ Edge/Cron    │  │ In-person pay │         └──────────────────┘
   └──────────────┘  └───────────────┘
```

**Why this stack is "little-to-no maintenance":**
- **Managed everything** — no servers to patch, no OS, no scaling. Supabase and Vercel are fully managed; you never SSH into anything.
- **Serverless** — code runs on demand (Vercel functions / Supabase Edge Functions), nothing to keep alive.
- **Free tiers comfortably cover a solo salon.** A one-chair business is a rounding error on these limits.
- **Standard, boring, well-documented tech** — Next.js + Supabase + Stripe is one of the most common stacks on earth, so fixes are always a search away.

### One hosting decision for you
- **Option A (recommended): move hosting to Vercel.** Drop `output: "export"`, deploy to Vercel Hobby (free). Gives us server actions + route handlers, which make Stripe and webhooks *much* simpler and safer. Moving `threshold.salon` is a ~5-minute DNS change. GitHub stays the source of truth; Vercel just builds it.
- **Option B: stay on GitHub Pages static export.** Keeps today's pipeline. Then all secure/server logic (Stripe, reminders) has to live in **Supabase Edge Functions** instead. Totally workable, just a bit more plumbing and a slightly worse developer experience.

I recommend **A**. It's less code and safer for handling money. Either way the cost is $0.

> Note on Next.js: this repo runs **Next.js 16.2.9**, which `AGENTS.md` flags as having breaking changes vs. older versions. Before writing feature code we read `node_modules/next/dist/docs/` — the relevant guides (`route-handlers`, `forms`, `authentication`, `fetching-data`, `mutating-data`, and `static-exports` if we stay on Option B) are all present.

---

## 4. Data model (first cut)

New Supabase project. Core tables (RLS on all):

- **services** — name, description, duration, price, deposit_amount, active. (Seed from the current site: Custom Highlights, Custom Color, Cut & Style, Treatments, Blowouts, Men's Cuts.)
- **availability_rules** — Evelyn's weekly working hours per day.
- **time_off** — one-off blocks (vacation, personal).
- **clients** — name, phone, email, notes, preferences, birthday, stripe_customer_id, created_at. Auto-created on first booking.
- **appointments** — client_id, service_id, start/end, status (booked / confirmed / completed / no_show / cancelled), deposit_status, price, notes.
- **appointment_photos** — before/after images (Supabase Storage), linked to appointment + client.
- **intake_forms** *(Phase 3)* — consultation / allergy / patch-test answers per client.
- **messages_log** *(Phase 2)* — record of reminders/confirmations sent, for auditing.

**Security posture:** the public booking pages use the Supabase anon key and can only (a) read active services + free slots and (b) create a pending appointment. They cannot read other clients' data. Everything in `/studio` requires Evelyn's authenticated login. This is enforced by Row-Level Security, not by hiding buttons.

---

## 5. Phased plan

Each phase is independently shippable — Evelyn gets value at the end of each one.

### Phase 0 — Setup (no user-visible change)
- Create the new Supabase project (separate from the golf app). **Decided:** the salon gets its own dedicated Supabase project, **`threshold-salon`**; the unused **dev DB is deleted** to free a free-tier slot (limit is 2 _active_ projects). The golf app is left untouched.
- Create the Stripe account (Evelyn's business + bank).
- Decide hosting (Option A vs B) and wire the deploy.
- Stand up the data model + seed services from the current site.
- Replace the placeholder phone/email the README flags as launch blockers.

### Phase 1 — "Book Now" (the MVP) 🎯
The thing that replaces the fake "Book now → scroll to contact" links.
- Public booking flow: pick service → see real availability → pick time → enter name/phone/email → confirm.
- Auto-create a client record on first booking.
- Confirmation email to client + notification to Evelyn.
- **`/studio` admin:** calendar/day view, set working hours, block time off, view/reschedule/cancel appointments.
- **Outcome:** clients can actually book online, 24/7. This alone is the core of GlossGenius.

### Phase 2 — Protect the money
- Stripe deposits at booking (per-service deposit amount).
- Card-on-file (Stripe Customer + saved payment method) with **true delete**.
- No-show / late-cancel fee (charged at Evelyn's discretion, one tap).
- Automated **email** confirmations + 24h/48h reminders (scheduled job).
- **Add SMS reminders via Twilio** (this is GlossGenius's standout feature; ~1¢/text).
- **Outcome:** far fewer no-shows; Evelyn's time is financially protected.

### Phase 3 — Client management depth (CRM)
- Full client profiles: service history, notes, preferences, birthdays.
- Before/after photo upload per appointment.
- Intake / consultation forms for new clients (patch test, allergies, goals).
- **Outcome:** the "know your client before they sit down" experience GlossGenius sells.

### Phase 4 — Growth (optional, pick what she wants)
- Automated rebooking nudges ("time for your next color").
- Gift cards; memberships / packages.
- Waitlist / cancellation fill.
- Light marketing (birthday emails, promos) + review requests.
- Simple reporting: revenue, most-popular services, retention.

### Explicitly deferred
- **Inventory management** — not core for a solo service business. Revisit only if she starts retailing product.
- **Multi-stylist / staff** — build for one chair now; the schema won't fight us if she hires later.
- **Native app.**

---

## 6. Cost — us vs. GlossGenius

| Item | Our build | GlossGenius |
|---|---|---|
| Monthly software fee | **$0** (Supabase free, Vercel free) | $24–48/mo |
| Payment processing | Stripe ~2.9% + 30¢ per transaction | 2.6% flat |
| SMS reminders | ~$1/mo number + ~1¢/text (Twilio), optional | included |
| Email | $0 (Resend free ≤3k/mo) | included |
| Domain | already owned | included subdomain |
| **Effective monthly** | **~$0–5** | **~$24–48** |

Processing is slightly cheaper on GlossGenius (2.6% vs ~2.9%); at solo-salon volume the difference is a few dollars a month and is dwarfed by the subscription savings — **and** payouts come straight from Stripe to Evelyn's bank with no third party able to freeze them.

---

## 7. Honest reality-check (build vs. buy)

Because you should decide with eyes open:

- **The case to just buy GlossGenius:** $24/mo is genuinely cheap for a polished, supported product. If booking breaks at 7pm on a Saturday, *their* on-call fixes it — with our build, that's on us.
- **The case to build (why we're here):** full control and personalization, no per-feature paywalls, you own the data and the brand, no fund-withholding risk, near-zero running cost, and it's a genuinely good project. The stack above is chosen specifically to keep *ongoing* maintenance low — the real cost is build time, not upkeep.

My recommendation: **build it**, phase by phase, starting with Phase 1. Ship the booking MVP, let Evelyn use it live, and only add Phases 2–4 as they prove worth it. If Phase 1 ever feels like too much to maintain, GlossGenius is always there as a fallback — and we'd have lost nothing but learned exactly what she needs.

---

## 8. What I need from you to start

1. **Hosting:** OK to move to **Vercel** (Option A, recommended)? Or stay on GitHub Pages (Option B)?
2. **Stripe:** Evelyn will need to create a Stripe account (business name + bank) — that's hers to do, I can't. Fine to plan around that?
3. **SMS at launch or later?** Email-only Phase 1 (free) then add Twilio SMS in Phase 2 is my recommendation.
4. **Green light Phase 1?** If yes, I'll start with Phase 0 setup + the data model.
```