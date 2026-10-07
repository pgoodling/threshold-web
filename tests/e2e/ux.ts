// A usability look at every screen the walks visit — recommendations, not
// failures, because each needs judgement.
//
//   small targets   anything tappable under 32 points across (Apple asks for 44;
//                   32–44 is only counted); she uses this between clients,
//                   often with colour on her hands
//   small text      visible text under 12px — hard to read at arm's length
//   overflow        anything wider than the screen, which means sideways
//                   scrolling on a phone
//   long page       how many screen-heights the page runs to
//
// Taps per walk are counted separately (installTapCounter) so a task that
// quietly gets longer after a change shows up in the report.

import type { Page } from "@playwright/test";

export type UxFinding = { kind: "small-target" | "borderline" | "small-text" | "overflow" | "long-page"; detail: string };

export async function auditScreen(page: Page): Promise<UxFinding[]> {
  return page.evaluate(() => {
    const out: { kind: "small-target" | "borderline" | "small-text" | "overflow" | "long-page"; detail: string }[] = [];
    const vw = document.documentElement.clientWidth;
    const vh = window.innerHeight;
    const visible = (el: Element) => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none" && Number(s.opacity) > 0.05;
    };
    const label = (el: Element) =>
      ((el.getAttribute("aria-label") || (el as HTMLElement).innerText || (el as HTMLInputElement).placeholder || el.tagName) ?? "")
        .replace(/\s+/g, " ").trim().slice(0, 40);

    // Small tap targets. Checkboxes count with their label, which is what a finger hits.
    const seen = new Set<string>();
    let borderline = 0;
    for (const el of document.querySelectorAll("button, a[href], input, select, textarea, [role=button]")) {
      if (!visible(el)) continue;
      if ((el as HTMLInputElement).type === "hidden" || (el as HTMLButtonElement).disabled) continue;
      // What a finger actually hits: a checkbox's label, or the bordered box a
      // text field sits in (the bare <input> inside it is only 24 points tall).
      let target: Element = (el as HTMLInputElement).type === "checkbox" ? el.closest("label") ?? el : el;
      if (/^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName) && (el as HTMLInputElement).type !== "checkbox") {
        const box = el.parentElement;
        if (box && box.getBoundingClientRect().height >= el.getBoundingClientRect().height && box.getBoundingClientRect().height <= 64) target = box;
      }
      const r = target.getBoundingClientRect();
      // Under 32 points in either direction is a genuine miss-tap risk. 32–43 is
      // where most of the studio's buttons sit (40–42 tall); flagging every one
      // would bury the real problems, so those are only counted.
      const small = Math.min(r.width, r.height);
      if (small < 44) {
        const name = label(target);
        if (!name || seen.has(name)) continue;
        seen.add(name);
        if (small < 32) out.push({ kind: "small-target", detail: `"${name}" is ${Math.round(r.width)}×${Math.round(r.height)}` });
        else borderline++;
      }
    }

    if (borderline) out.push({ kind: "borderline", detail: `${borderline} tap targets between 32 and 44 points` });

    // Small text: the smallest visible text, and what it says.
    let smallest = Infinity;
    let smallestText = "";
    let smallCount = 0;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const t = walker.currentNode.textContent?.trim();
      const el = walker.currentNode.parentElement;
      if (!t || !el || !visible(el)) continue;
      const size = parseFloat(getComputedStyle(el).fontSize);
      if (size < 12) {
        smallCount++;
        if (size < smallest) {
          smallest = size;
          smallestText = t.slice(0, 30);
        }
      }
    }
    if (smallCount) out.push({ kind: "small-text", detail: `${smallCount} pieces of text under 12px; smallest ${smallest}px ("${smallestText}")` });

    // Sideways overflow.
    if (document.documentElement.scrollWidth > vw + 1) {
      out.push({ kind: "overflow", detail: `page is ${document.documentElement.scrollWidth}px wide on a ${vw}px screen` });
    }

    const screens = document.documentElement.scrollHeight / vh;
    if (screens > 3) out.push({ kind: "long-page", detail: `${screens.toFixed(1)} screen-heights long` });
    return out;
  });
}

/**
 * Counts real taps on the page, so each walk can say how many it took. The
 * count lives in the test runner, not the page, so it survives reloads.
 */
export const taps = { n: 0 };
export async function installTapCounter(page: Page) {
  await page.exposeFunction("__walkTap", () => {
    taps.n += 1;
  });
  await page.addInitScript(() => {
    window.addEventListener("click", () => (window as unknown as { __walkTap: () => void }).__walkTap(), true);
  });
}
