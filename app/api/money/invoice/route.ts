import { NextResponse } from "next/server";
import { getAdminClient } from "../../../../lib/supabaseAdmin";
import { parseSupplierInvoice, guessUse } from "../../../../lib/supplierInvoice";

// Turn a supplier order PDF into catalogue entries and stock.
//
// Two jobs, and the second is why this exists:
//
//   * Products she doesn't have yet are created, with their cost and a first
//     guess at whether they sell or go on the back bar.
//   * Every line becomes a 'received' movement, so stock on hand is real from
//     the first upload rather than after a counting session.
//
// It also explains a bank row that no rule ever could. `Premier Beauty Supply
// $247.37` is about $33 of colour and about $176 of retail stock; only the
// line items can divide it.
//
// Re-uploading the same order is a no-op. Dedupe is on the supplier's order
// number, which every one of these carries — unlike the bank CSV, where no
// such id exists and the hash had to be built from the row's contents.

export const runtime = "nodejs"; // pdf parsing, and node:crypto beneath it
export const maxDuration = 60;

const MAX_BYTES = 8 * 1024 * 1024;

/**
 * Pull the text layer out of a PDF.
 *
 * Two things here look like superstition and are not.
 *
 * The import is LAZY. Imported at module scope, a failure inside pdfjs takes
 * the whole route down before any of it runs — which is what happened: GET
 * returned 500 instead of 405, and an unauthenticated POST returned 500
 * instead of 401. A parsing library should not be able to break the door.
 *
 * The globals are STUBBED. pdfjs reaches for DOMMatrix, ImageData and Path2D
 * while initialising, and Node has never had them, so it threw
 * `ReferenceError: DOMMatrix is not defined` even from its own legacy build
 * with the package left external. Extracting text never touches any of them —
 * they exist for rendering to a canvas, which this does not do — so empty
 * shells are enough to get past the constructor. If a future version really
 * uses them, it will fail loudly here rather than silently produce nonsense.
 */
async function extractText(data: Buffer): Promise<string> {
  const g = globalThis as unknown as Record<string, unknown>;
  if (typeof g.DOMMatrix === "undefined") {
    g.DOMMatrix = class DOMMatrixStub {
      a = 1; b = 0; c = 0; d = 1; e = 0; f = 0;
      constructor(init?: number[]) {
        if (Array.isArray(init) && init.length >= 6) {
          [this.a, this.b, this.c, this.d, this.e, this.f] = init;
        }
      }
    };
  }
  if (typeof g.ImageData === "undefined") g.ImageData = class ImageDataStub {};
  if (typeof g.Path2D === "undefined") g.Path2D = class Path2DStub {};

  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data });
  try {
    return (await parser.getText()).text;
  } finally {
    await parser.destroy();
  }
}

