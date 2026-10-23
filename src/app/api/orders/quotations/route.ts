// The quotation book's own API, under the order module.
//
// It sits at /api/orders/quotations on purpose: every path under /api/orders
// belongs to the `orders` module in access.ts, so exactly the people who can
// write orders can write quotations, and the money on them needs no permission
// of its own. That is what the owner asked for, and it is settled by the
// address rather than by a second rule somebody has to remember to keep in
// step.
//
// What is asked for here is what the seller has in hand: who it is for, what is
// being made, the gold, the size, the quantity, whether it is certified, his
// notes, the picture, and his own figures — the expected gold weight and a line
// per stone size.
//
// None of those figures is compulsory. They are a seller's best guess at what
// the piece takes, and a form that refuses him until he knows the sieve of
// every stone sends him back to WhatsApp, which is the thing this replaces.
//
// Two things are not his and are ignored even if sent: the price, and the
// labour rate. Both are part of the price, and the price is the owner's. They
// arrive later through /api/orders/quotations/[id]/price, which is also the
// approval.
import { NextRequest, NextResponse } from "next/server";
import { createQuotation, listPartyNames, listQuotations } from "@/lib/memoStore";
import {
  GOLD_DETAILS, isDiaCertification, todayInput, type DiaCertification,
} from "@/lib/memoFormat";
import { readQuoteLines } from "@/lib/quotationConfig";
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

// An uploaded picture comes back as a URL, and a browser has to be able to open
// it again later, so that is the one thing checked.
function isLink(v: string): boolean {
  return /^https?:\/\/\S+$/i.test(v);
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

  // His figures. Read, not refused: a blank weight and no stone lines is a
  // quotation the owner fills the figures in on, and that is allowed.
  const goldWt = str(body.goldWt, 20);
  const lines = readQuoteLines(body.lines);

  try {
    const quotation = await createQuotation({
      date: str(body.date, 10) || todayInput(),
      customerName,
      productName,
      category,
      subCategory: str(body.subCategory, 80),
      subSubCategory: str(body.subSubCategory, 80),
      goldDetails,
      size,
      pcs,
      diaCertification,
      notes: str(body.notes, 1000),
      photoPath,
      photoPublicId: str(body.photoPublicId, 200),
      // The figures describing the piece, as he sent them. These are what the
      // owner reads and corrects.
      goldWt,
      lines,
      // And the same figures again, kept as he sent them. Nothing afterwards
      // writes over this, so a corrected weight can always be held up beside
      // the one he estimated.
      sellerFigures: { goldWt, lines },
      // The labour rate is a choice of rate and a rate is part of the price, so
      // it is the owner's. Ignored from the body on purpose: a seller cannot
      // set it even by sending it.
      polkiLabour: false,
      // No approval yet, said as an empty list rather than as a missing field.
      // A missing field means a record from before approval was its own step,
      // and such a record is priced — see isQuotationPriced().
      pricings: [],
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
