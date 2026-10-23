// The owner approving a quotation and putting the price on it. One action, not
// two: saving it is the approval.
//
// What arrives here is the seller's figures as the owner has them after reading
// them — corrected where he was wrong, left alone where he was right — plus the
// two things that are the owner's own: which labour rate the piece is charged
// at, and the figure to tell the customer.
//
// Admin only, and refused here rather than merely left off the screen. The
// quotation's page hides the panel from a seller as a courtesy; this is the
// rule.
//
// It can be done again. A customer argues about a price, so the owner comes
// back and prices the same quotation a second time; every one is recorded with
// who and when, the way an order's notes are, and the figures themselves are
// written over because the current price is the price. What the seller first
// sent is in sellerFigures and is not among the fields a patch can name, so no
// correction here can reach it.
import { NextRequest, NextResponse } from "next/server";
import { getQuotation, updateQuotation } from "@/lib/memoStore";
import { readQuoteLines, type QuotationPricing } from "@/lib/quotationConfig";
import { requireAdmin } from "@/lib/currentUser";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function str(v: unknown, max = 120): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

function num(v: unknown): number {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(/[^0-9.]/g, ""));
  return isFinite(n) && n > 0 ? n : 0;
}

// A quoted figure, which may genuinely be nothing at all: a blank box means
// "nothing was written over the calculated figure", not nought rupees.
function figure(v: unknown): number | undefined {
  const raw = typeof v === "number" ? String(v) : str(v, 20);
  if (!raw.trim()) return undefined;
  const n = parseFloat(raw.replace(/[^0-9.]/g, ""));
  return isFinite(n) && n >= 0 ? n : undefined;
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json(
      {
        error:
          "Only the owner approves a quotation and puts the price on it. Ask " +
          "him to open it.",
      },
      { status: 403 }
    );
  }

  const params = await ctx.params;
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  // The gold and the labour are both charged on this, so a quotation without it
  // is a quotation priced on its stones alone — which would read as a real
  // figure and be short by most of it. Optional on the seller's form, because
  // he may not know it; not optional here, because the price depends on it.
  const goldWt = str(body.goldWt, 20);
  if (!num(goldWt)) {
    return NextResponse.json(
      { error: "Enter the expected gold weight in grams." },
      { status: 400 }
    );
  }

  try {
    const existing = await getQuotation(params.id);
    if (!existing) {
      return NextResponse.json({ error: "Quotation not found." }, { status: 404 });
    }
    // Already an order. The order is its own record from that moment, and a new
    // price here would leave the two saying different things about one piece.
    if (existing.orderId) {
      return NextResponse.json(
        {
          error:
            `Quotation ${existing.quotationNo} already became order ` +
            `${existing.orderNo || existing.orderId}, so its price cannot be ` +
            "changed. Work on the order instead.",
        },
        { status: 409 }
      );
    }

    const stamp: QuotationPricing = {
      id: crypto.randomUUID(),
      at: new Date().toISOString(),
      // Read off the signed session, never off the body.
      by: session.username,
    };

    const quotation = await updateQuotation(params.id, {
      goldWt,
      polkiLabour: body.polkiLabour === true,
      lines: readQuoteLines(body.lines),
      // What he is telling the customer. Left out altogether when nothing was
      // written over the calculated figure, so the quotation says "this is the
      // calculated price" rather than claiming a figure nobody chose.
      quotedUsd: figure(body.quotedUsd),
      quotedInr: figure(body.quotedInr),
      // Appended, not replaced: a re-price is a second hand on the record and
      // the first one is part of its history.
      pricings: [...(existing.pricings || []), stamp],
    });
    if (!quotation) {
      return NextResponse.json({ error: "Quotation not found." }, { status: 404 });
    }
    return NextResponse.json({ quotation });
  } catch (err) {
    return NextResponse.json({ error: msg(err) }, { status: 503 });
  }
}

function msg(err: unknown): string {
  return err instanceof Error ? err.message : "Something went wrong.";
}
