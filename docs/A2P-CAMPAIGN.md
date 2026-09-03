# A2P 10DLC campaign — what to paste into the form

Rejected once, on 3 September 2026: *"a compliant privacy policy can not be
verified"*, plus sample message 5 failing the opt-out check. This file exists so
the third submission doesn't have to be reconstructed from memory, and so the
samples can be checked against the code that actually sends them.

**These samples are generated from `lib/smsTemplates.ts` and
`app/api/sms/booking-confirm/route.ts`.** If you reword a template, reword the
matching sample here and in the Twilio console. Carriers compare what arrives
against what was described, and a mismatch is a rejection.

## URLs

| Field | Value |
| --- | --- |
| Privacy policy | `https://threshold.salon/privacy` |
| Terms of service | `https://threshold.salon/terms` |
| Opt-in form | `https://threshold.salon/book` |

All three must resolve without a redirect. Redirecting URLs are themselves a
listed rejection cause, which is why `/terms` is real content rather than a
bounce to `/privacy`.

## How end users consent

> Clients opt in on the booking form at threshold.salon/book. Two separate
> checkboxes, neither pre-selected, one for appointment messages and one for
> promotional messages. Consent is not a condition of booking. Clients who book
> by phone or in person are asked the same question verbally and the answer is
> recorded on their file with a timestamp.

The disclosure text next to the box is `SMS_CONSENT_TEXT` in
`lib/smsConsent.ts`, quoted verbatim on both policy pages.

## Sample messages

Every one carries opt-out language. That's stricter than CTIA requires — the
opt-out only has to appear on the first message — but a reviewer reads each
sample in isolation and can't see that the confirmation carried it. See the note
at the top of `lib/smsTemplates.ts`.

**1 — Booking confirmation** *(automatic, on booking)*

```
Hi Sarah! You're booked at Threshold for Blonding Session on Fri, Sep 25, 1:00 PM. Tell me about your hair, or change it: https://threshold.salon/appointment/9c4f2b1e-0a77-4c31-9d55-6b2ee9f3a410 — Evelyn (Reply STOP to opt out.)
```

**2 — Appointment reminder** *(automatic, the day before)*

```
Hi Sarah, it's Threshold Salon — you're booked for Blonding Session Friday 1:00 PM. Reply C to confirm. Tell me about your hair, or change it: https://threshold.salon/appointment/9c4f2b1e-0a77-4c31-9d55-6b2ee9f3a410 (Reply STOP to opt out.)
```

**3 — Acknowledgement** *(automatic, after the client replies C)*

```
Lovely — you're confirmed for Friday 1:00 PM. See you then! Threshold Salon (Reply STOP to opt out.)
```

**4 — Late arrival** *(automatic, past the start time)*

```
Hi Sarah, it's Threshold Salon — we had you down for 1:00 PM. Are you still on your way? No rush, just let us know. (Reply STOP to opt out.)
```

**5 — Reply from the stylist** *(sent by hand, in conversation)*

```
Hi Sarah — I've got 2:00 on the 14th if that works better for you. Want me to move you across? — Evelyn, Threshold Salon (Reply STOP to opt out.)
```

Sample 5 was the one that failed. It is now a conversational reply, which is
what the free-form send path in `app/api/sms/send/route.ts` actually produces,
rather than anything promotional. Promotional traffic has its own consent
checkbox and isn't being sent yet — don't describe it in a transactional
campaign just because the field is there.

## Opt-out, help, and start

Handled at the messaging-service level by Twilio's Advanced Opt-Out, and
honoured again in `app/api/sms/inbound/route.ts`. STOP, START and HELP all
work; the terms page documents all three.
