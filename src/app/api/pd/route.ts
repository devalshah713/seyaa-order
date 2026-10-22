import { NextRequest, NextResponse } from "next/server";
import { syncDesignRegisterQuietly } from "@/lib/designRegister";
import { createPdSheet, listPdSheets, nextPdNo, normalizePdInput } from "@/lib/pdStore";
import { getOrder, updateOrder } from "@/lib/memoStore";
import { approvalOf } from "@/lib/memoFormat";
import { currentSession } from "@/lib/currentUser";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    // ?next=<date> returns the predicted PD number for the live form.
    const nextFor = req.nextUrl.searchParams.get("next");
    if (nextFor !== null) {
      return NextResponse.json({ pdNo: await nextPdNo(nextFor) });
    }
    return NextResponse.json({ sheets: await listPdSheets() });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not load PD sheets." },
      { status: 503 }
    );
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const input = normalizePdInput(body);
  if (!input.sku && !input.product) {
    return NextResponse.json(
      { error: "Add at least a Product or SKU before saving." },
      { status: 400 }
    );
  }

  // A sheet started from an order carries the order it came from. Everything
  // about that order is checked here and not only on the page that offers the
  // button: the order has to exist, it has to be approved, and it must not
  // already have a sheet of its own.
  const fromOrderId = typeof body.fromOrderId === "string" ? body.fromOrderId.trim() : "";
  let fromOrder: { id: string; orderNo: string } | undefined;
  if (fromOrderId) {
    let order;
    try {
      order = await getOrder(fromOrderId);
    } catch (err) {
      return NextResponse.json({ error: msg(err) }, { status: 503 });
    }
    if (!order) {
      return NextResponse.json({ error: "That order could not be found." }, { status: 404 });
    }
    if (approvalOf(order) !== "approved") {
      return NextResponse.json(
        { error: "That order is not approved yet, so its PD sheet cannot be started." },
        { status: 400 }
      );
    }
    if (order.pdId) {
      return NextResponse.json(
        {
          error:
            `Order ${order.orderNo} already has PD sheet ${order.pdNo || order.pdId}. ` +
            "Open that sheet instead of starting a second one.",
        },
        { status: 409 }
      );
    }
    fromOrder = { id: order.id, orderNo: order.orderNo };
  }

  try {
    // Whose sheet it is comes from the session, not the request body.
    const session = await currentSession();
    const sheet = await createPdSheet(input, session?.username || "", fromOrder);
    // The order is marked with its PD number so either record finds the other.
    // Reported rather than swallowed if it fails: the sheet is already saved,
    // and it carries the order number on itself, so nothing is lost — but
    // somebody has to know the order was not marked.
    if (fromOrder) {
      try {
        await updateOrder(fromOrder.id, { pdId: sheet.id, pdNo: sheet.pdNo });
      } catch (err) {
        return NextResponse.json(
          {
            sheet,
            error:
              `PD sheet ${sheet.pdNo} was saved, but order ${fromOrder.orderNo} ` +
              `could not be marked with it: ${msg(err)}`,
          },
          { status: 207 }
        );
      }
    }
    // The Google Sheet is a copy of the register, so it is rewritten whenever
    // the register changes. Quietly: a design must save whether Google answers
    // or not.
    await syncDesignRegisterQuietly();
    return NextResponse.json({ sheet });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not save the PD sheet." },
      { status: 503 }
    );
  }
}

function msg(err: unknown): string {
  return err instanceof Error ? err.message : "Something went wrong.";
}
