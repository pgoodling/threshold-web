// Walks: the studio clicked through like a person, on the LOCAL test rig
// (docs/TESTING.md). `npm run walks`.
//
// The app is started by tests/rig/app.mjs against the local Supabase, with
// every real Twilio/Stripe/Resend key blanked. Installed Chrome; nothing is
// downloaded. Phone-sized, because that's how Evelyn uses it.

import { defineConfig } from "@playwright/test";

const PORT = process.env.RIG_APP_PORT ?? "3200";

export default defineConfig({
  testDir: "./tests/e2e",
  workers: 1,
  fullyParallel: false,
  timeout: 5 * 60_000,
  reporter: [["list"]],
  outputDir: "test-results",
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    channel: "chrome",
    headless: true,
    actionTimeout: 15_000,
    navigationTimeout: 60_000,
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    timezoneId: "America/New_York",
  },
  webServer: {
    command: "node tests/rig/app.mjs",
    url: `http://127.0.0.1:${PORT}/studio`,
    reuseExistingServer: true,
    timeout: 240_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
