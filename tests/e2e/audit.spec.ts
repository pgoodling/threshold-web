// The button audit: every screen of the website, booking and studio at phone
// size, every tappable thing measured and sorted by what it is -- back, close,
// arrow, icon, primary, secondary, text link, tab, choice, field -- with a
// photo of each screen where anything under 44 points is outlined in red.
//
//   npm run audit        → e2e-out/audit/report.html (+ audit.json)
//
// Not a test of behaviour: it reports, it doesn't fail. Runs on the rig.

import { test, expect, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { rig, seed, studioUser, db } from "./rig";

test.describe.configure({ mode: "serial" });

const OUT = join("e2e-out", "audit");
type Control = {
  kind: string;
  label: string;
  w: number;
  h: number;
  font: number;
  radius: string;
};
type Screen = { name: string; area: string; controls: Control[]; shot: string; error?: string };
const screens: Screen[] = [];
let page: Page;

async function measure(): Promise<Control[]> {
  return page.evaluate(() => {
    const accent = ["rgb(189, 107, 77)", "rgb(153, 82, 58)"];
    const visible = (el: Element) => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none" && Number(s.opacity) > 0.05;
    };
    const out: { kind: string; label: string; w: number; h: number; font: number; radius: string }[] = [];
    document.querySelectorAll("[data-audit-small]").forEach((e) => e.removeAttribute("data-audit-small"));
    for (const el of document.querySelectorAll("button, a[href], [role=button], select, input:not([type=hidden]), textarea, summary")) {
      if (!visible(el)) continue;
      const he = el as HTMLElement;
      const s = getComputedStyle(he);
      const text = (he.innerText || "").replace(/\s+/g, " ").trim();
      const aria = he.getAttribute("aria-label") || "";
      const label = (aria || text || (he as HTMLInputElement).placeholder || he.tagName).slice(0, 48);
      const hasSvg = !!he.querySelector("svg");
      const cls = he.className && typeof he.className === "string" ? he.className : "";
      let kind: string;
      const tag = he.tagName;
      const type = (he as HTMLInputElement).type;
      if (tag === "INPUT" && (type === "checkbox" || type === "radio")) kind = "checkbox";
      else if (/^(INPUT|SELECT|TEXTAREA)$/.test(tag)) kind = "field";
      else if (/close/i.test(aria) || /^[✕×x]$/i.test(text)) kind = "close";
      else if (/^(←|‹)|\bback\b|^change (service|time)|^back to/i.test(text) || /back/i.test(aria) || (he.querySelector(".lucide-chevron-left") && text.length < 30))
        kind = "back";
      else if (/previous|next/i.test(aria) || /^[‹›<>]$/.test(text)) kind = "arrow";
      else if (!text && hasSvg) kind = "icon";
      else if (he.getAttribute("aria-pressed") !== null) kind = "choice";
      else if (/border-b-2/.test(cls)) kind = "tab";
      else if (accent.includes(s.backgroundColor)) kind = "primary";
      else if (s.borderTopWidth !== "0px" && s.borderTopStyle !== "none" && s.backgroundColor !== "rgba(0, 0, 0, 0)" && he.getBoundingClientRect().height < 70)
        kind = "secondary";
      else if (s.borderTopWidth !== "0px" && s.borderTopStyle !== "none" && he.getBoundingClientRect().height < 70) kind = "secondary";
      else if (he.getBoundingClientRect().height >= 56 || he.getBoundingClientRect().width > window.innerWidth * 0.8) kind = "row";
      else kind = "text";
      // What a finger hits: a checkbox's label, a field's bordered box.
      let target: Element = he;
      if (kind === "checkbox") target = he.closest("label") ?? he;
      const r = target.getBoundingClientRect();
      if (Math.min(r.width, r.height) < 44 && kind !== "field") (target as HTMLElement).setAttribute("data-audit-small", "");
      out.push({ kind, label, w: Math.round(r.width), h: Math.round(r.height), font: parseFloat(s.fontSize), radius: s.borderRadius });
    }
    return out;
  });
}

