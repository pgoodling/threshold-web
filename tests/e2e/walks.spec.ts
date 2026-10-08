// Walks: the studio clicked through like a person, on the LOCAL rig, with the
// screen checked against answers worked out by hand (tests/e2e/rig.ts EXPECT)
// and, where it matters, the database checked behind it.
//
//   npm run walks          → e2e-out/walks-<run>/report.html
//
// One signed-in phone, walks in order. A fresh salon is seeded before the run.

import { test, expect, type Page } from "@playwright/test";
import type { Client } from "pg";
import { rig, seed, studioUser, db, dates, EXPECT } from "./rig";
import { walk, writeReport } from "./report";
import { installTapCounter } from "./ux";

test.describe.configure({ mode: "serial" });

let page: Page;
let sql: Client;

const money = (cents: number) => `$${Math.round(Math.abs(cents) / 100).toLocaleString("en-US")}`;
const monthName = (ym: string) =>
  new Date(`${ym}-15T12:00:00Z`).toLocaleDateString("en-US", { month: "long", timeZone: "UTC" });

test.beforeAll(async ({ browser }) => {
  const r = rig();
  await seed(r);
  sql = await db(r);
  const user = await studioUser(r);
  page = await (await browser.newContext()).newPage();
  await installTapCounter(page);
  await page.goto("/studio");
  await page.locator('input[type="email"]').fill(user.email);
  await page.locator('input[type="password"]').fill(user.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  // The studio's own menu button exists only once she's in. Waiting for the
  // words "Sign in" to go isn't enough: they read "Signing in…" mid-way.
  await expect(page.getByRole("button", { name: "Menu" })).toBeVisible({ timeout: 30_000 });
});

test.afterAll(async () => {
  const where = writeReport();
  console.log(`\n  Report: ${where}\n`);
  await sql?.end();
});

/** Go to a studio page by its address, the way a bookmark would. */
async function open(hash: string) {
  // A fresh load every time: going to the same address with only the #part
  // changed keeps whatever panel was open, and the next walk starts mid-task.
  await page.goto(`/studio?walk=${Date.now()}#${hash}`);
  await page.waitForLoadState("networkidle");
}

const stock = async (namePart: string) =>
  (await sql.query(`select on_hand::float shelf, on_bar::float bar, retail_price_cents from product_stock where name like $1`, [`%${namePart}%`]))
    .rows[0] as { shelf: number; bar: number; retail_price_cents: number | null };

// ---------------------------------------------------------------------------

test("Inventory: shelf and back bar", async () => {
  const w = walk("Inventory: shelf and back bar", "A bottle goes on the bar, gets finished; a product with none on the shelf can't be opened.");

  await w.step(page, "Open Inventory: names read in full under their range", async (check) => {
    await open("inventory");
    await expect(page.getByText("Keune · Long & Strong")).toBeVisible();
    check("range heading shown", await page.getByText("Keune · Long & Strong").isVisible());
    check("product named without range or size", await page.getByText("Strengthening Shampoo", { exact: true }).isVisible());
  });

  await w.step(page, "Put one shampoo on the bar", async (check) => {
    await page.getByText("Strengthening Shampoo", { exact: true }).click();
    await page.getByRole("button", { name: "Put one on bar" }).click();
    await expect(page.getByText("1 to the back bar").first()).toBeVisible();
    const s = await stock("Strengthening Shampoo");
    check("shelf in the database", s.shelf === 1, 1, s.shelf);
    check("bar in the database", s.bar === 1, 1, s.bar);
  });

  await w.step(page, "Finish it", async (check) => {
    await page.getByRole("button", { name: "Finished one" }).click();
    await expect(page.getByText(/^.* · finished$/).first()).toBeVisible();
    const s = await stock("Strengthening Shampoo");
    check("shelf unchanged", s.shelf === 1, 1, s.shelf);
    check("bar empty", s.bar === 0, 0, s.bar);
  });

  await w.step(page, "A product with none on the shelf can't go on the bar", async (check) => {
    await page.getByText("Anti-frizz Mask", { exact: true }).click();
    const none = page.getByRole("button", { name: "None on the shelf" });
    await expect(none).toBeVisible();
    check("button disabled", await none.isDisabled());
    check("no 'Put one on bar' offered", (await page.getByRole("button", { name: "Put one on bar" }).count()) === 0);
  });
});

test("Inventory: pricing what she sells", async () => {
  const w = walk("Inventory: pricing what she sells", "The Needs price list takes a price in place, and shows the cost beside it.");

  await w.step(page, "Needs price lists the serum, with its cost", async (check) => {
    await open("inventory");
    await page.getByRole("button", { name: /Needs price 1/ }).click();
    await expect(page.getByText("Super Serum", { exact: true })).toBeVisible();
    check("cost shown beside the price", await page.getByText("$23.00").isVisible(), "$23.00");
  });

  await w.step(page, "Type $50 and it saves", async (check) => {
    const box = page.locator("input[inputmode='decimal']").first();
    await box.fill("50");
    await box.press("Enter");
    await expect.poll(async () => (await stock("Super Serum")).retail_price_cents, { timeout: 10_000 }).toBe(5000);
    check("price in the database", true, "5000 cents", "5000 cents");
  });
});

test("Money: Taxes", async () => {
  const w = walk("Money: Taxes", "Sales tax collected shows for the year; income tax is worked out from last month's profit.");
  await w.step(page, "Sales tax collected this year", async (check) => {
    await open("money/taxes");
    await expect(page.getByText("Sales tax on products · owed to Ohio")).toBeVisible();
    const row = page.locator("div", { hasText: /^This year/ }).last();
    const txt = (await row.textContent()) ?? "";
    check("this year's sales tax", txt.includes("$4.18"), "$4.18", txt.trim());
  });
});

test("Money: Overview", async () => {
  const w = walk("Money: Overview", "Last month's revenue, expenses and setting-up, against the answers worked out by hand.");
  const { lastMonth } = dates();
  const name = monthName(lastMonth);

  await w.step(page, `Pick ${name}`, async (check) => {
    await open("money/overview");
    const bar = page.getByRole("button", { name: new RegExp(`^${name}: revenue`) });
    const label = (await bar.getAttribute("aria-label")) ?? "";
    check("bar's revenue", label.includes(`revenue ${money(EXPECT.revenueCents)}`), money(EXPECT.revenueCents), label);
    check("bar's expenses incl. setting up", label.includes(`expenses ${money(EXPECT.expensesCents + EXPECT.setupCents)}`), money(EXPECT.expensesCents + EXPECT.setupCents), label);
    await bar.click();
    await expect(page.getByRole("heading", { name })).toBeVisible();
  });

  await w.step(page, "Profit both ways", async (check) => {
    const profit = EXPECT.revenueCents - EXPECT.expensesCents - EXPECT.setupCents;
    const before = EXPECT.revenueCents - EXPECT.expensesCents;
    const body = (await page.locator("main").textContent()) ?? "";
    check("profit", body.includes(`Profit−${money(profit)}`) || body.includes(`Profit −${money(profit)}`), `−${money(profit)}`, body.match(/Profit\s*[−-]?\$[\d,]+/)?.[0]);
    check("before setting up", body.includes(`−${money(before)} before setting up`), `−${money(before)} before setting up`, body.match(/[−-]?\$[\d,]+ before setting up/)?.[0]);
    check("revenue line", body.includes(`Revenue${money(EXPECT.revenueCents)}`), money(EXPECT.revenueCents));
    check("expenses line", body.includes(`Expenses${money(EXPECT.expensesCents)}`), money(EXPECT.expensesCents));
  });

  await w.step(page, "Savings transfer and Intuit deposits are not expenses or revenue", async (check) => {
    const body = (await page.locator("main").textContent()) ?? "";
    check("no 'Transfer between accounts' in expenses", !body.includes("Transfer between accounts"));
    check("rent listed", body.includes("Studio rent"));
    check("furniture under setting up", body.includes("Furniture and fixtures"));
  });
});

test("Money: Services", async () => {
  const w = walk("Money: Services", "Earnings per hour of her hands, with the working shown, against the hand-worked answer.");
  await w.step(page, "Cut & Style ranks with its hourly figure", async (check) => {
    await open("money/services");
    await expect(page.getByText("Cut & Style", { exact: true })).toBeVisible();
    const row = page.getByRole("button", { name: /Cut & Style/ });
    const t = (await row.textContent()) ?? "";
    check("listed per hour", t.includes("$54"), "$54", t);
  });
  await w.step(page, "Open it: the sum is written out", async (check) => {
    await page.getByRole("button", { name: /Cut & Style/ }).click();
    const sum = page.getByText(/an hour$/);
    const t = (await sum.textContent()) ?? "";
    check("written-out sum", t.includes(`= ${EXPECT.cutPerHour} an hour`), EXPECT.cutPerHour, t);
    check("visits listed", (await page.locator("tbody tr").count()) === 3, "2 visits + total", await page.locator("tbody tr").count());
  });
});

test("Inventory: Sell without an appointment", async () => {
  const w = walk("Inventory: Sell", "A bottle and a one-off comb, 7.5% tax on top; the shelf drops by one and Activity shows the sale.");
  await w.step(page, "Add the shampoo and a comb", async (check) => {
    await open("inventory");
    await page.getByRole("button", { name: "Sell" }).click();
    await page.getByRole("button", { name: "Add a product" }).click();
    await page.getByRole("button", { name: /Strengthening Shampoo/ }).click();
    await page.getByRole("button", { name: "Add a product" }).click();
    await page.getByPlaceholder("Wide-tooth comb").fill("Comb");
    await page.getByPlaceholder("$").last().fill("8");
    await page.getByRole("button", { name: "Add", exact: true }).click();
    // $34 + $8 = $42.00; tax 255 + 60 = $3.15; total $45.15.
    await expect(page.getByRole("button", { name: "Sell · $45.15" })).toBeVisible();
    check("total shown", true, "$45.15", "$45.15");
  });
  await w.step(page, "Sell it", async (check) => {
    const before = await stock("Strengthening Shampoo");
    await page.getByRole("button", { name: "Sell · $45.15" }).click();
    await expect(page.getByText(/Sold · \$45\.15/)).toBeVisible();
    const sale = (await sql.query(`select subtotal_cents, tax_cents, total_cents from retail_sales order by created_at desc limit 1`)).rows[0];
    check("sale in the database", sale.total_cents === 4515, 4515, sale.total_cents);
    check("tax in the database", sale.tax_cents === 315, 315, sale.tax_cents);
    const after = await stock("Strengthening Shampoo");
    check("one off the shelf", after.shelf === before.shelf - 1, before.shelf - 1, after.shelf);
  });
  await w.step(page, "Activity shows it", async (check) => {
    await open("inventory/activity");
    await expect(page.getByText("1 sold · $34.00")).toBeVisible();
    check("sold line", true);
  });
});

test("Inventory: add stock by hand, count, remove", async () => {
  const w = walk("Inventory: add stock, count, remove", "A new bottle with its size; a count that comes up short; a product removed and brought back.");

  await w.step(page, "Add two of a new product by hand, with its size", async (check) => {
    await open("inventory");
    await page.getByRole("button", { name: "Add stock" }).click();
    await page.getByPlaceholder("Start typing a name").fill("Silver Savior Silver Shampoo");
    await page.getByRole("button", { name: /as a new product/ }).click();
    await page.getByPlaceholder("Keune").fill("Keune");
    await page.getByPlaceholder("10.1").fill("10.1");
    await page.locator("label", { hasText: "How many" }).locator("input").fill("2");
    await page.locator("label", { hasText: "Paid each" }).locator("input").fill("15");
    await page.getByRole("button", { name: "Add 2" }).click();
    await expect(page.getByText(/2 × Silver Savior Silver Shampoo added/)).toBeVisible();
    const p = (await sql.query(`select size, unit_cost_cents from products where name = 'Silver Savior Silver Shampoo'`)).rows[0];
    check("size saved as number + unit", p?.size === "10.1 fl oz", "10.1 fl oz", p?.size);
    check("cost saved", p?.unit_cost_cents === 1500, 1500, p?.unit_cost_cents);
    const s = await stock("Silver Savior Silver Shampoo");
    check("two on the shelf", s.shelf === 2, 2, s.shelf);
    // With its brand it files under its range, like a bottle from an order.
    await open("inventory");
    check("filed under its range", await page.getByText("Keune · Silver Savior").isVisible(), "Keune · Silver Savior");
  });

  await w.step(page, "Count the conditioner as 0: one goes missing", async (check) => {
    await open("inventory");
    await page.getByRole("button", { name: "Count" }).click();
    await page.getByLabel("How many Strengthening Conditioner").fill("0");
    await page.getByRole("button", { name: "Save the count" }).click();
    await expect(page.getByText(/Missing:/)).toBeVisible();
    const m = (await sql.query(
      `select kind, quantity::float q from inventory_movements m join products p on p.id = m.product_id
        where p.name like '%Strengthening Conditioner%' and m.kind = 'missing'`)).rows[0];
    check("recorded as missing, not used", m?.kind === "missing", "missing", m?.kind);
    check("one bottle", m?.q === -1, -1, m?.q);
  });

  await w.step(page, "Remove the new product: its history is kept", async (check) => {
    await open("inventory");
    await page.getByText("Silver Shampoo", { exact: true }).click();
    await page.getByRole("button", { name: "Remove from inventory" }).click();
    await page.getByRole("button", { name: "Remove", exact: true }).click();
    await expect(page.getByRole("button", { name: /Removed 1/ })).toBeVisible();
    const p = (await sql.query(
      `select active, (select count(*) from inventory_movements m where m.product_id = products.id)::int moves
         from products where name = 'Silver Savior Silver Shampoo'`)).rows[0];
    check("hidden, not deleted", p?.active === false, false, p?.active);
    check("history kept", p?.moves === 1, 1, p?.moves);
  });

  await w.step(page, "Bring it back", async (check) => {
    await page.getByRole("button", { name: /Removed 1/ }).click();
    await page.getByText("Silver Shampoo", { exact: true }).click();
    await page.getByRole("button", { name: "Bring it back" }).click();
    await expect
      .poll(async () => (await sql.query(`select active from products where name = 'Silver Savior Silver Shampoo'`)).rows[0].active)
      .toBe(true);
    check("active again", true);
  });
});

test("Check-out with a product", async () => {
  const w = walk("Check-out with a product", "The service and a bottle on one bill: tax on the bottle only, the service kept apart.");
  await w.step(page, "Open today's client and check out", async () => {
    await open("appointments");
    await page.getByText("Sarah Jenkins").first().click();
    await page.getByRole("button", { name: "Check out", exact: true }).click();
    await expect(page.getByText("Check out — record the payment:")).toBeVisible();
  });
  await w.step(page, "$55 cut + a $34 shampoo: $91.55", async (check) => {
    await page.locator("input[type='number']").first().fill("55");
    await page.getByRole("button", { name: "Add a product" }).click();
    await page.getByRole("button", { name: /Strengthening Shampoo/ }).click();
    // 5,500 + 3,400 + 255 tax on the bottle only = 9,155.
    await expect(page.getByRole("button", { name: "Check out · $91.55" })).toBeVisible();
    check("total on the button", true, "$91.55", "$91.55");
  });
  await w.step(page, "Check out: service and sale recorded apart", async (check) => {
    await page.getByRole("button", { name: "Check out · $91.55" }).click();
    await expect(page.getByText(/Paid \$55/)).toBeVisible();
    const a = (await sql.query(
      `select a.status, a.paid_cents from appointments a join clients c on c.id = a.client_id
        where c.full_name = 'Sarah Jenkins' and a.status in ('checked_out') and a.starts_at > now() - interval '1 day'`)).rows[0];
    check("appointment checked out", a?.status === "checked_out", "checked_out", a?.status);
    check("service paid kept apart", a?.paid_cents === 5500, 5500, a?.paid_cents);
    const s = (await sql.query(`select subtotal_cents, tax_cents from retail_sales where appointment_id is not null order by created_at desc limit 1`)).rows[0];
    check("bottle's sale", s?.subtotal_cents === 3400, 3400, s?.subtotal_cents);
    check("tax on the bottle only", s?.tax_cents === 255, 255, s?.tax_cents);
  });
});

test("Money: Bank", async () => {
  const w = walk("Money: Bank", "Last month's statement by month, opened, and a row moved to another category and back.");
  const { lastMonth } = dates();
  const name = monthName(lastMonth);
  await w.step(page, `${name} shows in and out`, async (check) => {
    await open("money/bank");
    const row = page.getByRole("button", { name: new RegExp(name) });
    const t = (await row.textContent()) ?? "";
    // In: the $255 Intuit deposit. Out: 250 + 157.50 + 5.80 + 1,208 + 705 = 2,326.30.
    check("money in", t.includes("+$255"), "+$255", t);
    check("money out", t.includes("−$2,326"), "−$2,326", t);
    check("all sorted", t.includes("all sorted"), "all sorted", t);
    await row.click();
    await expect(page.getByText("Card payments (Intuit)")).toBeVisible();
  });
  const catOf = async () =>
    (await sql.query(`select c.name from bank_transactions t join expense_categories c on c.id = t.category_id where t.merchant = 'SALON LOFTS'`))
      .rows[0].name;
  await w.step(page, "Move Salon Lofts to Insurance, then back", async (check) => {
    await page.getByText("Salon Lofts", { exact: true }).click();
    await page.locator("select").selectOption({ label: "Insurance" });
    await expect.poll(catOf).toBe("Insurance");
    check("category changed in the database", true, "Insurance", "Insurance");
    await page.getByText("Salon Lofts", { exact: true }).click();
    await page.locator("select").selectOption({ label: "Studio rent" });
    await expect.poll(catOf).toBe("Studio rent");
  });
});

test("Calendar: block, unblock, book anyway", async () => {
  const w = walk("Calendar: block, unblock, book anyway", "Blocking from an empty time, unblocking by tapping it, and booking over a client on purpose.");
  const { today } = dates();
  const blocks = async () => Number((await sql.query(`select count(*) n from time_off`)).rows[0].n);

  await w.step(page, "Tap an empty time and block it", async (check) => {
    await open("calendar");
    await page.getByRole("button", { name: "day", exact: true }).click();
    const tenAm = page.getByText("10 AM", { exact: true }).first();
    const box = (await tenAm.boundingBox())!;
    await page.mouse.click(box.x + box.width + 120, box.y + 12);
    await page.getByRole("button", { name: "Block this time" }).click();
    await page.getByRole("button", { name: "Block it" }).click();
    await expect.poll(blocks).toBe(1);
    check("one block saved", true, 1, 1);
  });

  await w.step(page, "Tap the block and unblock it", async (check) => {
    await page.getByRole("button", { name: /^Blocked:/ }).first().click();
    await page.getByRole("button", { name: "Unblock" }).click();
    await expect.poll(blocks).toBe(0);
    check("block gone", true, 0, 0);
  });

  await w.step(page, "Book Mike over Sarah's 2pm: the form says who, then Book anyway", async (check) => {
    await open("appointments");
    await page.getByRole("button", { name: "+ New appointment" }).click();
    await page.locator("input.input").first().fill("Mike");
    await page.getByText("Mike Reed", { exact: true }).click();
    await page.locator("select").selectOption({ label: "Cut & Style" });
    await page.locator("input[type='date']").first().fill(today);
    await page.locator("input[type='time']").first().fill("14:30");
    await expect(page.getByText(/Overlaps Sarah Jenkins/)).toBeVisible();
    const btn = page.getByRole("button", { name: "Book anyway" });
    await expect(btn).toBeVisible();
    check("warning names who", true);
    await btn.click();
    await expect
      .poll(async () => (await sql.query(
        `select a.allow_overlap from appointments a join clients c on c.id = a.client_id
          where c.full_name = 'Mike Reed' and a.starts_at > now() - interval '1 day'`)).rows[0]?.allow_overlap)
      .toBe(true);
    check("saved as a deliberate overlap", true, true, true);
  });

  await w.step(page, "The day view in the booking form: tap a free gap", async (check) => {
    await open("appointments");
    await page.getByRole("button", { name: "+ New appointment" }).click();
    await page.locator("input.input").first().fill("Liz");
    await page.getByText("Liz Driver", { exact: true }).click();
    await page.locator("select").selectOption({ label: "Cut & Style" });
    await page.locator("input[type='date']").first().fill(today);
    const gap = page.getByRole("button", { name: /^Free / }).first();
    await expect(gap).toBeVisible();
    const label = (await gap.textContent()) ?? "";
    await gap.click();
    const time = await page.locator("input[type='time']").first().inputValue();
    check("tapping a gap fills its start time", /^\d\d:\d\d$/.test(time), "a time", time);
    check("the gap was labelled", label.startsWith("Free"), "Free …", label);
  });
});

test("Menu: eight items, nothing lost", async () => {
  const w = walk("Menu: eight items, nothing lost", "Fourteen items became eight; every old page is a tab, and every old address still lands on it.");
  const ITEMS = ["Overview", "Calendar", "Clients", "Messages", "Inventory", "Money", "Reports", "Settings"];

  await w.step(page, "Open the menu: eight items", async (check) => {
    await open("overview");
    await page.getByRole("button", { name: "Menu" }).click();
    const names = (await page.locator("div.absolute.z-20 > button").allTextContents())
      .map((t) => t.replace(/\d+$/, "").trim())
      .filter((t) => t !== "Sign out");
    check("the eight, in order", names.join(",") === ITEMS.join(","), ITEMS.join(", "), names.join(", "));
  });

  await w.step(page, "Calendar shows its tabs; Time off is one tap", async (check) => {
    await page.locator("div.absolute.z-20").getByRole("button", { name: "Calendar" }).click();
    for (const t of ["Calendar", "Upcoming", "Time off"])
      check(`tab: ${t}`, await page.getByRole("button", { name: t, exact: true }).first().isVisible());
    await page.getByRole("button", { name: "Time off", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Time off" })).toBeVisible();
    check("Time off opened", true);
  });

  // Every page that left the menu, by its old address.
  const OLD: [string, string, string][] = [
    ["tasks", "To-do", "To-do"],
    ["appointments", "Upcoming", "Upcoming"],
    ["timeoff", "Time off", "Time off"],
    ["outreach", "Outreach", "Outreach"],
    ["texts", "To send", "To send"],
    ["hours", "Hours", "Your week"],
    ["services", "Services", "Services"],
  ];
  await w.step(page, "Old addresses land on their tab", async (check) => {
    for (const [hash, tab, heading] of OLD) {
      await open(hash);
      await expect(page.getByRole("heading", { name: heading }).first()).toBeVisible();
      const tabBtn = page.locator("main button.border-foreground", { hasText: tab });
      check(`#${hash} → ${tab}`, (await tabBtn.count()) === 1, "its tab marked", `${await tabBtn.count()} marked`);
    }
  });

  await w.step(page, "On a computer: every tab listed under its item", async (check) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await open("money/taxes");
    const side = page.locator("aside nav");
    const subs = await side.locator("div > button:not(:first-child)").count();
    // 2 + 3 + 2 + 2 + 2 + 4 + 0 + 3 = 18 tabs under the eight
    check("18 tabs listed", subs === 18, 18, subs);
    const here = await side.locator('[aria-current="page"]').allTextContents();
    check("Taxes marked", here.join() === "Taxes", "Taxes", here.join());
    await side.getByRole("button", { name: "Activity", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Inventory" })).toBeVisible();
    const now = await side.locator('[aria-current="page"]').allTextContents();
    check("Activity marked after a tap", now.join() === "Activity", "Activity", now.join());
    await page.waitForTimeout(300); // let the highlight finish moving
    await page.screenshot({ path: "e2e-out/sidebar.png" });
    await page.setViewportSize({ width: 390, height: 844 });
  });
});

test("Hours for one day", async () => {
  const w = walk("Hours for one day", "Open later one day, close another over a booked client, and find both under Settings › Hours.");
  const { today } = dates();
  const row = async () =>
    (await sql.query(`select start_time::text s, end_time::text e from day_hours where day = $1`, [today])).rows[0] as
      | { s: string | null; e: string | null }
      | undefined;

  await w.step(page, "Today, day view: tap the hours, open until 9 PM", async (check) => {
    await open("calendar");
    await page.getByRole("button", { name: "day", exact: true }).click();
    await page.getByRole("button", { name: /Change$/ }).first().click();
    await page.getByRole("button", { name: "Different hours" }).click();
    await page.getByLabel("Opens").fill("09:00");
    await page.getByLabel("Closes").fill("21:00");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect.poll(row).toEqual({ s: "09:00:00", e: "21:00:00" });
    check("saved for today only", true, "09:00-21:00", "09:00-21:00");
    await expect(page.getByText("Open 9 AM – 9 PM")).toBeVisible();
    check("the day says so", await page.getByText("this day only").isVisible());
  });

  await w.step(page, "Close today: it names Sarah, then Save anyway", async (check) => {
    await page.getByRole("button", { name: /Change$/ }).first().click();
    await page.getByRole("button", { name: "Closed", exact: true }).click();
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText("Sarah Jenkins")).toBeVisible();
    check("warning names who", true);
    await page.getByRole("button", { name: "Save anyway" }).click();
    await expect.poll(row).toEqual({ s: null, e: null });
    check("closed for today", true, "closed", "closed");
  });

  await w.step(page, "Settings › Hours lists it; Remove puts the week back", async (check) => {
    await open("hours");
    await expect(page.getByText("Just these days")).toBeVisible();
    const listed = page.locator("div", { hasText: /^.*Closed.*usually/ }).last();
    check("listed as Closed", await listed.isVisible());
    await page.getByRole("button", { name: "Remove" }).first().click();
    await expect.poll(row).toBeUndefined();
    check("row gone", true, "none", "none");
  });
});

test("Change an appointment's service", async () => {
  const w = walk("Change an appointment's service", "Mike's 2:30 cut becomes a highlight: same start, the highlight's length and price.");
  const mike = async () =>
    (await sql.query(
      `select s.name, a.price_cents, extract(epoch from a.ends_at - a.starts_at)/60 mins, a.start_minutes
         from appointments a join clients c on c.id = a.client_id join services s on s.id = a.service_id
        where c.full_name = 'Mike Reed' and a.starts_at > now() - interval '1 day'`)).rows[0];

  await w.step(page, "Open Mike's appointment, Change service, pick the highlight", async (check) => {
    await open("calendar");
    await page.getByRole("button", { name: "day", exact: true }).click();
    await page.getByText("2:30 PM Mike").click();
    await page.getByRole("button", { name: "Change service" }).click();
    await page.getByRole("button", { name: /Custom Cut & Partial Highlight/ }).click();
    // 2:30 + 180 min = 5:30 PM; $150.
    await expect(page.getByText("5:30 PM")).toBeVisible();
    check("preview shows the new end", true, "5:30 PM", "5:30 PM");
    check("preview shows $55 → $150", await page.getByText(/\$55\s*\$150/).isVisible());
    check("timing shown", await page.getByText("60 · 45 · 75").isVisible());
  });

  await w.step(page, "Change it: the database agrees", async (check) => {
    await page.getByRole("button", { name: /^(Change service|Change anyway)$/ }).last().click();
    await expect.poll(async () => (await mike()).name).toBe("Custom Cut & Partial Highlight");
    const r = await mike();
    check("price $150", r.price_cents === 15000, 15000, r.price_cents);
    check("3 hours long", Number(r.mins) === 180, 180, r.mins);
    check("hand timing cleared", r.start_minutes === null, null, r.start_minutes);
  });
});
