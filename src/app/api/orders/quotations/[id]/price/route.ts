// The owner's half of a quotation: the stones, the expected gold weight, the
// labour rate and the price.
//
// Admin only, and refused here rather than merely left off the screen. The
// quotation's page hides the panel from a seller as a courtesy; this is the
// rule. A seller on the phone with a customer knows what the customer asked
// for and does not know how many stones of which sieve go into it, so these
// boxes are not his to fill and not his to send either.
//
// It can be done again. A customer argues about a price, so the owner comes
// back and prices the same quotation a second time; every pricing is recorded
// with who and when, the way an order's notes are, and the figures themselves
// are written over because the current price is the price.
import { NextRequest, NextResponse } from "next/server";
import { getQuotation, updateQuotation } from "@/lib/memoStore";
import {
  BLANK_QUOTE_LINE, QUOTE_SHAPES, hasQuoteContent, type QuotationLine,
  type QuotationPricing,
} from "@/lib/quotationConfig";
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

// The diamond lines, read the way the stock book's are: every box is text, and
// a line with nothing at all in it is dropped rather than stored empty.
function readLines(v: unknown): QuotationLine[] {
  if (!Array.isArray(v)) return [];
  return v
    .slice(0, 40)
    .map((raw): QuotationLine => {
      const l = (raw || {}) as Record<string, unknown>;
      const shape = str(l.shape, 40);
      return {
        ...BLANK_QUOTE_LINE,
        breakupWt: str(l.breakupWt, 20),
        pcs: str(l.pcs, 10),
        // Only a shape the order form would accept, so a quotation can never
        // name a shape the order it becomes would be refused for.
        shape: QUOTE_SHAPES.find((s) => s.toLowerCase() === shape.toLowerCase()) || "",
        sieve: str(l.sieve, 40),
        code: str(l.code, 40),
      };
    })
    .filter(hasQuoteContent);
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
          "Only the owner prices a quotation. Ask him to open it and put the " +
          "stones and the price on it.",
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
  // figure and be short by most of it.
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
      lines: readLines(body.lines),
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
