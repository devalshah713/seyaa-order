// The quotation book's own API, under the order module.
//
// It sits at /api/orders/quotations on purpose: every path under /api/orders
// belongs to the `orders` module in access.ts, so exactly the people who can
// write orders can write quotations, and the money on them needs no permission
// of its own. That is what the owner asked for, and it is settled by the
// address rather than by a second rule somebody has to remember to keep in
// step.
import { NextRequest, NextResponse } from "next/server";
import { createQuotation, listPartyNames, listQuotations } from "@/lib/memoStore";
import {
  GOLD_DETAILS, isDiaCertification, todayInput, type DiaCertification,
} from "@/lib/memoFormat";
import {
  BLANK_QUOTE_LINE, QUOTE_SHAPES, hasQuoteContent, type QuotationLine,
} from "@/lib/quotationConfig";
import { currentSession } from "@/lib/currentUser";

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

// An uploaded picture comes back as a URL, and a browser has to be able to open
// it again later, so that is the one thing checked.
function isLink(v: string): boolean {
  return /^https?:\/\/\S+$/i.test(v);
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

export async function GET(): Promise<NextResponse> {
  try {
    return NextResponse.json({ quotations: await listQuotations() });
  } catch (err) {
    return NextResponse.json({ error: msg(err) }, { status: 503 });
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  // Who wrote the quotation is part of the record, so there is no saving one
  // without knowing. The browser never sends it and cannot change it.
  const session = await currentSession();
  if (!session) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  // Every one of these is checked here and not only in the page. The page can
  // be bypassed; this cannot.
  const customerName = str(body.customerName);
  if (!customerName) {
    return NextResponse.json(
      { error: "Write the customer's name, in words." },
      { status: 400 }
    );
  }

  const productName = str(body.productName);
  if (!productName) {
    return NextResponse.json(
      { error: "Write what is being made, in words." },
      { status: 400 }
    );
  }

  const category = str(body.category, 80);
  if (!category) {
    return NextResponse.json({ error: "Choose a category." }, { status: 400 });
  }

  const goldDetails = str(body.goldDetails, 40).toUpperCase();
  if (!goldDetails) {
    return NextResponse.json({ error: "Choose the gold details." }, { status: 400 });
  }
  if (!GOLD_DETAILS.includes(goldDetails)) {
    return NextResponse.json(
      { error: "Choose the gold details from the list." },
      { status: 400 }
    );
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

  const pcs = Math.round(num(body.pcs));
  if (pcs < 1) {
    return NextResponse.json(
      { error: "Enter the quantity in pieces. It must be a whole number, at least 1." },
      { status: 400 }
    );
  }

  const size = str(body.size, 60);
  if (!size) {
    return NextResponse.json(
      { error: "Enter the size, for example 7 INCH or US7." },
      { status: 400 }
    );
  }

  const certification = str(body.diaCertification, 20);
  if (!isDiaCertification(certification)) {
    return NextResponse.json(
      { error: "Choose whether the diamonds are certified." },
      { status: 400 }
    );
  }
  const diaCertification: DiaCertification = certification;

  // The picture is optional here, unlike on an order. What is not optional is
  // that a picture which was sent actually uploaded.
  const photoPath = str(body.photoPath, 500);
  if (photoPath && !isLink(photoPath)) {
    return NextResponse.json(
      { error: "The reference picture did not upload. Try the picture again." },
      { status: 400 }
    );
  }

  // The category is a controlled list, so a name that is not on it is a typo or
  // a hand-made request either way.
  let categories: string[];
  try {
    const lists = await listPartyNames(["category"]);
    categories = (lists.category || []).map((e) => e.name);
  } catch (err) {
    return NextResponse.json({ error: msg(err) }, { status: 503 });
  }
  if (!categories.includes(category)) {
    return NextResponse.json(
      { error: "Choose a category from the list." },
      { status: 400 }
    );
  }

  try {
    const quotation = await createQuotation({
      date: str(body.date, 10) || todayInput(),
      customerName,
      productName,
      category,
      subCategory: str(body.subCategory, 80),
      subSubCategory: str(body.subSubCategory, 80),
      goldDetails,
      goldWt,
      polkiLabour: body.polkiLabour === true,
      size,
      pcs,
      lines: readLines(body.lines),
      diaCertification,
      notes: str(body.notes, 1000),
      photoPath,
      photoPublicId: str(body.photoPublicId, 200),
      // What he told the customer. Kept as it was typed, and left out
      // altogether when nothing was typed over the calculated figure, so the
      // quotation says "this is the calculated price" rather than claiming a
      // figure nobody chose.
      quotedUsd: figure(body.quotedUsd),
      quotedInr: figure(body.quotedInr),
      // The stamp. Read off the signed session, never off the body.
      enteredBy: session.username,
    });
    return NextResponse.json({ quotation }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: msg(err) }, { status: 503 });
  }
}

function msg(err: unknown): string {
  return err instanceof Error ? err.message : "Something went wrong.";
}
