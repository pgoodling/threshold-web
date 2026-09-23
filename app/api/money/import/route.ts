import { NextResponse } from "next/server";
import { getAdminClient } from "../../../../lib/supabaseAdmin";
import { parseRelayCsv, checkBalanceChain, matchText } from "../../../../lib/relayCsv";

// Import a Relay CSV export.
//
// Authenticated — this is her bank feed, so only a signed-in studio session may
// call it, verified the same way /api/sms/send does.
//
// Three things this route refuses to do quietly, because each one produces a
// wrong number that nothing downstream would catch:
//
//   * Import a file whose balances don't chain. A gap means rows are missing,
//     and a bank feed with a hole in it is a wrong tax figure wearing the
//     costume of a complete one. Overridable, but only deliberately.
//   * Import the same transaction twice. Dedupe is on the content hash, since
//     Relay's export carries no transaction id.
//   * Decide whether anything is a business expense. Rules attach a SUGGESTED
//     category and say which rule did it; is_business stays null, which is
//     what "nobody has looked at this yet" means.

export const runtime = "nodejs"; // node:crypto, for the dedupe hash

type Body = {
  csv?: string;
  accountId?: string;
  accountName?: string;
  /** Import anyway when the balance chain doesn't verify. Her call, not ours. */
  allowGaps?: boolean;
};

export async function POST(req: Request) {
  const admin = getAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Server not configured." }, { status: 503 });
  }

  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!bearer) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const { data: userData } = await admin.auth.getUser(bearer);
  if (!userData?.user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  const csv = body.csv?.trim();
  if (!csv) return NextResponse.json({ error: "No file contents." }, { status: 400 });

  // ---- Parse -------------------------------------------------------------
  const { rows, skipped } = parseRelayCsv(csv);
  if (rows.length === 0) {
    return NextResponse.json(
      {
        error:
          skipped[0]?.reason ??
          "Nothing readable in that file. It should be a CSV exported from Relay.",
        skipped,
      },
      { status: 400 },
    );
  }

  // ---- Prove it's complete ------------------------------------------------
  const balance = checkBalanceChain(rows);
  if (!balance.ok && !body.allowGaps) {
    return NextResponse.json(
      {
        error: balance.reason,
        balance,
        // 409 rather than 400: the file is well-formed, it just isn't whole.
        // The client offers to import anyway; this is not a parse failure.
        needsConfirmation: true,
      },
      { status: 409 },
    );
  }

  // ---- Which account -----------------------------------------------------
  let accountId = body.accountId;
  if (!accountId) {
    const name = body.accountName?.trim() || "Relay — Business Checking";
    const { data: existing } = await admin
      .from("bank_accounts")
      .select("id")
      .eq("name", name)
      .limit(1)
      .maybeSingle();

    if (existing?.id) {
      accountId = existing.id as string;
    } else {
      const { data: created, error } = await admin
        .from("bank_accounts")
        .insert({ source: "manual", name, institution: "Relay" })
        .select("id")
        .single();
      if (error || !created) {
        return NextResponse.json(
          { error: "Could not create the account record.", detail: error?.message },
          { status: 500 },
        );
      }
      accountId = created.id as string;
    }
  }

  // ---- Drop what's already here ------------------------------------------
  //
  // Read the hashes we'd be inserting rather than relying on ON CONFLICT: the
  // unique index is partial (import_hash is not null), and inferring a partial
  // index through PostgREST's upsert is fragile enough that being explicit is
  // worth one extra query at these volumes.
  const hashes = rows.map((r) => r.importHash);
  const { data: seen } = await admin
    .from("bank_transactions")
    .select("import_hash")
    .eq("account_id", accountId)
    .in("import_hash", hashes);

  const already = new Set((seen ?? []).map((r) => r.import_hash as string));
  const fresh = rows.filter((r) => !already.has(r.importHash));

  // ---- Suggest categories -------------------------------------------------
  //
  // Lowest priority first, first match wins. That ordering is load-bearing:
  // "TRAN FEE" (10) has to beat "INTUIT" (90), because both rows say INTUIT in
  // the payee and only the reference distinguishes a fee from a deposit.
  const { data: rules } = await admin
    .from("category_rules")
    .select("id,pattern,category_id,match_type")
    .eq("active", true)
    .order("priority", { ascending: true })
    .order("created_at", { ascending: true });

  const active = (rules ?? []).filter((r) => r.match_type === "contains");

  const records = fresh.map((r) => {
    const text = matchText(r);
    const hit = active.find((rule) =>
      text.includes(String(rule.pattern).toLowerCase()),
    );
    return {
      account_id: accountId,
      posted_on: r.postedOn,
      amount_cents: r.amountCents,
      description: r.reference || r.payee,
      merchant: r.payee || null,
      import_hash: r.importHash,
      pending: r.pending,
      balance_after_cents: r.balanceAfterCents,
      category_id: hit?.category_id ?? null,
      category_source: hit ? "rule" : null,
      rule_id: hit?.id ?? null,
      // Deliberately absent: is_business and reviewed_at. A rule proposes a
      // category; it does not decide that something is a business expense.
      // The table's check constraint keeps those two in step.
    };
  });

  // ---- Write --------------------------------------------------------------
  //
  // Resilient insert, the house pattern: a deploy can land before its
  // migration, so if `pending` or `balance_after_cents` aren't there yet, drop
  // them and write what the schema does have rather than failing the import.
  let inserted = 0;
  let degraded = false;
  if (records.length > 0) {
    const { error } = await admin.from("bank_transactions").insert(records);
    if (error) {
      const lean = records.map(({ pending, balance_after_cents, ...rest }) => {
        void pending;
        void balance_after_cents;
        return rest;
      });
      const retry = await admin.from("bank_transactions").insert(lean);
      if (retry.error) {
        return NextResponse.json(
          { error: "Could not save those transactions.", detail: retry.error.message },
          { status: 500 },
        );
      }
      degraded = true;
    }
    inserted = records.length;
  }

  const suggested = records.filter((r) => r.category_id !== null).length;

  return NextResponse.json({
    ok: true,
    accountId,
    read: rows.length,
    imported: inserted,
    duplicates: rows.length - fresh.length,
    suggested,
    needsReview: inserted,
    unreadable: skipped,
    balance,
    degraded,
  });
}
