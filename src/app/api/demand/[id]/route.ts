import { NextRequest, NextResponse } from "next/server";
import { updateDemand, deleteDemand, normalizeDemandInput } from "@/lib/demandStore";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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
  const input = normalizeDemandInput(body);
  if (!input.rows.length) {
    return NextResponse.json(
      { error: "Add at least one diamond row before saving." },
      { status: 400 }
    );
  }
  try {
    const demand = await updateDemand(params.id, input);
    if (!demand) return NextResponse.json({ error: "Demand not found." }, { status: 404 });
    return NextResponse.json({ demand });
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
    const ok = await deleteDemand(params.id);
    if (!ok) return NextResponse.json({ error: "Demand not found." }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not delete." },
      { status: 503 }
    );
  }
}
