// Database tests, on the LOCAL rig only (tests/db/rig.ts refuses anything
// else). Each test runs in a transaction that's rolled back.
//
//   npm run test:db        (the rig must be running: npm run rig:start)
//
// These check the rules the database itself enforces — the ones no screen can
// be trusted to: what a sale writes, how the shelf and bar are counted, who
// may overlap whom, and that online booking can't land on taken time.

import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import type { Client } from "pg";
import { connect, inRolledBackTx, expectError, one, fixtures, nextWorkingMorning } from "./rig";

let db: Client;
before(async () => {
  db = await connect();
});
after(async () => {
  await db?.end();
});

const plus = (iso: string, minutes: number) => new Date(+new Date(iso) + minutes * 60_000).toISOString();

async function product(name: string, costCents = 1500, priceCents: number | null = 3400) {
  return (
    await one<{ id: string }>(
      db,
      `insert into products (name, brand, unit_cost_cents, retail_price_cents, sells_retail, used_at_backbar)
       values ($1, 'Keune', $2, $3, true, true) returning id`,
      [name, costCents, priceCents],
    )
  ).id;
}
async function move(productId: string, kind: string, quantity: number, note: string | null = null) {
  await db.query(`insert into inventory_movements (product_id, kind, quantity, unit_cost_cents, note) values ($1, $2, $3, 1500, $4)`, [
    productId, kind, quantity, note,
  ]);
}
const stock = (productId: string) =>
  one<{ on_hand: string; on_bar: string }>(db, `select on_hand, on_bar from product_stock where product_id = $1`, [productId]);

// ---- Shelf and back bar (0046) -------------------------------------------

test("shelf and bar: 3 arrive, 2 go on the bar, 1 is finished, 1 sold", async () => {
  await inRolledBackTx(db, async () => {
    const p = await product("Test Shampoo");
    await move(p, "received", 3);
    await move(p, "used", -1);
    await move(p, "used", -1);
    await move(p, "finished", -1);
    await move(p, "sold", -1);
    // Shelf: 3 − 2 − 1 = 0. Bar: 2 opened − 1 finished = 1. Finishing never touches the shelf.
    const s = await stock(p);
    assert.equal(Number(s.on_hand), 0);
    assert.equal(Number(s.on_bar), 1);
  });
});

test("a count that comes up short is 'missing': off the shelf, not on the bar", async () => {
  await inRolledBackTx(db, async () => {
    const p = await product("Test Serum");
    await move(p, "received", 4);
    await move(p, "missing", -1, "Counted");
    const s = await stock(p);
    assert.equal(Number(s.on_hand), 3);
    assert.equal(Number(s.on_bar), 0);
  });
});

test("a movement with the wrong sign is refused", async () => {
  await inRolledBackTx(db, async () => {
    const p = await product("Test Mask");
    for (const [kind, q] of [["received", -1], ["used", 1], ["finished", 1], ["sold", 1], ["missing", 1]] as const) {
      const e = await expectError(db, `insert into inventory_movements (product_id, kind, quantity) values ($1, $2, $3)`, [p, kind, q]);
      assert.equal(e.code, "23514", `${kind} ${q} should break the sign check`);
    }
  });
});

// ---- Selling (0047) -------------------------------------------------------

