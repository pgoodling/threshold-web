import twilio from "twilio";

// Shared plumbing for the Twilio webhooks (SMS inbound + the voice routes).
//
// Every one of these endpoints is a public URL that Twilio POSTs form-encoded
// data to. Two things are true of all of them: the request must be proven to
// come from Twilio, and the reply is TwiML rather than JSON. Both live here so
// a new webhook can't accidentally skip the signature check.

export type TwilioParams = Record<string, string>;

// Twilio posts form-encoded; signature validation needs the params as a plain
// object, so parse once and hand back both.
export async function readParams(req: Request): Promise<TwilioParams> {
  const form = await req.formData();
  const params: TwilioParams = {};
  for (const [k, v] of form.entries()) params[k] = String(v);
  return params;
}

// The URL Twilio signed. It signs the exact URL it requested — including the
// query string — so callers pass the path with any query intact.
export function webhookUrl(req: Request, pathWithQuery: string): string {
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  const host = req.headers.get("host") ?? "";
  return `${proto}://${host}${pathWithQuery}`;
}

// True when the request is genuinely from Twilio, signed with our auth token.
export function isFromTwilio(
  req: Request,
  params: TwilioParams,
  url: string,
): boolean {
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!token) return false;
  const signature = req.headers.get("x-twilio-signature") ?? "";
  return twilio.validateRequest(token, signature, url, params);
}

// TwiML response. Twilio ignores anything that isn't XML, so the content type
// matters as much as the body.
export function xml(body = ""): Response {
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?><Response>${body}</Response>`,
    { headers: { "Content-Type": "text/xml" } },
  );
}

// Anything interpolated into TwiML has to be escaped — a client called
// "Tom & Jerry" would otherwise produce malformed XML and Twilio would drop the
// call rather than say the name.
export function escapeXml(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
