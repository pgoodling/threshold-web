// Transactional email via Resend's REST API.
//
// Deliberately no SDK — this is two fetch calls and the project stays lean.
// Mirrors the Twilio helpers' shape: returns a "not configured" result rather
// than throwing, so callers can degrade quietly instead of failing a booking.
//
// Unlike SMS, appointment email needs no carrier registration. These are
// transactional messages to someone who just booked an appointment, not
// marketing, so they aren't gated on A2P 10DLC. That's the whole reason this
// exists: it works today, while texting waits on vetting.

const TZ = "America/New_York";
const ACCENT = "#bd6b4d";

// Absolute, because an email has no origin to resolve a relative link against.
// Vercel sets VERCEL_PROJECT_PRODUCTION_URL, but the custom domain is what a
// client should see in a link, so that's the default rather than the fallback.
const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://threshold.salon"
).replace(/\/$/, "");

export type SendResult =
  | { ok: true; id: string }
  | { ok: false; reason: "unconfigured" | "error"; detail?: string };

export function emailConfigured() {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

export async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
}): Promise<SendResult> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!key || !from) return { ok: false, reason: "unconfigured" };

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [opts.to],
        subject: opts.subject,
        html: opts.html,
        text: opts.text,
        reply_to: opts.replyTo ?? process.env.EMAIL_REPLY_TO ?? undefined,
      }),
    });
    if (!res.ok) {
      return { ok: false, reason: "error", detail: await res.text() };
    }
    const json = (await res.json()) as { id?: string };
    return { ok: true, id: json.id ?? "" };
  } catch (e) {
    return {
      ok: false,
      reason: "error",
      detail: e instanceof Error ? e.message : "send failed",
    };
  }
}

export const longWhen = (iso: string) =>
  new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// One layout for both emails. Table-based with inline styles because email
// clients are still, in 2026, email clients.
function shell(bodyHtml: string) {
  return `<!doctype html><html><body style="margin:0;padding:0;background:#faf7f5;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#faf7f5;padding:32px 16px;">
  <tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border:1px solid #eee5e0;border-radius:16px;">
      <tr><td style="padding:32px 32px 8px 32px;font-family:Georgia,'Times New Roman',serif;font-size:22px;color:${ACCENT};">
        Threshold
      </td></tr>
      <tr><td style="padding:0 32px 32px 32px;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#3b2f2a;">
        ${bodyHtml}
      </td></tr>
    </table>
    <div style="max-width:520px;margin-top:16px;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:12px;line-height:1.5;color:#8a7d76;text-align:center;">
      Threshold &mdash; Studio by Evelyn &middot; Salon Lofts, 424 E Stroop Rd, Kettering, OH 45429<br>
      <a href="tel:+19379362138" style="color:#8a7d76;">(937) 936-2138</a> &middot;
      <a href="https://threshold.salon/privacy" style="color:#8a7d76;">Privacy</a>
    </div>
  </td></tr>
</table>
</body></html>`;
}

type ApptEmail = {
  firstName: string;
  service: string;
  startsAt: string;
  kind: "confirmation" | "reminder";
  /** Appointment id, so the mail can link to the hair-notes form. */
  appointmentId?: string | null;
};

export function appointmentEmail({
  firstName,
  service,
  startsAt,
  kind,
  appointmentId,
}: ApptEmail) {
  const when = longWhen(startsAt);
  const hi = `Hi ${firstName},`;
  const lead =
    kind === "confirmation"
      ? "You're booked! Here are the details:"
      : "Just a reminder about your appointment:";
  const tail =
    kind === "confirmation"
      ? "Need to change or cancel? Just reply to this email or give us a call — 24 hours' notice and there's no charge."
      : "If anything's changed, reply to this email or give us a call and we'll sort it out.";

  const subject =
    kind === "confirmation"
      ? `You're booked — ${service}, ${when}`
      : `Reminder: ${service} on ${when}`;

  // The hair-notes form, in both the confirmation and the reminder. The
  // reminder is arguably the better of the two: the day before is when someone
  // actually thinks to photograph their roots.
  const notesUrl = appointmentId
    ? `${SITE_URL}/hair-notes/${appointmentId}`
    : null;
  const notesLead =
    kind === "confirmation"
      ? "One optional extra: tell Evelyn about your hair before you come in — a minute of questions and a photo or two means your appointment is spent on your hair rather than on questions."
      : "Not filled in your hair notes yet? There's still time — it helps Evelyn have everything ready for you.";

  const text = `${hi}

${lead}

${service}
${when}

${tail}
${notesUrl ? `\n${notesLead}\n${notesUrl}\n` : ""}
— Evelyn
Threshold — Studio by Evelyn
(937) 936-2138`;

  const html = shell(`
    <p style="margin:0 0 16px 0;">${esc(hi)}</p>
    <p style="margin:0 0 20px 0;">${esc(lead)}</p>
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-left:3px solid ${ACCENT};background:#fdf8f6;border-radius:0 8px 8px 0;">
      <tr><td style="padding:16px 20px;">
        <div style="font-weight:600;font-size:16px;">${esc(service)}</div>
        <div style="margin-top:4px;color:#6b5d56;">${esc(when)}</div>
      </td></tr>
    </table>
    <p style="margin:20px 0 0 0;">${esc(tail)}</p>
    ${
      notesUrl
        ? `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin-top:24px;border-top:1px solid #e6ddd6;">
      <tr><td style="padding:20px 0 0 0;">
        <p style="margin:0 0 14px 0;color:#6b5d56;">${esc(notesLead)}</p>
        <a href="${esc(notesUrl)}" style="display:inline-block;background:${ACCENT};color:#ffffff;text-decoration:none;padding:11px 20px;border-radius:6px;font-weight:600;">Tell Evelyn about my hair</a>
      </td></tr>
    </table>`
        : ""
    }
    <p style="margin:24px 0 0 0;">&mdash; Evelyn</p>
  `);

  return { subject, html, text };
}
