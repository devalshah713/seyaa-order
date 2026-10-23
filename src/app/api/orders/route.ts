import { NextRequest, NextResponse } from "next/server";
import {
  createOrder, getQuotation, listOrders, listPartyNames, updateQuotation,
} from "@/lib/memoStore";
import {
  GOLD_DETAILS, ORDER_STATUSES, isDiaCertification,
  type DiaCertification, type OrderStatus,
} from "@/lib/memoFormat";
import { formatShapes, parseShapes } from "@/lib/pdConfig";
import { currentSession } from "@/lib/currentUser";
import { approvalStartFor, approvalStartNote } from "@/lib/orderApproval";
import { orderFromQuotation } from "@/lib/quotationToOrder";
import type { Quotation } from "@/lib/quotationConfig";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const VALID = new Set<string>(ORDER_STATUSES.map((s) => s.value));

function str(v: unknown, max = 120): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}
function num(v: unknown): number {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(/[^0-9.]/g, ""));
  return isFinite(n) && n > 0 ? n : 0;
}

// An uploaded picture comes back as a URL, and a browser has to be able to
// open it again later, so that is the one thing checked.
function isLink(v: string): boolean {
  return /^https?:\/\/\S+$/i.test(v);
}

export async function GET(): Promise<NextResponse> {
  try {
    return NextResponse.json({ orders: await listOrders() });
  } catch (err) {
    return NextResponse.json({ error: msg(err) }, { status: 503 });
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  // Who entered the order is part of the record, so there is no saving one
  // without knowing. The browser never sends it and cannot change it.
  const session = await currentSession();
  if (!session) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  // An order can arrive two ways, and only two: written on the order form, or
  // made from a quotation the customer accepted.
  //
  // A quotation's order is built from the stored quotation and never from what
  // the browser sends, so an order cannot be made to say something the
  // quotation does not. Everything below then runs over whichever of the two it
  // is, unchanged — the same checks, the same number, the same stamp and the
  // same approval chain. That is what "through the same path a seller's order
  // takes" has to mean to be worth anything.
  const fromQuotationId = str(body.fromQuotationId, 40);
  let quotation: Quotation | null = null;
  let src: Record<string, unknown> = body;
  let madeFrom = "";

  if (fromQuotationId) {
    try {
      quotation = await getQuotation(fromQuotationId);
    } catch (err) {
      return NextResponse.json({ error: msg(err) }, { status: 503 });
    }
    if (!quotation) {
      return NextResponse.json(
        { error: "That quotation could not be found." },
        { status: 404 }
      );
    }
    // Already accepted once. Said in full, with the order's own number, because
    // the answer somebody wants here is which order it became.
    if (quotation.orderId) {
      return NextResponse.json(
        {
          error:
            `Quotation ${quotation.quotationNo} already became order ` +
            `${quotation.orderNo || quotation.orderId}. Open that order instead ` +
            "of writing a second one.",
        },
        { status: 409 }
      );
    }
    const made = orderFromQuotation(quotation);
    if (!made.ok) return NextResponse.json({ error: made.error }, { status: 400 });
    src = made.body as unknown as Record<string, unknown>;
    madeFrom = `Made from quotation ${quotation.quotationNo}.`;
  }

  // Every one of these is checked here and not only in the page. The page can
  // be bypassed; this cannot.
  const productName = str(src.productName);
  if (!productName) {
    return NextResponse.json(
      { error: "Write what is being made, in words." },
      { status: 400 }
    );
  }

  const category = str(src.category, 80);
  if (!category) {
    return NextResponse.json({ error: "Choose a category." }, { status: 400 });
  }

  const goldColor = str(src.goldColor, 40).toUpperCase();
  if (!goldColor) {
    return NextResponse.json({ error: "Choose the gold details." }, { status: 400 });
  }
  if (!GOLD_DETAILS.includes(goldColor)) {
    return NextResponse.json(
      { error: "Choose the gold details from the list." },
      { status: 400 }
    );
  }

  const pcs = Math.round(num(src.pcs));
  if (pcs < 1) {
    return NextResponse.json(
      { error: "Enter the quantity in pieces. It must be a whole number, at least 1." },
      { status: 400 }
    );
  }

  const size = str(src.size, 60);
  if (!size) {
    return NextResponse.json(
      { error: "Enter the size, for example 7 INCH or US7." },
      { status: 400 }
    );
  }

  // One shape or several: a piece set with round and pear is one order, not
  // two. Read through the same parser the form writes them with, so anything
  // that is not a shape on the list falls out here rather than being stored.
  const shapes = parseShapes(str(src.diaShape, 200));
  if (!shapes.length) {
    return NextResponse.json(
      { error: "Tick at least one diamond shape." },
      { status: 400 }
    );
  }
  const diaShape = formatShapes(shapes);

  const diamondCts = num(src.diamondCts);
  if (!diamondCts) {
    return NextResponse.json(
      { error: "Enter the approximate diamond weight in carats." },
      { status: 400 }
    );
  }

  // Certified or not: a design is one or the other, and the factory has to be
  // told which. Compulsory here as well as on the form, like every other
  // compulsory box, and it changes no figure — see DiaCertification.
  const diaCertificationRaw = str(src.diaCertification, 20);
  if (!isDiaCertification(diaCertificationRaw)) {
    return NextResponse.json(
      { error: "Choose whether the diamonds are certified." },
      { status: 400 }
    );
  }
  const diaCertification: DiaCertification = diaCertificationRaw;

  const photoPath = str(src.photoPath, 500);
  if (!photoPath) {
    return NextResponse.json(
      { error: "Add the reference picture." },
      { status: 400 }
    );
  }
  if (!isLink(photoPath)) {
    return NextResponse.json(
      { error: "The reference picture did not upload. Try the picture again." },
      { status: 400 }
    );
  }

  // The category is a controlled list, so a name that is not on it is a typo
  // or a hand-made request either way.
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

  const status = VALID.has(String(src.status)) ? (src.status as OrderStatus) : "in_production";

  // An opening note is optional; when given it is attributed like any other.
  const note = str(body.comment, 500);

  // Who signs this off, and in what order. Worked out from the firm's own
  // shape, read off the seller's account and never from the request: an order
  // cannot be saved as already approved by sending the right field.
  // See approvalStartFor().
  let start;
  try {
    start = await approvalStartFor(session);
  } catch (err) {
    return NextResponse.json({ error: msg(err) }, { status: 503 });
  }

  try {
    const order = await createOrder(
      {
        customer: str(src.customer),
        productName,
        goldColor,
        diamondCts,
        pcs,
        stockNo: str(body.stockNo, 20).toUpperCase(),
        status,
        category,
        subCategory: str(src.subCategory, 80),
        subSubCategory: str(src.subSubCategory, 80),
        size,
        diaShape,
        sieveSize: str(src.sieveSize, 60),
        stonePcs: Math.round(num(src.stonePcs)) || undefined,
        diaCertification,
        instructions: str(src.instructions, 1000),
        photoPath,
        photoPublicId: str(src.photoPublicId, 200),
        driveLink: "",
        // The stamp. Read off the signed session, never off the body — a
        // request that sends its own enteredBy is ignored, because nothing
        // here looks at it.
        enteredBy: session.username,
        // Saved in full whoever writes it, and numbered whoever writes it.
        // The only difference is who it is sitting with afterwards.
        ...start,
        sentBackReason: "",
        // The owner assigns these afterwards on the order's own page, and
        // only he can. A seller's save never carries them.
        mfg: "",
        designNo: "",
        // Where it came from, when it came from a price somebody was given.
        fromQuotationId: quotation?.id || "",
        fromQuotationNo: quotation?.quotationNo || "",
      },
      // The opening note says where it has gone, and where it came from, so the
      // trail starts with both.
      {
        text: [approvalStartNote(start, false), madeFrom, note].filter(Boolean).join(" "),
        by: session.username,
      }
    );

    // The quotation is marked with the order it became, so either record finds
    // the other and the quotation never offers to make a second.
    //
    // Reported rather than swallowed if it fails: the order is already saved and
    // carries the quotation number on itself, so nothing is lost, but somebody
    // has to know the quotation was not marked. The same reasoning, and the same
    // 207, as a PD sheet started from an order.
    if (quotation) {
      try {
        await updateQuotation(quotation.id, { orderId: order.id, orderNo: order.orderNo });
      } catch (err) {
        return NextResponse.json(
          {
            order,
            error:
              `Order ${order.orderNo} was saved, but quotation ` +
              `${quotation.quotationNo} could not be marked with it: ${msg(err)}`,
          },
          { status: 207 }
        );
      }
    }
    return NextResponse.json({ order }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: msg(err) }, { status: 503 });
  }
}

function msg(err: unknown): string {
  return err instanceof Error ? err.message : "Something went wrong.";
}
