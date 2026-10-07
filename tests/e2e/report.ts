// The walks' report: every step, every check (expected against what the screen
// or database said), and a photo of the screen after each step. One HTML file
// you can open on a phone. Written to e2e-out/<run>/report.html.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Page } from "@playwright/test";
import { auditScreen, taps, type UxFinding } from "./ux";

export type Check = { name: string; ok: boolean; expected?: string; actual?: string };
export type Step = { name: string; ok: boolean; ms: number; shot?: string; error?: string; checks: Check[]; ux: UxFinding[] };
export type Walk = { title: string; why: string; steps: Step[]; taps: number };

const RUN = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
export const OUT = join(process.env.WALKS_OUT ?? "e2e-out", `walks-${RUN}`);
mkdirSync(OUT, { recursive: true });

export const walks: Walk[] = [];

/** A walk: a titled list of steps, each photographed. */
export function walk(title: string, why: string) {
  const w: Walk = { title, why, steps: [], taps: 0 };
  const tapsAtStart = taps.n;
  walks.push(w);
  let n = 0;
  return {
    /** Run one step; check() inside it records expected vs actual. A thrown error fails the step. */
    async step(page: Page, name: string, fn: (check: (name: string, ok: boolean, expected?: unknown, actual?: unknown) => void) => Promise<void>) {
      const checks: Check[] = [];
      const check = (cname: string, ok: boolean, expected?: unknown, actual?: unknown) =>
        checks.push({ name: cname, ok, expected: expected === undefined ? undefined : String(expected), actual: actual === undefined ? undefined : String(actual) });
      const started = Date.now();
      let error: string | undefined;
      try {
        await fn(check);
      } catch (e) {
        error = e instanceof Error ? e.message.split("\n")[0] : String(e);
      }
      const ux = await auditScreen(page).catch(() => []);
      w.taps = taps.n - tapsAtStart;
      const shot = `${walks.length}-${++n}.png`;
      await page.screenshot({ path: join(OUT, shot), fullPage: false }).catch(() => undefined);
      const ok = !error && checks.every((c) => c.ok);
      w.steps.push({ name, ok, ms: Date.now() - started, shot, error, checks, ux });
      if (!ok) {
        const bad = error ?? checks.filter((c) => !c.ok).map((c) => `${c.name}: expected ${c.expected}, got ${c.actual}`).join("; ");
        throw new Error(`${title} → ${name}: ${bad}`);
      }
    },
  };
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function writeReport() {
  writeFileSync(join(OUT, "results.json"), JSON.stringify(walks, null, 2));
  const total = walks.flatMap((w) => w.steps);
  const failed = total.filter((s) => !s.ok).length;
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Threshold walks ${RUN}</title>
<style>
body{font:15px/1.5 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;margin:0;padding:16px;background:#faf7f5;color:#3b2f2a}
h1{font:500 22px Georgia,serif;margin:0 0 4px}.sub{color:#8a7d76;margin:0 0 20px}
section{background:#fff;border:1px solid #eee5e0;border-radius:14px;padding:14px;margin:0 0 16px}
h2{font:500 18px Georgia,serif;margin:0}.why{color:#8a7d76;font-size:13px;margin:2px 0 10px}
.step{border-left:4px solid #1D9E75;padding:6px 10px;margin:10px 0}.step.bad{border-color:#c0392b;background:#fdf1f0}
.checks{font-size:13px;margin:4px 0;padding-left:18px}.checks .bad{color:#c0392b}
img{width:195px;border:1px solid #eee5e0;border-radius:10px;margin-top:6px}
.err{color:#c0392b;font-size:13px}.ux{color:#8a6d10}.recs li{margin:4px 0}
</style></head><body>
<h1>Threshold walks</h1>
<p class="sub">${esc(RUN)} · ${walks.length} walks · ${total.length} steps · ${failed ? `<b style="color:#c0392b">${failed} failed</b>` : "all passed"}</p>
${uxSummary()}
${walks.map((w) => `<section><h2>${w.steps.every((s) => s.ok) ? "✓" : "✗"} ${esc(w.title)}</h2><p class="why">${esc(w.why)} · <b>${w.taps} taps</b></p>
${w.steps.map((s) => `<div class="step${s.ok ? "" : " bad"}"><b>${esc(s.name)}</b> <span class="why">${(s.ms / 1000).toFixed(1)}s</span>
${s.error ? `<div class="err">${esc(s.error)}</div>` : ""}
${s.checks.length ? `<ul class="checks">${s.checks.map((c) => `<li class="${c.ok ? "" : "bad"}">${c.ok ? "✓" : "✗"} ${esc(c.name)}${c.expected !== undefined ? ` — expected <b>${esc(c.expected)}</b>${c.ok ? "" : `, got <b>${esc(c.actual ?? "")}</b>`}` : ""}</li>`).join("")}</ul>` : ""}
${s.ux.length ? `<ul class="checks ux">${s.ux.map((f) => `<li>⚑ ${esc(f.detail)}</li>`).join("")}</ul>` : ""}
${s.shot ? `<a href="${s.shot}"><img src="${s.shot}" alt=""></a>` : ""}</div>`).join("")}
</section>`).join("")}
</body></html>`;
  writeFileSync(join(OUT, "report.html"), html);
  return join(OUT, "report.html");
}

/**
 * The usability findings across every screen, grouped and counted, worst
 * first — the part to read for "what should change", as opposed to "what broke".
 */
function uxSummary(): string {
  const by = new Map<string, { kind: string; detail: string; where: Set<string> }>();
  for (const w of walks)
    for (const s of w.steps)
      for (const f of s.ux) {
        const key = f.kind === "small-target" ? f.detail.replace(/ is \d+×\d+$/, "") : f.kind + f.detail;
        const e = by.get(key) ?? { kind: f.kind, detail: f.detail, where: new Set<string>() };
        e.where.add(w.title);
        by.set(key, e);
      }
  if (by.size === 0) return "";
  const order = ["overflow", "small-target", "small-text", "long-page", "borderline"];
  const items = [...by.values()].sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind) || b.where.size - a.where.size);
  const name: Record<string, string> = {
    overflow: "Wider than the screen",
    "small-target": "Tap target under 32 points",
    borderline: "Borderline targets",
    "small-text": "Text under 12px",
    "long-page": "Long page",
  };
  const tapRows = walks.map((w) => `<li>${esc(w.title)}: <b>${w.taps}</b> taps over ${w.steps.length} steps</li>`).join("");
  return `<section><h2>Usability</h2><p class="why">Found automatically on every screen the walks visited. Recommendations, not failures.</p>
<ul class="checks recs">${items.slice(0, 40).map((i) => `<li><b>${name[i.kind]}</b> — ${esc(i.detail)} <span class="why">(${[...i.where].map(esc).join(", ")})</span></li>`).join("")}</ul>
${items.length > 40 ? `<p class="why">…and ${items.length - 40} more in results.json</p>` : ""}
<p class="why" style="margin-top:12px">Taps per task</p><ul class="checks">${tapRows}</ul></section>`;
}
