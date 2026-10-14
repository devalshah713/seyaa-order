import { NextRequest, NextResponse } from "next/server";
import {
  deleteQcRecord, normalizeQcInput, qcLinesOf, updateQcRecord,
} from "@/lib/qcStore";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Just the checks of one record.
//
// The QC list sends rows without their lines, because fifteen checks a record
// across a few hundred records is most of the page and the detail table is
// collapsed. Opening one row asks for that one record's checks here instead.
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const params = await ctx.params;
  try {
    const lines = await qcLinesOf(params.id);
    if (!lines) return NextResponse.json({ error: "QC record not found." }, { status: 404 });
    return NextResponse.json({ lines });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not read the QC." },
      { status: 503 }
    );
  }
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
  try {
    const record = await updateQcRecord(params.id, normalizeQcInput(body));
    if (!record) return NextResponse.json({ error: "QC record not found." }, { status: 404 });
    return NextResponse.json({ record });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not save the QC." },
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
    const ok = await deleteQcRecord(params.id);
    if (!ok) return NextResponse.json({ error: "QC record not found." }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not delete." },
      { status: 503 }
    );
  }
}