test("a sale at check-out: totals, tax, stock and the appointment, in one go", async () => {
  await inRolledBackTx(db, async () => {
    const f = await fixtures(db);
    const shampoo = await product("Test Shampoo");
    const conditioner = await product("Test Conditioner");
    await move(shampoo, "received", 2);
    await move(conditioner, "received", 2);
    const starts = await nextWorkingMorning(db);
    const appt = await one<{ id: string }>(
      db,
      `insert into appointments (client_id, service_id, starts_at, ends_at, price_cents, status, source)
       values ($1, $2, $3, $4, 5500, 'checked_in', 'studio') returning id`,
      [f.clientId, f.cutId, starts, plus(starts, 60)],
    );
    // $32 + $30 + an $8 comb = $70.00; tax 240 + 225 + 60 = 525.
    const lines = [
      { product_id: shampoo, description: "Shampoo", quantity: 1, unit_price_cents: 3200 },
      { product_id: conditioner, description: "Conditioner", quantity: 1, unit_price_cents: 3000 },
      { product_id: null, description: "Comb", quantity: 1, unit_price_cents: 800 },
    ];
    const { sale } = await one<{ sale: string }>(
      db,
      `select record_retail_sale($1::jsonb, 'card', $2, $3, 6500) as sale`,
      [JSON.stringify(lines), f.clientId, appt.id],
    );
    const s = await one<{ subtotal_cents: number; tax_cents: number; total_cents: number; tax_rate: string }>(
      db, `select subtotal_cents, tax_cents, total_cents, tax_rate from retail_sales where id = $1`, [sale]);
    assert.deepEqual([s.subtotal_cents, s.tax_cents, s.total_cents, Number(s.tax_rate)], [7000, 525, 7525, 0.075]);

    // Two bottles off the shelf; the comb isn't stock.
    assert.equal(Number((await stock(shampoo)).on_hand), 1);
    assert.equal(Number((await stock(conditioner)).on_hand), 1);
    const moves = await one<{ n: string }>(db, `select count(*) n from retail_sale_lines where sale_id = $1 and movement_id is not null`, [sale]);
    assert.equal(Number(moves.n), 2);

    // The service is checked out at $65, apart from the products.
    const a = await one<{ status: string; paid_cents: number; payment_method: string }>(
      db, `select status, paid_cents, payment_method from appointments where id = $1`, [appt.id]);
    assert.deepEqual(a, { status: "checked_out", paid_cents: 6500, payment_method: "card" });
  });
});

test("a sale with nothing in it is refused", async () => {
  await inRolledBackTx(db, async () => {
    const e = await expectError(db, `select record_retail_sale('[]'::jsonb, 'cash')`);
    assert.match(e.message, /at least one item/);
  });
});

test("the rate comes from tax_rates, not from the screen", async () => {
  await inRolledBackTx(db, async () => {
    // A new rate from today on: the next sale uses it.
    await db.query(
      `insert into tax_rates (jurisdiction, label, rate, effective_from, source_url, checked_on)
       values ('ohio_sales_tax', 'test', 0.08, (now() at time zone 'America/New_York')::date, 'test', current_date)`,
    );
    const { sale } = await one<{ sale: string }>(
      db, `select record_retail_sale('[{"product_id":null,"description":"Comb","quantity":1,"unit_price_cents":1000}]'::jsonb, 'cash') as sale`);
    const s = await one<{ tax_cents: number }>(db, `select tax_cents from retail_sales where id = $1`, [sale]);
    assert.equal(s.tax_cents, 80);
  });
});

// ---- Overlaps (0048) -----------------------------------------------------

async function book(f: Awaited<ReturnType<typeof fixtures>>, starts: string, opts: { service?: string; minutes?: number; flag?: boolean; source?: string } = {}) {
  return one<{ id: string }>(
    db,
    `insert into appointments (client_id, service_id, starts_at, ends_at, price_cents, status, source, allow_overlap)
     values ($1, $2, $3, $4, 5500, 'booked', $5, $6) returning id`,
    [f.clientId, opts.service ?? f.cutId, starts, plus(starts, opts.minutes ?? 60), opts.source ?? "studio", opts.flag ?? false],
  );
}
const bookSql = `insert into appointments (client_id, service_id, starts_at, ends_at, price_cents, status, source, allow_overlap)
                 values ($1, $2, $3, $4, 5500, 'booked', $5, $6)`;

test("an ordinary overlap is still refused", async () => {
  await inRolledBackTx(db, async () => {
    const f = await fixtures(db);
    const t = await nextWorkingMorning(db);
    await book(f, t);
    const e = await expectError(db, bookSql, [f.clientId, f.cutId, plus(t, 30), plus(t, 90), "studio", false]);
    assert.equal(e.code, "23P01");
  });
});

test("'Book anyway' is accepted, and the client underneath can still be checked in", async () => {
  await inRolledBackTx(db, async () => {
    const f = await fixtures(db);
    const t = await nextWorkingMorning(db);
    const under = await book(f, t);
    const over = await book(f, plus(t, 30), { flag: true });
    // Check-in rewrites the busy blocks; it must not trip over the overlap.
    await db.query(`update appointments set status = 'checked_in' where id = $1`, [under.id]);
    // Only this test's appointments: the rig may hold others (the walks leave some).
    const n = await one<{ ok: string; plain: string }>(
      db,
      `select count(*) filter (where overlap_ok) ok, count(*) filter (where not overlap_ok) plain
         from appointment_busy where appointment_id in ($1, $2)`,
      [under.id, over.id],
    );
    assert.equal(Number(n.ok), 1, "the one booked over is flagged");
    assert.equal(Number(n.plain), 1, "the one underneath isn't");
  });
});

