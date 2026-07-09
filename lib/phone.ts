// Normalize a US phone number to E.164 (+1XXXXXXXXXX) for Twilio.
export function toE164(raw: string): string {
  if (!raw) return raw;
  if (raw.startsWith("+")) return raw;
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return `+${digits}`;
}

// Last 10 digits — used to match an inbound number against stored client phones
// regardless of formatting ("937-555-0110" vs "+19375550110").
export function last10(raw: string): string {
  return (raw || "").replace(/\D/g, "").slice(-10);
}
