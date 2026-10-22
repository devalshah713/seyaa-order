import { NextRequest, NextResponse } from "next/server";
import { createOrder, listOrders, listPartyNames } from "@/lib/memoStore";
import { GOLD_DETAILS, ORDER_STATUSES, type OrderStatus } from "@/lib/memoFormat";
import { formatShapes, parseShapes } from "@/lib/pdConfig";
import { currentSession } from "@/lib/currentUser";
import { managerOf } from "@/lib/userStore";

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

  // Every one of these is checked here and not only in the page. The page can
  // be bypassed; this cannot.
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

  const goldColor = str(body.goldColor, 40).toUpperCase();
  if (!goldColor) {
    return NextResponse.json({ error: "Choose the gold details." }, { status: 400 });
  }
  if (!GOLD_DETAILS.includes(goldColor)) {
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

  // One shape or several: a piece set with round and pear is one order, not
  // two. Read through the same parser the form writes them with, so anything
  // that is not a shape on the list falls out here rather than being stored.
  const shapes = parseShapes(str(body.diaShape, 200));
  if (!shapes.length) {
    return NextResponse.json(
      { error: "Tick at least one diamond shape." },
      { status: 400 }
    );
  }
  const diaShape = formatShapes(shapes);

  const diamondCts = num(body.diamondCts);
  if (!diamondCts) {
    return NextResponse.json(
      { error: "Enter the approximate diamond weight in carats." },
      { status: 400 }
    );
  }

  const photoPath = str(body.photoPath, 500);
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

  const status = VALID.has(String(body.status)) ? (body.status as OrderStatus) : "in_production";

  // An opening note is optional; when given it is attributed like any other.
  const note = str(body.comment, 500);

  // Who, if anyone, signs this off first. Read from the seller's own account,
  // never from the request: an order cannot be saved as already approved by
  // sending the right field.
  //
  // Whether there is a manager or not, the order still needs the owner's
  // approval afterwards, so nothing is approved on the way in any more.
  let manager: { id: string; username: string } | null = null;
  try {
    manager = await managerOf(session.uid);
  } catch (err) {
    return NextResponse.json({ error: msg(err) }, { status: 503 });
  }

  try {
    const order = await createOrder(
      {
        customer: str(body.customer),
        productName,
        goldColor,
        diamondCts,
        pcs,
        stockNo: str(body.stockNo, 20).toUpperCase(),
        status,
        category,
        subCategory: str(body.subCategory, 80),
        subSubCategory: str(body.subSubCategory, 80),
        size,
        diaShape,
        sieveSize: str(body.sieveSize, 60),
        stonePcs: Math.round(num(body.stonePcs)) || undefined,
        instructions: str(body.instructions, 1000),
        photoPath,
        photoPublicId: str(body.photoPublicId, 200),
        driveLink: "",
        // The stamp. Read off the signed session, never off the body — a
        // request that sends its own enteredBy is ignored, because nothing
        // here looks at it.
        enteredBy: session.username,
        // Saved in full either way, numbered either way. The only difference
        // is which of the two stages it starts at.
        approval: "waiting",
        stage: manager ? "manager" : "owner",
        approverId: manager?.id || "",
        approverName: manager?.username || "",
        sentBackReason: "",
        // The owner assigns these afterwards on the order's own page, and
        // only he can. A seller's save never carries them.
        mfg: "",
        designNo: "",
      },
      note ? { text: note, by: session.username } : undefined
    );
    return NextResponse.json({ order }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: msg(err) }, { status: 503 });
  }
}

function msg(err: unknown): string {
  return err instanceof Error ? err.message : "Something went wrong.";
}
