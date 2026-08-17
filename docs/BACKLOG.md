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
- ✅ **Command-center redesign (Design C)** — shipped [PR #25]. Left **sidebar** nav with icons (lucide-react) → mobile hamburger; **greeting**, **"needs attention"** banner (running-late clients + unread-texts link), and a **"taken today"** ($ from checkouts) stat; today's-schedule rows show **status as a left stripe** + **service type as a fixed-width solid color block flush right** (no pills). Status colors: green=checked in, charcoal=checked out, red=running late. Service colors (now in `lib/format` `serviceColors`, shared with Calendar): Highlights=soft yellow, Custom Color=peach, Cut and Style=rose, Treatments=lavender, Blowouts=clay, Men's=blue.

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

**Blocker to build:** Evelyn's Stripe account (business + bank for payouts). **Tech note:** Stripe's secret key must run server-side — plan is Supabase Edge Functions (keeps the current static site as-is); deploying those needs the Supabase MCP pointed at the salon project or Paul deploying via CLI/dashboard.

---

## ❓ Open questions
1. ~~Online deposits vs in-person only~~ — **DECIDED:** card-on-file for all + per-service deposits, via Stripe; in-person via Intuit.
2. Which **services get a deposit**, and how much? (Evelyn can set these in the Services tab now.)
3. Real **phone + email** for the site?
4. ~~No-show/cancellation policy~~ — **DECIDED:** 24h notice; late cancels / no-shows may be charged up to full service price, at Evelyn's discretion.
5. Booking **min-notice, buffer, and max-advance** numbers?
6. Reminder timing — 24h, 48h, or both?