test("an online booking can't land on a deliberate overlap", async () => {
  await inRolledBackTx(db, async () => {
    const f = await fixtures(db);
    const t = await nextWorkingMorning(db);
    await book(f, t);
    await book(f, plus(t, 30), { flag: true });
    // Clear of the ordinary block (ends at +60), but on the flagged one (+30 to +90).
    const e = await expectError(db, bookSql, [f.clientId, f.cutId, plus(t, 75), plus(t, 135), "online", false]);
    assert.equal(e.code, "23P01");
  });
});

test("'Save anyway' lengthens a visit into the next one", async () => {
  await inRolledBackTx(db, async () => {
    const f = await fixtures(db);
    const t = await nextWorkingMorning(db);
    const first = await book(f, t);
    await book(f, plus(t, 60));
    const e = await expectError(db, `update appointments set start_minutes = 90 where id = $1`, [first.id]);
    assert.equal(e.code, "23P01");
    await db.query(`update appointments set start_minutes = 90, allow_overlap = true where id = $1`, [first.id]);
  });
});

test("a cut fits in a colour client's processing gap without any flag", async () => {
  await inRolledBackTx(db, async () => {
    const f = await fixtures(db);
    const t = await nextWorkingMorning(db);
    // Colour: busy 0–60 and 105–180; free 60–105.
    await book(f, t, { service: f.colourId, minutes: 180 });
    const fits = await one<{ id: string }>(
      db,
      `insert into appointments (client_id, service_id, starts_at, ends_at, price_cents, status, source, start_minutes)
       values ($1, $2, $3, $4, 5500, 'booked', 'studio', 45) returning id`,
      [f.clientId, f.cutId, plus(t, 60), plus(t, 105)],
    );
    assert.ok(fits.id);
  });
});

// ---- Online booking (create_booking) --------------------------------------

test("online booking takes a free time, and refuses blocked time", async () => {
  await inRolledBackTx(db, async () => {
    const f = await fixtures(db);
    const t = await nextWorkingMorning(db, 3, "10:00");
    const ok = await one<{ id: string }>(
      db, `select create_booking($1, $2, 'Online Client', 'o@example.com', '9375550199') as id`, [f.cutId, t]);
    assert.ok(ok.id);
    await db.query(`insert into time_off (starts_at, ends_at, reason) values ($1, $2, 'Dentist')`, [plus(t, 120), plus(t, 180)]);
    const e = await expectError(db, `select create_booking($1, $2, 'Other Client', 'p@example.com', '9375550198')`, [f.cutId, plus(t, 120)]);
    assert.match(e.message, /not available/);
  });
});

test("online booking says 'just booked' when the time was taken", async () => {
  await inRolledBackTx(db, async () => {
    const f = await fixtures(db);
    const t = await nextWorkingMorning(db, 3, "10:00");
    await book(f, t);
    const e = await expectError(db, `select create_booking($1, $2, 'Late Client', 'l@example.com', '9375550197')`, [f.cutId, t]);
    assert.match(e.message, /just booked/);
  });
});

// ---- Hours for one day (0049) --------------------------------------------
//
// The rig's week (0015): Mon/Tue 9-7, Fri 9-6, Sat 9-5; Sun, Wed, Thu closed.
// Nothing in that week opens at 8 PM, so an 8 PM slot can only come from a
// one-off day. Slots are read as anon -- the booking page's own role.

/** The salon date (YYYY-MM-DD) of an ISO time, and that date at hh:mm as ISO. */
const salonDay = async (iso: string) =>
  (await one<{ d: string }>(db, `select (($1::timestamptz at time zone 'America/New_York')::date)::text d`, [iso])).d;
const at = async (day: string, hhmm: string) =>
  (await one<{ t: Date }>(db, `select (($1::date + $2::time) at time zone 'America/New_York') t`, [day, hhmm])).t.toISOString();
async function slotsAsAnon(serviceId: string, day: string) {
  await db.query(`set local role anon`);
  const r = await db.query(`select slot from get_available_slots($1, $2::date, $2::date)`, [serviceId, day]);
  await db.query(`reset role`);
  return r.rows.map((x: { slot: Date }) => x.slot.toISOString());
}

