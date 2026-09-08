# A2P 10DLC campaign — what to paste into the form

Three rejection cycles so far. This file holds the current submission so the
next one isn't rebuilt from memory.

**Samples are generated from `lib/smsTemplates.ts` and
`app/api/sms/booking-confirm/route.ts`.** If you reword a template, reword the
matching sample here and in the console. Reviewers compare what arrives against
what was described, and a mismatch is a rejection.

## History

| Date | Verdict |
| --- | --- |
| 3 Sep 2026 | Rejected — "a compliant privacy policy can not be verified", and sample 5 had no opt-out. |
| ~6 Sep 2026 | Rejected — same privacy wording. The policy was never the problem: `/book` is a four-step wizard, so a reviewer landing there saw a price list, no checkbox and no fee disclosure. Fixed by publishing `/messaging`. |
| 8 Sep 2026 | **Webform opt-in confirmed compliant.** Three things outstanding: the campaign describes only non-marketing messages while the form collects consent for both; no marketing samples; verbal script not compliant. |

## The mismatch that matters

The booking form has **two** checkboxes — appointment messages and offers. A
campaign that describes only transactional traffic while collecting marketing
consent gets rejected for the inconsistency, every time.

Two ways out. Declaring both is the right one: the form already collects it,
the Reports screen exists to spot empty weeks and Outreach exists to fill them,
and **adding marketing later means another registration cycle**. Dropping the
second checkbox would be faster to approve once and worse forever.

## URLs

| Field | Value |
| --- | --- |
| Privacy policy | `https://threshold.salon/privacy` |
| Terms of service | `https://threshold.salon/terms` |
| Opt-in / message flow | `https://threshold.salon/messaging` |

All must resolve without a redirect — redirecting URLs are a listed rejection
cause, which is why `/terms` is real content rather than a bounce to `/privacy`.

## Campaign description

> Messages are sent by Threshold Salon LLC, trading as Threshold — Studio by
> Evelyn, a hair salon in Kettering, Ohio, to clients who have booked an
> appointment or given their number at the salon. Non-marketing messages include
> appointment confirmations, reminders, appointment changes, and replies from
> the stylist. Marketing messages include occasional promotions, special offers,
> and salon news. Clients opt in separately for each type on the booking form at
> threshold.salon/book, and neither is required in order to book.

Both types named, because both are collected. No PII.

## How end users consent (Message Flow)

Two methods, so both are described — the guide requires a flow for each.

> **Web form.** Clients opt in at https://threshold.salon/book. Step 3 of the
> booking form collects name and mobile number, with two separate checkboxes
> below it: one for appointment messages, one for promotional messages. Neither
> is pre-selected, and consent is not a condition of booking. Because the
> booking form is a multi-step flow, the call-to-action and disclosures exactly
> as displayed at the point of phone number collection are published at
> https://threshold.salon/messaging
>
> **Verbal.** Clients who book by phone or in the salon are asked the script
> below and the answer is recorded on their file with a timestamp.

### Verbal script

Follows the structure the reviewer supplied on 8 Sep: transactional first,
marketing as a separate question, all five disclosures in each.

> **Evelyn:** Would you like to receive text messages from Threshold Salon about
> your appointments — confirmations, reminders, and any changes? Please reply
> yes if this is okay with you. You can opt out at any time by replying STOP.
> Reply HELP for help. Message and data rates may apply. Message frequency
> varies. For privacy and terms, see threshold.salon/privacy and
> threshold.salon/terms.
>
> **Client:** Yes, that's good with me.
>
> **Evelyn:** Would you also like to receive marketing messages from Threshold
> Salon — offers and salon news? This is separate, and saying no to it won't
> affect your appointment texts. You can opt out at any time by replying STOP.
> Reply HELP for help. Message and data rates may apply. Message frequency
> varies. Privacy policy: threshold.salon/privacy. Terms and conditions:
> threshold.salon/terms.
>
> **Client:** Yes, please.

## Sample messages

Placeholders throughout, never a name. The guide is explicit: "Don't include
real consumer names or phone numbers in your descriptions or samples."
Earlier submissions used "Sarah", which reads as real client data.

Every sample carries opt-out language. Stricter than CTIA requires — the
opt-out only has to appear on the first message — but a reviewer reads each
sample in isolation and can't see what came before it.

**1 — Booking confirmation** *(automatic, on booking)*

```
Hi [Name]! You're booked at Threshold for [Service] on [Day, Date, Time]. Tell me about your hair, or change it: https://threshold.salon/appointment/[id] — Evelyn (Reply STOP to opt out.)
```

**2 — Appointment reminder** *(automatic, the day before)*

```
Hi [Name], it's Threshold Salon — you're booked for [Service] [Day, Time]. Reply C to confirm. Tell me about your hair, or change it: https://threshold.salon/appointment/[id] (Reply STOP to opt out.)
```

**3 — Late arrival** *(automatic, past the start time)*

```
Hi [Name], it's Threshold Salon — we had you down for [Time]. Are you still on your way? No rush, just let us know. (Reply STOP to opt out.)
```

**4 — Offer** *(marketing)*

```
Hi [Name], it's Evelyn at Threshold — I've had a cancellation this [Day] at [Time] if you'd like it. Reply here to take it. Msg & data rates may apply. Reply STOP to opt out.
```

**5 — Offer** *(marketing)*

```
[Name], Threshold Salon is doing [Offer] through [Date]. Book at https://threshold.salon/book — Evelyn. Msg & data rates may apply. Reply STOP to opt out.
```

Samples 4 and 5 are the ones added on 8 Sep. Without them the campaign
collects marketing consent it never demonstrates.

## Use case

Collecting both types means the use case has to cover both. `LOW_VOLUME` fits a
single-stylist salon — the guide describes it as "great for brands that need to
cover multiple use cases but won't be sending high volumes". `MIXED` also works
but carries higher cost and lower throughput for no benefit at this size.

## Opt-out, help, and start

Handled at the messaging-service level by Twilio's Advanced Opt-Out, and again
in `app/api/sms/inbound/route.ts`. STOP, START and HELP all work, and `/terms`
documents all three.