async function look(name: string, area: string, go: () => Promise<void>) {
  const shot = `${screens.length + 1}-${name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.png`;
  try {
    await go();
    await page.waitForTimeout(400);
    const controls = await measure();
    await page.addStyleTag({ content: "[data-audit-small]{outline:2px solid #e11d48 !important;outline-offset:1px}" });
    await page.screenshot({ path: join(OUT, shot), fullPage: true });
    screens.push({ name, area, controls, shot });
  } catch (e) {
    screens.push({ name, area, controls: [], shot: "", error: String(e).split("\n")[0] });
  }
}

const studio = (hash: string) => page.goto(`/studio?a=${Date.now()}#${hash}`).then(() => page.waitForLoadState("networkidle"));

test.beforeAll(async ({ browser }) => {
  mkdirSync(OUT, { recursive: true });
  const r = rig();
  await seed(r);
  const user = await studioUser(r);
  page = await (await browser.newContext()).newPage();
  await page.goto("/studio");
  await page.locator('input[type="email"]').fill(user.email);
  await page.locator('input[type="password"]').fill(user.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("button", { name: "Menu" })).toBeVisible({ timeout: 30_000 });
});

test("audit every screen", async () => {
  const sql = await db(rig());
  const apptId = (await sql.query(
    `select a.id from appointments a join clients c on c.id = a.client_id where c.full_name = 'Sarah Jenkins' order by a.starts_at desc limit 1`)).rows[0].id;
  await sql.end();

  // ---- Website and booking ----
  await look("Home", "website", async () => void (await page.goto("/")));
  await look("Products", "website", async () => void (await page.goto("/products")));
  await look("Privacy", "website", async () => void (await page.goto("/privacy")));
  await look("Book: services", "booking", async () => void (await page.goto("/book")));
  await look("Book: pick a time", "booking", async () => {
    await page.getByRole("button", { name: /Cut & Style/ }).first().click();
    await expect(page.getByText("Finding open times…")).toBeHidden();
    await page.locator("button.aspect-square:not([disabled])").first().click();
  });
  await look("Book: your details", "booking", async () => {
    await page.getByRole("button", { name: /^\d{1,2}:\d{2} (AM|PM)$/ }).first().click();
    await expect(page.getByRole("heading", { name: "Your details" })).toBeVisible();
  });
  await look("Appointment page (client)", "booking", async () => void (await page.goto(`/appointment/${apptId}`)));
  await look("Hair notes form (client)", "booking", async () => void (await page.goto(`/hair-notes/${apptId}`)));

  // ---- Studio ----
  await look("Menu (phone)", "studio", async () => {
    await studio("overview");
    await page.getByRole("button", { name: "Menu" }).click();
  });
  await look("Overview", "studio", () => studio("overview"));
  await look("To-do", "studio", () => studio("tasks"));
  await look("Calendar: month", "studio", () => studio("calendar"));
  await look("Calendar: day", "studio", async () => {
    await studio("calendar");
    await page.getByRole("button", { name: "day", exact: true }).click();
  });
  await look("Calendar: + New menu", "studio", async () => {
    await page.getByRole("button", { name: "+ New" }).click();
  });
  await look("Appointment window", "studio", async () => {
    await studio("calendar");
    await page.getByRole("button", { name: "day", exact: true }).click();
    await page.getByText("2:00 PM Sarah").click();
  });
  await look("Check-out", "studio", async () => {
    await page.getByRole("button", { name: "Check out", exact: true }).click();
  });
  await look("Upcoming", "studio", () => studio("appointments"));
  await look("New appointment", "studio", async () => {
    await page.getByRole("button", { name: "+ New appointment" }).click();
  });
  await look("Time off", "studio", () => studio("timeoff"));
  await look("Clients", "studio", () => studio("clients"));
  await look("Client: Sarah", "studio", async () => {
    await page.getByText("Sarah Jenkins").first().click();
  });
  await look("Client: hair notes", "studio", async () => {
    await page.getByRole("button", { name: "Hair notes" }).click();
  });
  await look("Outreach", "studio", () => studio("outreach"));
  await look("Messages", "studio", () => studio("messages"));
  await look("To send", "studio", () => studio("texts"));
  await look("Inventory", "studio", () => studio("inventory"));
  await look("Inventory: a product", "studio", async () => {
    await page.getByText("Strengthening Shampoo", { exact: true }).click();
  });
  await look("Inventory: Sell", "studio", async () => {
    await studio("inventory");
    await page.getByRole("button", { name: "Sell", exact: true }).click();
  });
  await look("Inventory: Add stock", "studio", async () => {
    await studio("inventory");
    await page.getByRole("button", { name: "Add stock", exact: true }).click();
  });
  await look("Inventory: Activity", "studio", () => studio("inventory/activity"));
  await look("Money: Overview", "studio", () => studio("money/overview"));
  await look("Money: Bank", "studio", () => studio("money/bank"));
  await look("Money: Taxes", "studio", () => studio("money/taxes"));
  await look("Money: Year-end", "studio", async () => {
    await page.getByRole("button", { name: /Year-end summary/ }).click();
  });
  await look("Money: Services", "studio", () => studio("money/services"));
  await look("Money: a service", "studio", async () => {
    await page.getByRole("button", { name: /Cut & Style/ }).first().click();
  });
  await look("Reports", "studio", () => studio("reports"));
  await look("Settings", "studio", () => studio("settings"));
  await look("Hours", "studio", () => studio("hours"));
  await look("Services (settings)", "studio", () => studio("services"));
});

