import { NextRequest, NextResponse } from "next/server";
import { deleteOrder, updateOrder } from "@/lib/memoStore";
import { ORDER_STATUSES, type OrderStatus } from "@/lib/memoFormat";

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
  { params }: { params: { id: string } }
): Promise<NextResponse> {
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
  if (body.status !== undefined) {
    if (!VALID.has(String(body.status))) {
      return NextResponse.json({ error: "Unknown status." }, { status: 400 });
    }
    patch.status = body.status as OrderStatus;
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
  { params }: { params: { id: string } }
): Promise<NextResponse> {
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