export async function POST(req: Request) {
  const admin = getAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Server not configured." }, { status: 503 });
  }

  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!bearer) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const { data: userData } = await admin.auth.getUser(bearer);
  if (!userData?.user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "That PDF is too big." }, { status: 413 });
  }
  const supplier = String(form.get("supplier") ?? "Premier Beauty Supply").trim();

  // ---- Read it ------------------------------------------------------------
  let text: string;
  try {
    text = await extractText(Buffer.from(await file.arrayBuffer()));
  } catch (e) {
    return NextResponse.json(
      {
        error: "Couldn't read that PDF. Is it a supplier order?",
        detail: e instanceof Error ? e.message : String(e),
      },
      { status: 400 },
    );
  }

  const inv = parseSupplierInvoice(text);
  if (inv.lines.length === 0) {
    return NextResponse.json(
      { error: "No product lines found. Is it a supplier order?", skipped: inv.skipped },
      { status: 400 },
    );
  }

  // Refuse an invoice whose lines don't sum to its own subtotal — a dropped
  // line is money that then exists nowhere, and nothing downstream would
  // notice. Same rule as the bank import, and for the same reason.
  if (!inv.check.ok) {
    return NextResponse.json(
      {
        error:
          "The line items don't add up to this order's subtotal, so something " +
          "was misread. Nothing has been saved.",
        check: inv.check,
        skipped: inv.skipped,
      },
      { status: 409 },
    );
  }

  // ---- Already here? ------------------------------------------------------
  if (inv.orderRef) {
    const { count } = await admin
      .from("inventory_movements")
      .select("id", { count: "exact", head: true })
      .eq("invoice_ref", inv.orderRef);
    if ((count ?? 0) > 0) {
      return NextResponse.json({
        ok: true,
        alreadyImported: true,
        orderRef: inv.orderRef,
        lines: inv.lines.length,
        movements: 0,
        productsCreated: 0,
      });
    }
  }

  // ---- Match or create each product --------------------------------------
  const skus = inv.lines.map((l) => l.sku);
  const { data: known } = await admin
    .from("products")
    .select("id,sku")
    .eq("supplier", supplier)
    .in("sku", skus);

  const bySku = new Map<string, string>();
  for (const p of known ?? []) bySku.set(String(p.sku).toLowerCase(), String(p.id));

  const toCreate = inv.lines.filter((l) => !bySku.has(l.sku.toLowerCase()));

  // Collapse duplicate SKUs within one order — #891488 lists 240840 twice, at
  // different prices, which is a real thing suppliers do. One product, two
  // movements.
  const uniqueNew = new Map<string, (typeof toCreate)[number]>();
  for (const l of toCreate) {
    if (!uniqueNew.has(l.sku.toLowerCase())) uniqueNew.set(l.sku.toLowerCase(), l);
  }

  let productsCreated = 0;
  if (uniqueNew.size > 0) {
    const rows = [...uniqueNew.values()].map((l) => {
      const use = guessUse(l);
      return {
        sku: l.sku,
        supplier,
        brand: l.brand,
        name: l.description,
        unit_cost_cents: l.unitCostCents,
        sells_retail: use.sellsRetail,
        used_at_backbar: use.usedAtBackbar,
      };
    });
    const { data: made, error } = await admin.from("products").insert(rows).select("id,sku");
    if (error) {
      return NextResponse.json(
        { error: "Couldn't add those products.", detail: error.message },
        { status: 500 },
      );
    }
    for (const p of made ?? []) bySku.set(String(p.sku).toLowerCase(), String(p.id));
    productsCreated = made?.length ?? 0;
  }

  // ---- Book the stock -----------------------------------------------------
  //
  // Dated to when the supplier received the order rather than today, so a
  // backfilled invoice lands in the period it belongs to — which matters for
  // anything that groups by date, including the pre-opening startup bucket.
  const occurredOn = inv.receivedOn ?? new Date().toISOString().slice(0, 10);

  const movements = inv.lines
    .map((l) => {
      const productId = bySku.get(l.sku.toLowerCase());
      if (!productId) return null;
      return {
        product_id: productId,
        kind: "received" as const,
        quantity: l.quantity,
        unit_cost_cents: l.unitCostCents,
        occurred_on: occurredOn,
        invoice_ref: inv.orderRef,
        note: l.description.slice(0, 200),
      };
    })
    .filter((m): m is NonNullable<typeof m> => m !== null);

  const { error: movErr } = await admin.from("inventory_movements").insert(movements);
  if (movErr) {
    return NextResponse.json(
      { error: "Products were added, but the stock didn't save.", detail: movErr.message },
      { status: 500 },
    );
  }

  // Refresh the catalogue cost from this order, since it is newer than
  // whatever was there. History is safe — every movement carries the cost it
  // happened at.
  for (const l of inv.lines) {
    const id = bySku.get(l.sku.toLowerCase());
    if (id) {
      await admin
        .from("products")
        .update({ unit_cost_cents: l.unitCostCents })
        .eq("id", id);
    }
  }

  const backBarCents = inv.lines
    .filter((l) => guessUse(l).usedAtBackbar && !guessUse(l).sellsRetail)
    .reduce((t, l) => t + l.totalCents, 0);

  return NextResponse.json({
    ok: true,
    orderRef: inv.orderRef,
    receivedOn: inv.receivedOn,
    lines: inv.lines.length,
    productsCreated,
    productsMatched: inv.lines.length - productsCreated,
    movements: movements.length,
    subtotalCents: inv.subtotalCents,
    shippingCents: inv.shippingCents,
    taxCents: inv.taxCents,
    totalCents: inv.totalCents,
    backBarCents,
    skipped: inv.skipped,
  });
}
