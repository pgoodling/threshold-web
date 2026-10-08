// The walks' rig: a known studio, built fresh before every run, on the LOCAL
// database only.
//
// seed() empties the rig's salon tables and puts back a small salon whose
// numbers are worked out by hand in EXPECT, so a walk can check the screen
// against an answer rather than against itself. studioUser() makes the
// sign-in, with a new random password every run; nothing is stored.

import { randomBytes } from "node:crypto";
import { execSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";

const LOCAL = /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?(\/|$)/;
const LOCAL_DB = /@(127\.0\.0\.1|localhost|\[::1\]):\d+\//;

export type Rig = { apiUrl: string; serviceKey: string; dbUrl: string };

export function rig(): Rig {
  const s = JSON.parse(
    execSync("npx supabase status --workdir tests/rig -o json", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }),
  );
  if (!LOCAL.test(s.API_URL) || !LOCAL_DB.test(s.DB_URL)) {
    throw new Error(`Walks only run against this machine. Got ${s.API_URL}.`);
  }
  return { apiUrl: s.API_URL, serviceKey: s.SERVICE_ROLE_KEY, dbUrl: s.DB_URL };
}

export async function db(r: Rig): Promise<Client> {
  const c = new Client({ connectionString: r.dbUrl });
  await c.connect();
  return c;
}

export const STUDIO_EMAIL = "walks@threshold.test";

