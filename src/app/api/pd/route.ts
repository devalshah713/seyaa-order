import { NextRequest, NextResponse } from "next/server";
import { syncDesignRegisterQuietly } from "@/lib/designRegister";
import {
  createPdSheet, listPdSheets, nextPdNo, normalizePdInput, peekDesignNo,
  type DesignTake,
} from "@/lib/pdStore";
import { planDesignNo } from "@/lib/designCounter";
import { getOrder, updateOrder } from "@/lib/memoStore";
import { approvalOf } from "@/lib/memoFormat";
import { currentSession } from "@/lib/currentUser";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    // ?next=<date> returns the predicted PD number for the live form, and with
    // a category and a gold colour the design number that sheet would be given.
    //
    // Both are previews and neither is a reservation: the save takes its own
    // numbers inside its own transaction. Two people on the form at once both
    // see 297, and only the one who saves first gets it.
    const params = req.nextUrl.searchParams;
    const nextFor = params.get("next");
    if (nextFor !== null) {
      return NextResponse.json({
        pdNo: await nextPdNo(nextFor),
        design: await designPreview(
          params.get("category") || "",
          params.get("gold") || "",
          Number(params.get("pieces") || "1")
        ),
      });
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

  // Where the design number comes from, decided here and not in the browser.
  //
  // A sheet that arrives with a number keeps it: that is a number typed by
  // hand, which is how the other colour of a design reuses its number, and how
  // an old design, a correction or a number from before the portal is written.
  // A sheet that arrives without one, having asked for the next number, is
  // given it off its category's counter by the save itself.
  //
  // The category's code and the gold colour are read on the server. The form
  // shows the code it is about to use so a wrong one is seen before the sheet
  // is saved, but what the form shows has no say in what is written.
  let design: DesignTake | undefined;
  if (!input.sku && body.designAuto === true) {
    let plan;
    try {
      plan = await planDesignNo(input.category, input.goldColor);
    } catch (err) {
      return NextResponse.json({ error: msg(err) }, { status: 503 });
    }
    if (!plan.ok) {
      // Said rather than saved: a sheet with half a number on it would be worse
      // than a sheet that was refused.
      return NextResponse.json({ error: plan.why }, { status: 400 });
    }
    design = { code: plan.code, colour: plan.colour, pieces: piecesWanted(body) };
  }

  try {
    // Whose sheet it is comes from the session, not the request body.
    const session = await currentSession();
    const sheet = await createPdSheet(input, session?.username || "", fromOrder, design);
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

// How many pieces the run covers, which is how many numbers the save consumes.
// One unless the form says otherwise; the store holds it to the four hundred
// the piece list tracks.
function piecesWanted(body: Record<string, unknown>): number {
  const n = Number(body.designPieces);
  return isFinite(n) && n >= 1 ? Math.round(n) : 1;
}

// What the next design number for a category would be, said the way the form
// shows it: the code it is about to use, the number, and when it cannot be
// built, why not.
export type DesignPreview = {
  code: string;
  colour: string;
  sku: string;
  why: string;
};

async function designPreview(
  category: string,
  gold: string,
  pieces: number
): Promise<DesignPreview> {
  if (!category.trim() && !gold.trim()) {
    return { code: "", colour: "", sku: "", why: "" };
  }
  const plan = await planDesignNo(category, gold);
  if (!plan.ok) return { code: plan.code, colour: "", sku: "", why: plan.why };
  const run = await peekDesignNo(plan.code, plan.colour, pieces);
  return { code: plan.code, colour: plan.colour, sku: run.sku, why: "" };
}
