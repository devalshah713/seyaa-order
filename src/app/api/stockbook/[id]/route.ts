import { NextRequest, NextResponse } from "next/server";
import {
  deleteStockEntry, normalizeStockInput, updateStockEntry,
} from "@/lib/stockBookStore";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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

  try {
    const entry = await updateStockEntry(params.id, normalizeStockInput(body));
    if (!entry) return NextResponse.json({ error: "Entry not found." }, { status: 404 });
    return NextResponse.json({ entry });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not save the entry." },
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
    const ok = await deleteStockEntry(params.id);
    if (!ok) return NextResponse.json({ error: "Entry not found." }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not delete." },
      { status: 503 }
    );
  }
}
