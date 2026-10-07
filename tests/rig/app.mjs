// Starts the app for the test rig: a dev server on http://127.0.0.1:3200
// against the LOCAL Supabase (docs/TESTING.md). Playwright runs this itself.
//
// Two things it must get right:
//
//  1. It must never reach Evelyn's database. The Supabase URL comes from the
//     rig's own `supabase status`, and anything that isn't this machine stops
//     the launch.
//
//  2. It must never text, email or charge anyone. .env.local holds the real
//     Twilio, Stripe and Resend keys, and Next would read them. Variables
//     already set in the environment win over .env files, so every key named
//     in .env.local or .env.example — and every service key the code reads —
//     is set here first: the rig's own value where it has one, empty
//     otherwise. Empty reads as "not configured", and those features stop.

import { spawn, execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const PORT = process.env.RIG_APP_PORT ?? "3200";
const LOCAL = /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?(\/|$)/;

const status = JSON.parse(
  execSync("npx supabase status --workdir tests/rig -o json", { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }),
);
if (!LOCAL.test(status.API_URL)) throw new Error(`The rig only runs against this machine. Got ${status.API_URL}.`);

const keys = new Set([
  "RESEND_API_KEY", "EMAIL_FROM", "STRIPE_SECRET_KEY", "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", "STRIPE_WEBHOOK_SECRET",
  "TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_PHONE_NUMBER", "TWILIO_MESSAGING_SERVICE_SID",
  "SALON_OWNER_PHONE", "SALON_OWNER_EMAIL", "EMAIL_REPLY_TO", "TWILIO_WEBHOOK_URL", "CRON_SECRET", "VERCEL_OIDC_TOKEN", "OPENAI_API_KEY", "ANTHROPIC_API_KEY",
]);
for (const f of [".env.local", ".env", ".env.development", ".env.development.local", ".env.example"]) {
  const p = join(root, f);
  if (!existsSync(p)) continue;
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=/.exec(line);
    if (m) keys.add(m[1]);
  }
}

const env = { ...process.env };
for (const k of keys) env[k] = "";
Object.assign(env, {
  NEXT_PUBLIC_SUPABASE_URL: status.API_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: status.ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY,
  NEXT_PUBLIC_SITE_URL: `http://127.0.0.1:${PORT}`,
  SMS_AUTOMATION_ENABLED: "false",
  NEXT_DIST_DIR: ".next-rig",
  NEXT_TELEMETRY_DISABLED: "1",
});

const child = spawn("npx", ["next", "dev", "-p", PORT, "-H", "127.0.0.1"], { cwd: root, env, stdio: "inherit", shell: true });
child.on("exit", (code) => process.exit(code ?? 0));
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => child.kill(sig));