test("one longer day: 8 PM is offered and booked that day, and not the next week", async () => {
  await inRolledBackTx(db, async () => {
    const f = await fixtures(db);
    const day = await salonDay(await nextWorkingMorning(db, 3, "10:00"));
    await db.query(`insert into day_hours (day, start_time, end_time) values ($1, '09:00', '21:00')`, [day]);
    const eight = await at(day, "20:00");
    // A 60-minute cut fits 20:00-21:00 exactly; 20:30 would run past close.
    const slots = await slotsAsAnon(f.cutId, day);
    assert.ok(slots.includes(eight), "8 PM offered");
    assert.ok(!slots.includes(await at(day, "20:30")), "8:30 PM not offered");
    await db.query(`set local role anon`);
    const ok = await one<{ id: string }>(db, `select create_booking($1, $2, 'Late Client', 'late@example.com', '9375550190') as id`, [f.cutId, eight]);
    await db.query(`reset role`);
    assert.ok(ok.id);
    // Same weekday, a week on: the week is untouched.
    const nextWeek = await at(await salonDay(plus(eight, 7 * 24 * 60)), "20:00");
    const e = await expectError(db, `select create_booking($1, $2, 'Other Client', 'o2@example.com', '9375550191')`, [f.cutId, nextWeek]);
    assert.match(e.message, /outside working hours/);
  });
});

test("closed by hand: nothing offered, and a booking is refused", async () => {
  await inRolledBackTx(db, async () => {
    const f = await fixtures(db);
    const ten = await nextWorkingMorning(db, 3, "10:00");
    const day = await salonDay(ten);
    assert.ok((await slotsAsAnon(f.cutId, day)).length > 0, "open before");
    await db.query(`insert into day_hours (day) values ($1)`, [day]);
    assert.equal((await slotsAsAnon(f.cutId, day)).length, 0);
    const e = await expectError(db, `select create_booking($1, $2, 'Shut Client', 's@example.com', '9375550192')`, [f.cutId, ten]);
    assert.match(e.message, /outside working hours/);
  });
});

test("a day she's normally closed, opened: offered; times outside it are not", async () => {
  await inRolledBackTx(db, async () => {
    const f = await fixtures(db);
    const closed = await one<{ d: string }>(
      db,
      `select d::date::text d from generate_series((now() at time zone 'America/New_York')::date + 3,
                                                   (now() at time zone 'America/New_York')::date + 16, interval '1 day') d
        where not exists (select 1 from availability_rules r where r.active and r.weekday = extract(dow from d)::int)
        order by d limit 1`,
    );
    assert.equal((await slotsAsAnon(f.cutId, closed.d)).length, 0, "closed before");
    await db.query(`insert into day_hours (day, start_time, end_time) values ($1, '10:00', '14:00')`, [closed.d]);
    // 10:00 to 13:00 by the half hour: 10, 10:30, 11, 11:30, 12, 12:30, 13 = 7 starts.
    const slots = await slotsAsAnon(f.cutId, closed.d);
    assert.equal(slots.length, 7);
    assert.equal(slots[0], await at(closed.d, "10:00"));
  });
});

test("day_hours: an end before the start is refused; anon can't read or call hours_on", async () => {
  await inRolledBackTx(db, async () => {
    const e = await expectError(db, `insert into day_hours (day, start_time, end_time) values ('2030-01-02', '17:00', '09:00')`);
    assert.equal(e.code, "23514");
    await db.query(`set local role anon`);
    const r = await one<{ n: string }>(db, `select count(*) n from day_hours`);
    assert.equal(Number(r.n), 0);
    const denied = await expectError(db, `select * from hours_on('2030-01-02')`);
    assert.equal(denied.code, "42501");
  });
});

// ---- Who can read what ---------------------------------------------------

test("an anonymous visitor sees no costs, sales or bank rows", async () => {
  await inRolledBackTx(db, async () => {
    await product("Test Secret");
    await db.query(`select record_retail_sale('[{"product_id":null,"description":"Comb","quantity":1,"unit_price_cents":800}]'::jsonb, 'cash')`);
    await db.query(`set local role anon`);
    for (const table of ["product_stock", "products", "retail_sales", "bank_transactions", "inventory_movements"]) {
      const r = await one<{ n: string }>(db, `select count(*) n from ${table}`);
      assert.equal(Number(r.n), 0, `${table} visible to anon`);
    }
  });
});

test("an anonymous visitor can't record a sale", async () => {
  await inRolledBackTx(db, async () => {
    await db.query(`set local role anon`);
    const e = await expectError(db, `select record_retail_sale('[{"product_id":null,"description":"x","quantity":1,"unit_price_cents":1}]'::jsonb, 'cash')`);
    assert.equal(e.code, "42501");
  });
});
