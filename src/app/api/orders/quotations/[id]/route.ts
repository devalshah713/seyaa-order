// One quotation: its picture, and removing it.
//
// The price on a quotation is never edited. A different price is a different
// quotation, with its own number, which is the whole reason for keeping a book
// of them — so the only thing this changes is the reference picture.
//
// That one exists because the picture is optional when the price is given and
// compulsory on an order. A customer who rings up, is quoted, and then sends a
// photo an hour later must be able to have that photo put on the quotation; the
// alternative is retyping the whole thing on the order form.
import { NextRequest, NextResponse } from "next/server";
import { deleteQuotation, getQuotation, updateQuotation } from "@/lib/memoStore";
import { currentSession } from "@/lib/currentUser";
import { isQuotationPriced } from "@/lib/quotationConfig";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function str(v: unknown, max = 120): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

function isLink(v: string): boolean {
  return /^https?:\/\/\S+$/i.test(v);
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const session = await currentSession();
  if (!session) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const params = await ctx.params;
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const photoPath = str(body.photoPath, 500);
  if (!photoPath) {
    return NextResponse.json({ error: "Add the reference picture." }, { status: 400 });
  }
  if (!isLink(photoPath)) {
    return NextResponse.json(
      { error: "The reference picture did not upload. Try the picture again." },
      { status: 400 }
    );
  }

  try {
    // A quotation that has already become an order is finished with. Changing
    // its picture now would leave the quotation and the order it became saying
    // different things about the same piece.
    const existing = await getQuotation(params.id);
    if (!existing) {
      return NextResponse.json({ error: "Quotation not found." }, { status: 404 });
    }
    if (existing.orderId) {
      return NextResponse.json(
        {
          error:
            `Quotation ${existing.quotationNo} already became order ` +
            `${existing.orderNo || existing.orderId}, so it cannot be changed. ` +
            "Work on the order instead.",
        },
        { status: 409 }
      );
    }

    const quotation = await updateQuotation(params.id, {
      photoPath,
      photoPublicId: str(body.photoPublicId, 200),
    });
    if (!quotation) {
      return NextResponse.json({ error: "Quotation not found." }, { status: 404 });
    }
    return NextResponse.json({ quotation });
  } catch (err) {
    return NextResponse.json({ error: msg(err) }, { status: 503 });
  }
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const session = await currentSession();
  if (!session) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const params = await ctx.params;
  try {
    // The same reasoning as the picture: once it has become an order it is part
    // of that order's history, and the order links back to it.
    const existing = await getQuotation(params.id);
    if (!existing) {
      return NextResponse.json({ error: "Quotation not found." }, { status: 404 });
    }
    if (existing.orderId) {
      return NextResponse.json(
        {
          error:
            `Quotation ${existing.quotationNo} became order ` +
            `${existing.orderNo || existing.orderId}, so it cannot be deleted.`,
        },
        { status: 409 }
      );
    }

    // Who may remove one. The owner, always. A seller, only his own and only
    // before it has been priced: up to that point it is a question he has
    // asked and may withdraw, and after it there is a figure on it that the
    // owner worked out and somebody may have quoted to a customer.
    //
    // This had no check beyond being signed in, which meant any seller could
    // delete any other seller's quotation, priced or not.
    if (session.role !== "admin") {
      const mine = existing.enteredBy === session.username;
      if (!mine) {
        return NextResponse.json(
          { error: "Only the owner can delete somebody else's quotation." },
          { status: 403 }
        );
      }
      if (isQuotationPriced(existing)) {
        return NextResponse.json(
          { error: "This one has been priced. Ask the owner to delete it." },
          { status: 403 }
        );
      }
    }

    const gone = await deleteQuotation(params.id);
    if (!gone) return NextResponse.json({ error: "Quotation not found." }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: msg(err) }, { status: 503 });
  }
}

function msg(err: unknown): string {
  return err instanceof Error ? err.message : "Something went wrong.";
}