test.afterAll(() => {
  writeFileSync(join(OUT, "audit.json"), JSON.stringify(screens, null, 1));
  const all = screens.flatMap((s) => s.controls.map((c) => ({ ...c, screen: s.name, area: s.area })));
  const kinds = [...new Set(all.map((c) => c.kind))];
  const rows = kinds
    .map((k) => {
      const cs = all.filter((c) => c.kind === k && k !== "field");
      const small = cs.filter((c) => Math.min(c.w, c.h) < 44);
      const hs = cs.map((c) => c.h).sort((a, b) => a - b);
      return { k, n: cs.length, small: small.length, min: hs[0], med: hs[Math.floor(hs.length / 2)], ex: small.slice(0, 6) };
    })
    .filter((r) => r.n);
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const html = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Button audit</title>
<style>body{font:14px system-ui;margin:16px;max-width:900px}table{border-collapse:collapse;width:100%}td,th{border-bottom:1px solid #ddd;padding:4px 6px;text-align:left;vertical-align:top}img{width:260px;border:1px solid #ccc;margin:4px}figure{display:inline-block;margin:0 8px 8px 0;vertical-align:top}figcaption{font-size:12px}</style>
<h1>Button audit · ${new Date().toISOString().slice(0, 16)}</h1>
<p>${screens.length} screens, ${all.length} controls. Red outline = under 44 points.</p>
<table><tr><th>Kind</th><th>Count</th><th>Under 44</th><th>Height min / median</th><th>Examples under 44</th></tr>
${rows.map((r) => `<tr><td>${r.k}</td><td>${r.n}</td><td>${r.small}</td><td>${r.min} / ${r.med}</td><td>${r.ex.map((e) => `${esc(e.label)} <small>(${e.w}×${e.h}, ${e.screen})</small>`).join("<br>")}</td></tr>`).join("")}
</table>
<h2>Screens</h2>
${screens.map((s) => `<figure>${s.shot ? `<img src="${s.shot}">` : ""}<figcaption>${esc(s.name)}${s.error ? ` — <b>${esc(s.error)}</b>` : ` · ${s.controls.filter((c) => c.kind !== "field" && Math.min(c.w, c.h) < 44).length} small`}</figcaption></figure>`).join("")}`;
  writeFileSync(join(OUT, "report.html"), html);
  console.log(`\n  Audit: ${join(OUT, "report.html")}\n`);
});
