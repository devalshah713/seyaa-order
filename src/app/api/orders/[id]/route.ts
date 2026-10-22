import { NextRequest, NextResponse } from "next/server";
import { deleteOrder, listPartyNames, updateOrder } from "@/lib/memoStore";
import { ORDER_STATUSES, type OrderStatus } from "@/lib/memoFormat";
import { requireAdmin } from "@/lib/currentUser";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const VALID = new Set<string>(ORDER_STATUSES.map((s) => s.value));

function str(v: unknown, max = 120): string | undefined {
  return typeof v === "string" ? v.trim().slice(0, max) : undefined;
}
function num(v: unknown): number | undefined {
  if (v === undefined || v === null || v === "") return undefined;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(/[^0-9.]/g, ""));
  return isFinite(n) && n > 0 ? n : undefined;
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const params = await ctx.params;
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  // Only the fields actually sent are changed — the status dropdown on the
  // board sends nothing but a status.
  const patch: Record<string, unknown> = {};
  if (body.customer !== undefined) patch.customer = str(body.customer);
  if (body.productName !== undefined) patch.productName = str(body.productName);
  if (body.goldColor !== undefined) patch.goldColor = str(body.goldColor, 40);
  if (body.diamondCts !== undefined) patch.diamondCts = num(body.diamondCts) ?? 0;
  if (body.pcs !== undefined) patch.pcs = Math.round(num(body.pcs) ?? 1) || 1;
  if (body.stockNo !== undefined) patch.stockNo = (str(body.stockNo, 20) || "").toUpperCase();
  // The seller's own fields, edited from the order's page.
  if (body.size !== undefined) patch.size = str(body.size, 60);
  if (body.sieveSize !== undefined) patch.sieveSize = str(body.sieveSize, 60);
  if (body.instructions !== undefined) patch.instructions = str(body.instructions, 1000);
  if (body.status !== undefined) {
    if (!VALID.has(String(body.status))) {
      return NextResponse.json({ error: "Unknown status." }, { status: 400 });
    }
    patch.status = body.status as OrderStatus;
  }

  // The manufacturer and the design number are the owner's to set, so the
  // check is here and not only in the page that hides the boxes. Asked only
  // when one of the two is actually being sent, so the status dropdown that
  // everyone uses is not turned into an admin action.
  if (body.mfg !== undefined || body.designNo !== undefined) {
    const admin = await requireAdmin();
    if (!admin) {
      return NextResponse.json(
        { error: "Only an admin can set the manufacturer or the design number." },
        { status: 403 }
      );
    }
    if (body.mfg !== undefined) {
      const mfg = str(body.mfg, 80) || "";
      if (mfg) {
        // A manufacturer is a controlled list everywhere else in the portal,
        // and an order that names one nobody can find is an order nobody can
        // chase.
        try {
          const lists = await listPartyNames(["mfg"]);
          const names = (lists.mfg || []).map((e) => e.name);
          if (!names.includes(mfg)) {
            return NextResponse.json(
              { error: "Choose a manufacturer from the list." },
              { status: 400 }
            );
          }
        } catch (err) {
          return NextResponse.json(
            { error: err instanceof Error ? err.message : "Could not read the list." },
            { status: 503 }
          );
        }
      }
      patch.mfg = mfg;
    }
    if (body.designNo !== undefined) patch.designNo = (str(body.designNo, 60) || "").toUpperCase();
  }

  try {
    const order = await updateOrder(params.id, patch);
    if (!order) return NextResponse.json({ error: "Order not found." }, { status: 404 });
    return NextResponse.json({ order });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not save." },
      { status: 503 }
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const params = await ctx.params;
  try {
    const ok = await deleteOrder(params.id);
    if (!ok) return NextResponse.json({ error: "Order not found." }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not delete." },
      { status: 503 }
    );
  }
}
