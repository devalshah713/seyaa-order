import { NextRequest, NextResponse } from "next/server";
import { createOrder, listOrders } from "@/lib/memoStore";
import { ORDER_STATUSES, type OrderStatus } from "@/lib/memoFormat";
import { currentSession } from "@/lib/currentUser";

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

export async function GET(): Promise<NextResponse> {
  try {
    return NextResponse.json({ orders: await listOrders() });
  } catch (err) {
    return NextResponse.json({ error: msg(err) }, { status: 503 });
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const productName = str(body.productName);
  if (!productName) {
    return NextResponse.json({ error: "Give the order a product name." }, { status: 400 });
  }
  const status = VALID.has(String(body.status)) ? (body.status as OrderStatus) : "in_production";

  // An opening note is optional; when given it is attributed like any other.
  const note = str(body.comment, 500);
  const session = await currentSession();

  try {
    const order = await createOrder(
      {
        customer: str(body.customer),
        productName,
        goldColor: str(body.goldColor, 40),
        diamondCts: num(body.diamondCts),
        pcs: Math.round(num(body.pcs)) || 1,
        stockNo: str(body.stockNo, 20).toUpperCase(),
        status,
      },
      note ? { text: note, by: session?.username || "unknown" } : undefined
    );
    return NextResponse.json({ order }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: msg(err) }, { status: 503 });
  }
}

function msg(err: unknown): string {
  return err instanceof Error ? err.message : "Something went wrong.";
}
