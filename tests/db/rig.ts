// The database tests' connection: the LOCAL rig only (docs/TESTING.md).
//
// Every test runs inside a transaction that is rolled back, so the rig is the
// same after a run as before it. And the connection string is checked before
// anything is sent: these tests create clients, appointments and sales, and
// must never reach Evelyn's database.

import { Client } from "pg";

export const RIG_DB_URL = process.env.RIG_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:55322/postgres";

const LOCAL = /@(127\.0\.0\.1|localhost|\[::1\]):\d+\//;

export async function connect(): Promise<Client> {
  if (!LOCAL.test(RIG_DB_URL)) {
    throw new Error(`Database tests only run against this machine. Got ${RIG_DB_URL.replace(/:[^:@/]+@/, ":***@")}.`);
  }
  const c = new Client({ connectionString: RIG_DB_URL });
  await c.connect();
  return c;
}

/** Run `fn` in a transaction that is always rolled back. */
export async function inRolledBackTx<T>(db: Client, fn: () => Promise<T>): Promise<T> {
  await db.query("begin");
  try {
    return await fn();
  } finally {
    await db.query("rollback");
  }
}

/** A savepoint, so an expected error doesn't abort the surrounding transaction. */
export async function expectError(db: Client, sql: string, params: unknown[] = []): Promise<{ code: string; message: string }> {
  await db.query("savepoint expect_error");
  try {
    await db.query(sql, params);
  } catch (e) {
    await db.query("rollback to savepoint expect_error");
    const err = e as { code?: string; message?: string };
    return { code: err.code ?? "", message: err.message ?? "" };
  }
  await db.query("release savepoint expect_error");
  throw new Error(`Expected an error from: ${sql.slice(0, 120)}`);
}

export async function one<T = Record<string, unknown>>(db: Client, sql: string, params: unknown[] = []): Promise<T> {
  const r = await db.query(sql, params);
  if (r.rows.length !== 1) throw new Error(`Expected one row, got ${r.rows.length}: ${sql.slice(0, 120)}`);
  return r.rows[0] as T;
}

/** A throwaway client and a 60-minute service with no processing time. */
export async function fixtures(db: Client) {
  const client = await one<{ id: string }>(
    db,
    `insert into clients (full_name, phone, email) values ('Test Client', '9375550100', 'test@example.com') returning id`,
  );
  const cut = await one<{ id: string }>(
    db,
    // duration_minutes is generated from the three segments — never written.
    `insert into services (name, start_minutes, process_minutes, finish_minutes, price_cents, active)
     values ('Test Cut', 60, 0, 0, 5500, true) returning id`,
  );
  const colour = await one<{ id: string }>(
    db,
    `insert into services (name, start_minutes, process_minutes, finish_minutes, price_cents, active)
     values ('Test Colour', 60, 45, 75, 15000, true) returning id`,
  );
  return { clientId: client.id, cutId: cut.id, colourId: colour.id };
}

/**
 * 10:00 salon time on the next day she works, at least `minDays` out — inside
 * online booking's window and her hours. Returned as an ISO timestamp.
 */
export async function nextWorkingMorning(db: Client, minDays = 3, hhmm = "10:00"): Promise<string> {
  const r = await one<{ at: Date }>(
    db,
    `select ((d::date + $2::time) at time zone 'America/New_York') as at
       from generate_series((now() at time zone 'America/New_York')::date + $1::int,
                            (now() at time zone 'America/New_York')::date + $1::int + 13, interval '1 day') d
      where exists (select 1 from availability_rules r
                     where r.active and r.weekday = extract(dow from d)::int
                       and r.start_time <= $2::time and r.end_time >= ($2::time + interval '3 hours'))
      order by d limit 1`,
    [minDays, hhmm],
  );
  return r.at.toISOString();
}