export async function studioUser(r: Rig): Promise<{ email: string; password: string }> {
  const admin = createClient(r.apiUrl, r.serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const password = `Walk-${randomBytes(12).toString("hex")}`;
  const { data } = await admin.auth.admin.listUsers({ perPage: 200 });
  const existing = data?.users.find((u) => u.email === STUDIO_EMAIL);
  if (existing) {
    const { error } = await admin.auth.admin.updateUserById(existing.id, { password });
    if (error) throw new Error(`Couldn't reset the walks password: ${error.message}`);
  } else {
    const { error } = await admin.auth.admin.createUser({ email: STUDIO_EMAIL, password, email_confirm: true });
    if (error) throw new Error(`Couldn't create the walks user: ${error.message}`);
  }
  return { email: STUDIO_EMAIL, password };
}

// ---- Dates: last month and today, salon time -----------------------------

const salonToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
const ymd = (d: Date) => d.toISOString().slice(0, 10);
export function dates() {
  const today = salonToday();
  const [y, m] = today.split("-").map(Number);
  const lastMonth = ymd(new Date(Date.UTC(y, m - 2, 1))).slice(0, 7); // "2026-09"
  return { today, lastMonth, lm: (day: number) => `${lastMonth}-${String(day).padStart(2, "0")}` };
}

// ---- The salon, and what its screens should say ---------------------------
//
// Last month, by hand:
//   revenue   Liz highlight $200 (card) + Sarah cut $55 (cash) + Mike cut $55 (card)
//             + Liz's two bottles $55.82 before tax                  = $365.82
//   expenses  rent $250 + SalonCentric $157.50 + Intuit fee $5.80    = $413.30
//   setup     furniture $1,208
//   profit    365.82 − 413.30 − 1,208 = −$1,255.48; before setting up −$47.48
//   card fee rate  580 / 25,500 (the Intuit deposit) = 2.2745…%
//   Cut & Style    fees: Mike round(5,500 × 0.022745) = 125, Sarah cash 0
//                  hands 60 + 60 = 120 → (11,000 − 125) ÷ 120 × 60 = $54.38/h
//   Liz highlight  fee round(20,000 × 0.022745) = 455; hands 60 + 75 = 135
//                  product (a partial, her measures, the prices seeded below):
//                    lightener 30 g × 2,300 ÷ 498.95 g = 138.29
//                    developer 60 ml × 750 ÷ 1,000     =  45.00
//                    gloss 30 ml × 730 ÷ 59.147        = 370.26
//                    activator 60 ml × 900 ÷ 1,000     =  54.00
//                    foils 32.5 × 2,399 ÷ 500          = 155.94  → 763.49
//                  → (20,000 − 455 − 763.49) ÷ 135 × 60 = $83.47/h
//   sales tax      2 × $2.09 = $4.18

export const EXPECT = {
  revenueCents: 36582,
  expensesCents: 41330,
  setupCents: 120800,
  cutPerHour: "$54.38",
  highlightPerHour: "$83.47",
  highlightProduct: "$7.63",
  lastMonthSalesTaxCents: 418,
};

export async function seed(r: Rig) {
  const c = await db(r);
  const { today, lm } = dates();
  try {
    await c.query("begin");
    await c.query(`truncate retail_sale_lines, retail_sales, inventory_movements, products, appointment_busy,
                   appointment_intake, messages, tasks, appointments, time_off, bank_transactions, category_rules,
                   client_formulas, client_merges, clients cascade`);
    await c.query(`delete from bank_accounts`);
    await c.query(`update services set active = false`);

    const svc = async (name: string, st: number, pr: number, fi: number, price: number) =>
      (await c.query(
        `insert into services (name, start_minutes, process_minutes, finish_minutes, price_cents, active, sort_order)
         values ($1, $2, $3, $4, $5, true, 0)
         on conflict (name) do update set start_minutes = excluded.start_minutes, process_minutes = excluded.process_minutes,
           finish_minutes = excluded.finish_minutes, price_cents = excluded.price_cents, active = true
         returning id`, [name, st, pr, fi, price])).rows[0].id as string;
    const cut = await svc("Cut & Style", 60, 0, 0, 5500);
    const hl = await svc("Custom Cut & Partial Highlight", 60, 45, 75, 15000);

    const client = async (name: string, phone: string) =>
      (await c.query(`insert into clients (full_name, phone, email) values ($1, $2, null) returning id`, [name, phone])).rows[0].id as string;
    const sarah = await client("Sarah Jenkins", "9375550101");
    const liz = await client("Liz Driver", "9375550102");
    const mike = await client("Mike Reed", "9375550103");

    const at = (day: string, hhmm: string) => `${day} ${hhmm} America/New_York`;
    const appt = async (cl: string, sv: string, starts: string, mins: number, status: string, paid: number | null, method: string | null) =>
      (await c.query(
        `insert into appointments (client_id, service_id, starts_at, ends_at, price_cents, status, paid_cents, payment_method, source, checked_out_at)
         values ($1, $2, $3::timestamptz, $3::timestamptz + make_interval(mins => $4), 0, $5, $6, $7, 'studio',
                 case when $5 = 'checked_out' then $3::timestamptz + make_interval(mins => $4) end) returning id`,
        [cl, sv, starts, mins, status, paid, method])).rows[0].id as string;
    await appt(liz, hl, at(lm(7), "13:00"), 180, "checked_out", 20000, "card");
    const sarahLast = await appt(sarah, cut, at(lm(10), "10:00"), 60, "checked_out", 5500, "cash");
    await appt(mike, cut, at(lm(12), "15:00"), 60, "checked_out", 5500, "card");
    // Today: Sarah in the chair at 2pm, ready to check out.
    const sarahToday = await appt(sarah, cut, at(today, "14:00"), 60, "checked_in", null, null);
    // Two hair-notes forms, one per visit, describing different hair -- the
    // way it looks when a parent books their child under their own name.
    await c.query(
      `insert into appointment_intake (appointment_id, client_id, hair_type, length, note) values
         ($1, $3, 'wavy', 'shoulders', 'For me'), ($2, $3, 'straight', 'midback', 'For my daughter')`,
      [sarahLast, sarahToday, sarah]);

    // Stock.
    const product = async (brand: string, name: string, cost: number, price: number | null, sells: boolean, bar: boolean, shelf: number) => {
      const id = (await c.query(
        `insert into products (supplier, brand, name, unit_cost_cents, retail_price_cents, sells_retail, used_at_backbar)
         values ('Premier Beauty Supply', $1, $2, $3, $4, $5, $6) returning id`, [brand, name, cost, price, sells, bar])).rows[0].id as string;
      if (shelf > 0) await c.query(
        `insert into inventory_movements (product_id, kind, quantity, unit_cost_cents, occurred_on, invoice_ref)
         values ($1, 'received', $2, $3, $4, '900001')`, [id, shelf, cost, lm(5)]);
      return id;
    };
    const shampoo = await product("Keune", "Long & Strong Strengthening Shampoo 10.1 oz.", 1500, 3400, true, true, 3);
    const conditioner = await product("Keune", "Long & Strong Strengthening Conditioner 8.5 oz.", 1500, 3400, true, true, 2);
    await product("Keune", "Long & Strong Super Serum 3.4 oz.", 2300, null, true, true, 1);
    // The chemicals a highlight's product cost is priced from (see EXPECT).
    for (const [brand, name, cost, size] of [
      ["Redken", "Blonde IQ 7 Calibrated Powder Lightener", 2300, "1.1 lb"],
      ["Redken", "Pro-Oxide Oil Developer 20 Volume", 750, "1 litre"],
      ["maria nila", "GLOSS COLLECTION 7.1A 2 Fl. Oz.", 730, null],
      ["maria nila", "GLOSS COLLECTION LIQUID ACTIVATOR Liter", 900, null],
      ["Framar", "Framar Embossed Pop Up Foil Medium Diet Coke 5 inch x 11 inch 500 ct.", 2399, null],
    ] as const) {
      const id = await product(brand, name, cost, null, false, true, 0);
      if (size) await c.query(`update products set size = $2 where id = $1`, [id, size]);
    }
    await product("Keune", "Velvet Smooth Anti-frizz Mask 8.5 oz.", 2100, 4800, true, true, 0);
    await product("Keune", "Tinta 6- Dark Blonde 2 Fl. Oz.", 1030, null, false, true, 2);

    // Liz bought two bottles last month, $30 each with tax.
    await c.query(
      `select record_retail_sale(jsonb_build_array(
         jsonb_build_object('product_id', $1::text, 'description', 'Long & Strong Strengthening Shampoo', 'quantity', 1, 'unit_price_cents', 2791),
         jsonb_build_object('product_id', $2::text, 'description', 'Long & Strong Strengthening Conditioner', 'quantity', 1, 'unit_price_cents', 2791)),
         'card', $3::uuid)`, [shampoo, conditioner, liz]);
    // The function dates a sale today; this one was last month.
    await c.query(`update retail_sales set sold_on = $1::date, sold_at = ($1::date + time '13:00') at time zone 'America/New_York'`, [lm(7)]);
    await c.query(`update inventory_movements set occurred_on = $1 where kind = 'sold'`, [lm(7)]);

    // The bank, last month, all sorted.
    const acct = (await c.query(
      `insert into bank_accounts (source, name, institution) values ('manual', 'Relay — Business Checking', 'Relay') returning id`)).rows[0].id;
    const cat = async (name: string) => (await c.query(`select id from expense_categories where name = $1`, [name])).rows[0].id;
    const txn = async (day: string, cents: number, merchant: string, category: string) =>
      c.query(
        `insert into bank_transactions (account_id, posted_on, amount_cents, description, merchant, import_hash,
                                        is_business, reviewed_at, category_id, category_source)
         values ($1, $2::date, $3::int, $4::text, $4::text, md5($4::text || $2::text || $3::text), true, now(), $5, 'manual')`,
        [acct, day, cents, merchant, await cat(category)]);
    await txn(lm(11), -25000, "SALON LOFTS", "Studio rent");
    await txn(lm(24), -15750, "SalonCentric", "Back bar and supplies");
    await txn(lm(28), -580, "INTUIT 22582603", "Card processing fees");
    await txn(lm(28), 25500, "INTUIT 24157733", "Card revenue (Intuit)");
    await txn(lm(21), -120800, "IKEA", "Furniture and fixtures");
    await txn(lm(19), -70500, "Transfer to savings", "Transfer between accounts");

    await c.query("commit");
  } catch (e) {
    await c.query("rollback");
    throw e;
  } finally {
    await c.end();
  }
}
